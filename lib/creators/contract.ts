/**
 * Native e-signature for creator contracts (server only).
 *
 * Built to meet US ESIGN / UETA:
 *   - Consent to electronic records: the creator ticks CONSENT_CHECKBOX_LABEL
 *     after seeing CONSENT_DISCLOSURE; the version + hash of that text are
 *     stored with the signature.
 *   - Intent: adopting a signature by typing their full legal name (rendered
 *     in the SIGNATURE_FONT script, DocuSign style) and pressing "Adopt and sign".
 *   - Attribution: signer id comes from the session token; email, IP, user
 *     agent and timestamps (UTC + creator timezone) are recorded.
 *   - Tamper-evident retention: the template's SHA-256 is fixed at send time
 *     and re-checked at signing; the final PDF (original pages + signature
 *     page + audit certificate) is hashed, stored write-once in Storage, and
 *     the hash is kept on the creator doc, in an append-only
 *     contract_events log, and in the emails sent to both parties.
 *
 * Firestore
 *   ContentCreators/{id}.contract                CreatorContract
 *   ContentCreators/{id}/contract_events/{auto}  ContractEvent (create() only, never updated)
 *   Settings/creator_contracts                   ContractSettings (+ current_template_version)
 *   CreatorContractTemplates/{version}           ContractTemplate (create() only; versions are immutable)
 * Storage
 *   contracts/founder_signature.png              optional drawn/uploaded countersignature
 *                                                (default: founder name typed in SIGNATURE_FONT)
 * Repo
 *   lib/creators/fonts/GreatVibes-Regular.ttf    SIGNATURE_FONT (SIL OFL 1.1, see OFL.txt; traced
 *                                                into the sign route via next.config outputFileTracingIncludes)
 *   contracts/templates/<version>.pdf            uploaded template PDFs (write-once)
 *   creators/<id>/contract/signed-v1-<stamp>.pdf signed contract (write-once)
 */
import { notifyFounder } from "@/lib/staff";
import { createHash, randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { getStorage } from "firebase-admin/storage";
import type { DocumentData } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { waitUntil } from "@vercel/functions";
import { emailConfigured, sendEmail } from "@/lib/email";
import { SYSTEM_FOOTER, SYSTEM_FROM_NAME } from "./invite";
import { CREATORS_COLLECTION, CreatorDataError, DEFAULT_TIMEZONE, STORAGE_BUCKET, markContractStepDone } from "./db";
import { adoptedSignatureText } from "./signature";
import { isValidTimezone } from "./time";
import { signerAuthText, type SignerAuth } from "./signer-auth";
import { notify, PUSH_COPY } from "@/lib/push";
import type { ContractAudit, ContractEvent, ContractSettings, ContractTemplate, CreatorContract } from "./types";

export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------- templates
//
// The founder uploads each contract version from admin (version label + PDF).
// Versions are immutable: a new contract = a new label. The PDF that used to
// be linked publicly (public/careers/paid-creator-intern-contract.pdf) is
// listed only as a DRAFT placeholder "v0" and can never be sent.

const TEMPLATES_COLLECTION = "CreatorContractTemplates";
export const PLACEHOLDER_TEMPLATE = {
  version: "v0",
  title: "Content Creator Agreement (DRAFT placeholder, can't be sent)",
  public_url: "/careers/paid-creator-intern-contract.pdf",
} as const;
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const MAX_TEMPLATE_BYTES = 3 * 1024 * 1024;
const templateCache = new Map<string, Buffer>();

function toTemplate(version: string, d: DocumentData): ContractTemplate {
  return {
    version,
    title: String(d.title || "Content Creator Agreement"),
    sha256: String(d.sha256 ?? ""),
    storage_path: String(d.storage_path ?? ""),
    pages: Number(d.pages ?? 0),
    bytes: Number(d.bytes ?? 0),
    uploaded_at: String(d.uploaded_at ?? ""),
  };
}

export async function listTemplates(): Promise<ContractTemplate[]> {
  const snap = await fdb().collection(TEMPLATES_COLLECTION).get();
  return snap.docs.map((d) => toTemplate(d.id, d.data())).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
}

export async function getTemplate(version: string): Promise<ContractTemplate | null> {
  if (!version || !VERSION_RE.test(version)) return null;
  const snap = await fdb().collection(TEMPLATES_COLLECTION).doc(version).get();
  return snap.exists ? toTemplate(snap.id, snap.data()!) : null;
}

/** The template "Send contract" will use, or null if none uploaded / selected. */
export async function currentTemplate(): Promise<ContractTemplate | null> {
  const s = await getContractSettings();
  return s.current_template_version ? getTemplate(s.current_template_version) : null;
}

/** Template bytes, verified against the SHA-256 recorded at upload. */
export async function templateBytes(version: string): Promise<{ template: ContractTemplate; bytes: Buffer }> {
  const template = await getTemplate(version);
  if (!template) throw new CreatorDataError(`Contract version ${version} not found`, 409);
  let buf = templateCache.get(version);
  if (!buf) {
    [buf] = await bucket().file(template.storage_path).download();
    templateCache.set(version, buf);
  }
  if (sha256Hex(buf) !== template.sha256) {
    templateCache.delete(version);
    throw new CreatorDataError("The contract file failed its integrity check. Message us on Slack and we'll send it again.", 409);
  }
  return { template, bytes: buf };
}

/** Admin: upload a new contract version. Becomes the current version. */
export async function uploadTemplate(input: { version: string; title?: string; pdf: Buffer }): Promise<ContractTemplate> {
  const version = String(input.version ?? "").trim();
  if (!VERSION_RE.test(version)) throw new CreatorDataError("Version label: letters, numbers, dots, dashes (e.g. v1 or 2026-10)");
  if (version.toLowerCase() === PLACEHOLDER_TEMPLATE.version) throw new CreatorDataError("v0 is the draft placeholder. Pick another label, e.g. v1.");
  const title = String(input.title ?? "").trim().replace(/\s+/g, " ") || "Content Creator Agreement";
  if (title.length > 120) throw new CreatorDataError("Title is too long");
  const pdf = input.pdf;
  if (!pdf?.length || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new CreatorDataError("Upload a PDF file");
  if (pdf.length > MAX_TEMPLATE_BYTES) throw new CreatorDataError("PDF is over 3MB");
  let pages = 0;
  try {
    const doc = await PDFDocument.load(pdf);
    pages = doc.getPageCount();
  } catch {
    throw new CreatorDataError("That PDF couldn't be read (is it password-protected?). Export it again and retry.");
  }
  if (!pages) throw new CreatorDataError("That PDF has no pages");
  const ref = fdb().collection(TEMPLATES_COLLECTION).doc(version);
  if ((await ref.get()).exists) throw new CreatorDataError(`Version ${version} already exists. Versions can't be replaced; use a new label.`, 409);
  const storage_path = `contracts/templates/${version}.pdf`;
  const sha256 = sha256Hex(pdf);
  try {
    await bucket().file(storage_path).save(pdf, {
      contentType: "application/pdf",
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { metadata: { sha256, version } },
    });
  } catch (e) {
    if ((e as { code?: number }).code === 412) throw new CreatorDataError(`A file for ${version} already exists. Use a new label.`, 409);
    throw e;
  }
  const t: ContractTemplate = { version, title, sha256, storage_path, pages, bytes: pdf.length, uploaded_at: new Date().toISOString() };
  await ref.create(t);
  await fdb().collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).set({ current_template_version: version, updated_at: t.uploaded_at }, { merge: true });
  return t;
}

/** Admin: choose which uploaded version "Send contract" uses. */
export async function setCurrentTemplate(version: string): Promise<ContractSettings> {
  if (!(await getTemplate(version))) throw new CreatorDataError("Unknown version", 404);
  await fdb().collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).set({ current_template_version: version, updated_at: new Date().toISOString() }, { merge: true });
  return getContractSettings();
}

// ---------------------------------------------------------------- consent

export const CONSENT_TEXT_VERSION = "esign-consent-v2";
export const CONSENT_CHECKBOX_LABEL = "I agree to use electronic records and signatures.";
export const CONSENT_DISCLOSURE =
  "By ticking this box, you agree that KESHAH can give you this agreement and any records about it electronically, " +
  "and that typing your name to adopt a signature and pressing Adopt and sign is your signature, just like signing on paper. " +
  "You can ask for a paper copy at any time, free of charge, by emailing contact@keshah.com. " +
  "If you'd rather not sign electronically, don't tick the box and email us instead, and we'll sort out a paper copy. " +
  "To open and keep these records you need a device that can open PDF files and an email address. " +
  "A copy of the signed agreement is emailed to you, and you can download it from the Contract tab whenever you need it.";
export const CONSENT_TEXT_SHA256 = sha256Hex(`${CONSENT_CHECKBOX_LABEL}\n\n${CONSENT_DISCLOSURE}`);

// ---------------------------------------------------------------- adopted (typed) signatures
//
// DocuSign-style "adopt a signature": the signer's typed full name is drawn
// in a handwriting font. Both the creator and the founder sign this way; the
// founder can override with a drawn/uploaded PNG.

/** Google Fonts family (SIL OFL 1.1). The portal + admin preview load the same family. */
export const SIGNATURE_FONT = "Great Vibes";
export const SIGNATURE_STYLE = `${SIGNATURE_FONT} typed`;
export const SIGNATURE_FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap";
const SIGNATURE_FONT_FILE = path.join(process.cwd(), "lib", "creators", "fonts", "GreatVibes-Regular.ttf");
let signatureFontBytes: Buffer | null = null;

function loadSignatureFont(): Buffer {
  if (!signatureFontBytes) signatureFontBytes = readFileSync(SIGNATURE_FONT_FILE);
  return signatureFontBytes;
}

// ---------------------------------------------------------------- firestore / storage

const SETTINGS_COLLECTION = "Settings";
const SETTINGS_DOC = "creator_contracts";
export const FOUNDER_SIGNATURE_PATH = "contracts/founder_signature.png";
const DEFAULT_SETTINGS: ContractSettings = {
  founder_name: "Aaditya Agrawal",
  founder_title: "Founder & CEO",
  entity_name: "KESHAH, Inc.",
};

function fdb() {
  return getFirebaseAdmin().db;
}
function creatorRef(id: string) {
  return fdb().collection(CREATORS_COLLECTION).doc(id);
}
function bucket() {
  return getStorage(getFirebaseAdmin().app).bucket(STORAGE_BUCKET);
}

/** Firestore rejects `undefined`; drop those keys (values here are plain JSON). */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export async function logEvent(id: string, ev: ContractEvent): Promise<void> {
  await creatorRef(id).collection("contract_events").doc().create(clean(ev));
}

export async function listContractEvents(id: string): Promise<(ContractEvent & { id: string })[]> {
  const snap = await creatorRef(id).collection("contract_events").get();
  return snap.docs
    .map((d) => ({ ...(d.data() as ContractEvent), id: d.id }))
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
}

// ---------------------------------------------------------------- settings

export async function getContractSettings(): Promise<ContractSettings> {
  const snap = await fdb().collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).get();
  const d = snap.exists ? snap.data()! : {};
  return {
    founder_name: String(d.founder_name || DEFAULT_SETTINGS.founder_name),
    founder_title: String(d.founder_title || DEFAULT_SETTINGS.founder_title),
    entity_name: String(d.entity_name || DEFAULT_SETTINGS.entity_name),
    ...(d.signature_path ? { signature_path: String(d.signature_path) } : {}),
    ...(d.signature_sha256 ? { signature_sha256: String(d.signature_sha256) } : {}),
    ...(d.signature_updated_at ? { signature_updated_at: String(d.signature_updated_at) } : {}),
    ...(d.use_drawn_signature === true ? { use_drawn_signature: true } : {}),
    ...(d.founder_signature_adopted_at ? { founder_signature_adopted_at: String(d.founder_signature_adopted_at) } : {}),
    ...(d.founder_signature_adopted_text ? { founder_signature_adopted_text: String(d.founder_signature_adopted_text) } : {}),
    ...(d.updated_at ? { updated_at: String(d.updated_at) } : {}),
    ...(d.current_template_version ? { current_template_version: String(d.current_template_version) } : {}),
  };
}

/** The countersignature that will go on contracts signed now, or null if the founder hasn't set one up. */
export function founderSignatureMode(s: ContractSettings): "drawn" | "typed" | null {
  if (s.use_drawn_signature && s.signature_path) return "drawn";
  if (s.founder_signature_adopted_at && s.founder_signature_adopted_text && s.founder_signature_adopted_text === s.founder_name.trim()) return "typed";
  return null;
}

export function contractSettingsReady(s: ContractSettings): boolean {
  return !!(s.founder_name.trim() && s.founder_title.trim() && s.entity_name.trim() && founderSignatureMode(s));
}

/** Why "Send contract" can't run yet (null = ready). Template first, then signature. */
export function contractSetupProblem(s: ContractSettings, hasTemplate: boolean): string | null {
  const sig = contractSettingsReady(s);
  if (!hasTemplate && !sig) return "Upload the final contract and adopt your signature in Settings first";
  if (!hasTemplate) return "Upload the final contract first";
  if (!sig) return "Adopt your signature in Settings first";
  return null;
}

/**
 * Founder's one-time "Adopt this signature": records that he adopted his
 * name, typed in SIGNATURE_FONT, as his countersignature. Switches off the
 * drawn override. Re-adopt after changing the name.
 */
export async function adoptFounderSignature(): Promise<ContractSettings> {
  const s = await getContractSettings();
  const text = s.founder_name.trim();
  if (!text) throw new CreatorDataError("Add your name first");
  const now = new Date().toISOString();
  await fdb()
    .collection(SETTINGS_COLLECTION)
    .doc(SETTINGS_DOC)
    .set({ founder_signature_adopted_at: now, founder_signature_adopted_text: text, use_drawn_signature: false, updated_at: now }, { merge: true });
  return getContractSettings();
}

/** Switch between the generated signature and the drawn/uploaded PNG override. */
export async function setUseDrawnSignature(useDrawn: boolean): Promise<ContractSettings> {
  const s = await getContractSettings();
  if (useDrawn && !s.signature_path) throw new CreatorDataError("Draw or upload a signature first");
  await fdb()
    .collection(SETTINGS_COLLECTION)
    .doc(SETTINGS_DOC)
    .set({ use_drawn_signature: useDrawn, updated_at: new Date().toISOString() }, { merge: true });
  return getContractSettings();
}

export async function saveContractSettings(patch: Partial<Pick<ContractSettings, "founder_name" | "founder_title" | "entity_name">>): Promise<ContractSettings> {
  const out: Record<string, string> = {};
  for (const k of ["founder_name", "founder_title", "entity_name"] as const) {
    if (patch[k] === undefined) continue;
    const v = String(patch[k] ?? "").trim().replace(/\s+/g, " ");
    if (!v || v.length > 120) throw new CreatorDataError(`${k.replace("_", " ")} is required (max 120 characters)`);
    out[k] = v;
  }
  out.updated_at = new Date().toISOString();
  await fdb().collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).set(out, { merge: true });
  return getContractSettings();
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Store the founder's signature PNG (drawn on a canvas or uploaded) and use it instead of the generated one. */
export async function saveFounderSignature(png: Buffer): Promise<ContractSettings> {
  if (png.length < 100 || !png.subarray(0, 8).equals(PNG_MAGIC)) throw new CreatorDataError("Signature must be a PNG image");
  if (png.length > 2 * 1024 * 1024) throw new CreatorDataError("Signature image is over 2MB");
  try {
    const probe = await PDFDocument.create();
    await probe.embedPng(png);
  } catch {
    throw new CreatorDataError("That PNG couldn't be read. Try drawing it again or export a fresh PNG.");
  }
  await bucket().file(FOUNDER_SIGNATURE_PATH).save(png, { contentType: "image/png", resumable: false });
  const now = new Date().toISOString();
  await fdb()
    .collection(SETTINGS_COLLECTION)
    .doc(SETTINGS_DOC)
    .set(
      { signature_path: FOUNDER_SIGNATURE_PATH, signature_sha256: sha256Hex(png), signature_updated_at: now, use_drawn_signature: true, updated_at: now },
      { merge: true },
    );
  return getContractSettings();
}

// ---------------------------------------------------------------- send / view

function contractOf(d: DocumentData): Partial<CreatorContract> {
  return (d.contract ?? {}) as Partial<CreatorContract>;
}

function portalUrl(): string {
  return `${(process.env.NEXT_PUBLIC_SITE_URL || "https://www.keshah.com").replace(/\/+$/, "")}/creator`;
}

/** Admin "Send contract": pins the current template + hash and opens signing in the portal. */
export async function sendContract(
  id: string,
  opts: { email?: boolean; version?: string } = {},
): Promise<{ contract: CreatorContract; emailed: boolean }> {
  const snap = await creatorRef(id).get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const d = snap.data()!;
  if (contractOf(d).status === "signed") {
    throw new CreatorDataError("This creator already signed. A signed contract can't be replaced from here.", 409);
  }
  const settings = await getContractSettings();
  // Version: an explicit pick, else the creator's saved version (e.g. Isai's
  // v1-isai with their addendum), else the current standard version.
  const wanted = (opts.version || String(d.contract_template_version ?? "") || settings.current_template_version || "").trim();
  const current = wanted ? await getTemplate(wanted) : null;
  if (!current) {
    throw new CreatorDataError(
      wanted && wanted !== settings.current_template_version
        ? `Contract version ${wanted} isn't uploaded. Upload it under Contract signing, or pick another version.`
        : "Upload the final contract PDF under Contract signing first. The v0 draft can't be sent.",
      400,
    );
  }
  if (!contractSettingsReady(settings)) {
    throw new CreatorDataError("Adopt your signature under Contract signing first.", 400);
  }
  const { template: t } = await templateBytes(current.version); // integrity check
  const now = new Date().toISOString();
  const contract: CreatorContract = { status: "sent", template_version: t.version, template_sha256: t.sha256, sent_at: now };
  await creatorRef(id).update({ contract, ...(opts.version ? { contract_template_version: t.version } : {}) });
  await logEvent(id, { type: "sent", at: now, actor: "admin", template_version: t.version, template_sha256: t.sha256 });
  // KESHAH Creators app push (also reaches a phone still signed in as the applicant, by email). Never throws.
  await notify({ creatorId: id, email: String(d.email ?? "").trim() || null }, PUSH_COPY.contractSent);

  // No separate "ready to sign" email: new hires read about it in the acceptance email and sign
  // as the first step in the app; anyone else sees "Sign your contract" on Today (plus the push).
  const emailed = false;
  return { contract, emailed };
}

function nameWords(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/[\s'-]+/)
    .filter(Boolean);
}

/**
 * The typed signature names the person on the contract: it has their first and
 * last name as on file (any case, accents, extra middle names), e.g. "Isai
 * Maria Trujillo" for "Isai Trujillo". "Isai" alone or someone else doesn't.
 */
export function nameMatchesOnFile(typed: string, onFile: string): boolean {
  const want = nameWords(onFile);
  const have = new Set(nameWords(typed));
  if (!want.length) return true;
  return have.has(want[0]) && have.has(want[want.length - 1]);
}

/** Records the first time the creator opens the contract PDF (audit trail). */
export async function recordContractViewed(id: string, meta: { ip: string; user_agent: string }): Promise<void> {
  const ref = creatorRef(id);
  const now = new Date().toISOString();
  const first = await fdb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = contractOf(snap.data() ?? {});
    if (c.status !== "sent" || c.viewed_at) return false;
    tx.update(ref, { "contract.viewed_at": now });
    return true;
  });
  if (first) await logEvent(id, { type: "viewed", at: now, actor: "creator", ip: meta.ip, user_agent: meta.user_agent });
}

// ---------------------------------------------------------------- sign

export interface SignInput {
  consent: boolean;
  consent_text_version: string;
  typed_name: string;
  address: string;
}

export interface SignMeta {
  ip: string;
  user_agent: string;
  /** How the signer was signed in (lib/creators/signer-auth.ts), printed on the audit certificate. */
  auth?: SignerAuth;
  now?: Date;
}

const squash = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ");

function localTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "long", timeStyle: "long" }).format(d);
}
function localDateLong(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "long" }).format(d);
}

/**
 * Creator signs. `id` MUST come from the session token. Builds the signed
 * PDF, stores it write-once, flips the contract to signed in a transaction,
 * logs the event, and emails both parties (fail-soft).
 */
export async function signContract(
  id: string,
  input: SignInput,
  meta: SignMeta,
): Promise<{ signed_at: string; signed_sha256: string; pdf_path: string; document_id: string; emailed: { creator: boolean; founder: boolean } }> {
  const ref = creatorRef(id);
  const snap = await ref.get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const d = snap.data()!;
  const contract = contractOf(d);
  if (contract.status === "signed") throw new CreatorDataError("Your contract is already signed.", 409);
  if (d.withdrawn_at) throw new CreatorDataError("This offer was withdrawn, so the contract can't be signed. Reply to McKenzie's email if you have questions.", 409);
  if (contract.status !== "sent" || !contract.template_version || !contract.template_sha256) {
    throw new CreatorDataError("Your contract isn't ready to sign yet.", 409);
  }

  if (input.consent !== true) throw new CreatorDataError("Tick the box to agree to electronic records and signatures.");
  if (input.consent_text_version !== CONSENT_TEXT_VERSION) {
    throw new CreatorDataError("This page is out of date. Refresh it and try again.", 409);
  }

  const { template: tpl, bytes: template } = await templateBytes(contract.template_version);
  const templateSha = sha256Hex(template);
  if (templateSha !== contract.template_sha256 || tpl.sha256 !== contract.template_sha256) {
    throw new CreatorDataError("The contract changed after it was sent to you. Message us on Slack and we'll send it again.", 409);
  }

  const typed = squash(input.typed_name);
  if (typed.length < 2 || typed.length > 120) throw new CreatorDataError("Type your full legal name.");
  const onFile = squash(d.legal_name);
  if (onFile && !nameMatchesOnFile(typed, onFile)) {
    throw new CreatorDataError("That doesn't match the name on your contract. Write your full legal name, first and last. If we've spelled your name wrong, message us.");
  }
  const legalName = onFile || typed;
  const address = squash(input.address);
  if (address.length < 6 || address.length > 300) throw new CreatorDataError("Add your home address (street, city, state, ZIP).");

  const settings = await getContractSettings();
  if (!contractSettingsReady(settings)) {
    throw new CreatorDataError("Your contract can't be signed right now. Message us on Slack.", 503);
  }
  let founder: FounderSignature;
  if (founderSignatureMode(settings) === "drawn") {
    try {
      const [png] = await bucket().file(settings.signature_path!).download();
      founder = { kind: "drawn", png };
    } catch {
      throw new CreatorDataError("Your contract can't be signed right now. Message us on Slack.", 503);
    }
  } else {
    founder = { kind: "typed", text: settings.founder_signature_adopted_text!, adopted_at: settings.founder_signature_adopted_at! };
  }

  const now = meta.now ?? new Date();
  const signedAt = now.toISOString();
  const tz = typeof d.timezone === "string" && isValidTimezone(d.timezone) ? d.timezone : DEFAULT_TIMEZONE;
  const email = String(d.email ?? "").trim().toLowerCase();
  const audit: ContractAudit = {
    document_id: randomUUID(),
    template_version: contract.template_version,
    template_sha256: templateSha,
    signer_typed_name: typed,
    signer_legal_name: legalName,
    signer_address: address,
    signer_email: email,
    signer_user_id: id,
    signer_ip: meta.ip || "unknown",
    signer_user_agent: (meta.user_agent || "unknown").slice(0, 500),
    ...(meta.auth ? { signer_auth: meta.auth } : {}),
    signed_at_utc: signedAt,
    signed_at_local: localTime(now, tz),
    signer_timezone: tz,
    consent_text_version: CONSENT_TEXT_VERSION,
    consent_text_sha256: CONSENT_TEXT_SHA256,
    ...(contract.sent_at ? { sent_at: String(contract.sent_at) } : {}),
    ...(contract.viewed_at ? { first_viewed_at: String(contract.viewed_at) } : {}),
    countersigner_name: settings.founder_name,
    countersigner_title: settings.founder_title,
    entity_name: settings.entity_name,
    signature_style: SIGNATURE_STYLE,
    // Typed text stays as typed above; the drawn signature is Title Case when typed all lower/upper.
    signature_adopted_text: adoptedSignatureText(typed),
    ...(founder.kind === "drawn"
      ? { countersignature_style: "drawn image", countersignature_sha256: sha256Hex(founder.png) }
      : { countersignature_style: SIGNATURE_STYLE, countersignature_adopted_text: founder.text, countersignature_adopted_at: founder.adopted_at }),
  };

  const pdf = await buildSignedPdf(template, tpl.title, audit, founder, localDateLong(now, tz));
  const signedSha = sha256Hex(pdf);
  const stamp = signedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const pdfPath = `creators/${id}/contract/signed-${contract.template_version}-${stamp}.pdf`;
  const file = bucket().file(pdfPath);
  await file.save(Buffer.from(pdf), {
    contentType: "application/pdf",
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 }, // never overwrite
    metadata: { metadata: { sha256: signedSha, document_id: audit.document_id, creator_id: id } },
  });

  try {
    await fdb().runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      const c = contractOf(cur.data() ?? {});
      if (c.status === "signed") throw new CreatorDataError("Your contract is already signed.", 409);
      if (c.status !== "sent" || c.template_sha256 !== templateSha) {
        throw new CreatorDataError("Your contract changed while you were signing. Refresh and try again.", 409);
      }
      const signed: CreatorContract = {
        ...(clean(c) as CreatorContract),
        status: "signed",
        signed_at: signedAt,
        pdf_path: pdfPath,
        signed_sha256: signedSha,
        audit,
      };
      tx.update(ref, { contract: signed, ...(onFile ? {} : { legal_name: legalName }) });
      tx.create(
        ref.collection("contract_events").doc(),
        clean<ContractEvent>({
          type: "signed",
          at: signedAt,
          actor: "creator",
          template_version: contract.template_version,
          template_sha256: templateSha,
          signed_sha256: signedSha,
          pdf_path: pdfPath,
          ip: audit.signer_ip,
          user_agent: audit.signer_user_agent,
          audit,
        }),
      );
    });
  } catch (e) {
    await file.delete().catch(() => {});
    throw e;
  }

  await markContractStepDone(id, signedAt).catch((e) => console.error("contract onboarding step update failed:", e));
  // The signature is saved: answer now and send the signed copies after the
  // response (they take ~15s and used to keep the creator on a spinner).
  // waitUntil keeps the function alive until the emails are out.
  waitUntil(
    emailSignedCopies(id, { pdf: Buffer.from(pdf), audit, signedSha, firstName: String(d.name || legalName).split(" ")[0] }).catch((e) =>
      console.error("signed copy email failed:", e),
    ),
  );
  const emailed = { creator: !!audit.signer_email && emailConfigured(), founder: emailConfigured() };
  return { signed_at: signedAt, signed_sha256: signedSha, pdf_path: pdfPath, document_id: audit.document_id, emailed };
}

async function emailSignedCopies(
  id: string,
  x: { pdf: Buffer; audit: ContractAudit; signedSha: string; firstName: string },
): Promise<{ creator: boolean; founder: boolean }> {
  const result = { creator: false, founder: false };
  if (!emailConfigured()) {
    await logEvent(id, { type: "email_failed", at: new Date().toISOString(), actor: "system", detail: "Email not configured" }).catch(() => {});
    return result;
  }
  const filename = `KESHAH-Content-Creator-Agreement-${x.audit.signer_legal_name.replace(/[^\w]+/g, "-")}.pdf`;
  const facts =
    `Document ID: ${x.audit.document_id}\n` +
    `Signed: ${x.audit.signed_at_local} (${x.audit.signed_at_utc} UTC)\n` +
    `SHA-256 of the signed PDF: ${x.signedSha}`;
  const attachments = [{ filename, content: x.pdf, contentType: "application/pdf" }];
  const jobs: { who: "creator" | "founder"; to: string; subject: string; text: string }[] = [];
  if (x.audit.signer_email) {
    jobs.push({
      who: "creator",
      to: x.audit.signer_email,
      subject: "Your signed KESHAH contract",
      text: `Hi ${x.firstName || "there"},\n\nThanks for signing. Your copy of the contract is attached, and you can download it again anytime from Profile, then Contract, in the KESHAH Creators app.\n\n${SYSTEM_FOOTER}`,
    });
  }
  await notifyFounder({ title: "Contract signed", body: `${x.audit.signer_legal_name} signed (${x.audit.template_version}).`, data: { type: "founder_contract" } });
  const founder = process.env.KESHAH_GMAIL_USER;
  if (founder) {
    jobs.push({
      who: "founder",
      to: founder,
      subject: `Contract signed: ${x.audit.signer_legal_name}`,
      text: `${x.audit.signer_legal_name} (${x.audit.signer_email}) signed the Content Creator Agreement (${x.audit.template_version}).\n\n${facts}\nIP: ${x.audit.signer_ip}\n\nThe signed PDF is attached.`,
    });
  }
  for (const j of jobs) {
    try {
      await sendEmail({ to: j.to, subject: j.subject, text: j.text, attachments, fromName: SYSTEM_FROM_NAME });
      result[j.who] = true;
      await logEvent(id, { type: "emailed", at: new Date().toISOString(), actor: "system", detail: `${j.who}: ${j.to}`, signed_sha256: x.signedSha });
    } catch (e) {
      console.error(`contract email to ${j.who} failed:`, e);
      await logEvent(id, { type: "email_failed", at: new Date().toISOString(), actor: "system", detail: `${j.who}: ${String((e as Error)?.message ?? e).slice(0, 300)}` }).catch(() => {});
    }
  }
  return result;
}

// ---------------------------------------------------------------- pdf

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 64;
const GREY = rgb(0.4, 0.4, 0.4);
const BLACK = rgb(0, 0, 0);

/** Standard fonts only cover WinAnsi; swap anything else for "?" (Firestore keeps the exact text). */
function safe(font: PDFFont, text: string): string {
  let out = "";
  for (const ch of String(text ?? "").replace(/[\r\n\t]+/g, " ")) {
    try {
      font.widthOfTextAtSize(ch, 10);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = safe(font, text).split(" ");
  const lines: string[] = [];
  let line = "";
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= maxWidth;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (fits(next)) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    // Hard-break very long tokens (hashes, user agents).
    let rest = w;
    while (!fits(rest) && rest.length > 1) {
      let i = rest.length;
      while (i > 1 && !fits(rest.slice(0, i))) i--;
      lines.push(rest.slice(0, i));
      rest = rest.slice(i);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  /** SIGNATURE_FONT, embedded (subset) from the repo TTF. */
  script: PDFFont;
  /** For any character SIGNATURE_FONT lacks. */
  scriptFallback: PDFFont;
  scriptGlyphs: Set<number>;
  mono: PDFFont;
}

/** The founder's countersignature for one signing. */
export type FounderSignature = { kind: "typed"; text: string; adopted_at: string } | { kind: "drawn"; png: Buffer };

/** Split text into runs: SIGNATURE_FONT where it has the glyph, the fallback font otherwise. */
function scriptRuns(f: Fonts, text: string): { font: PDFFont; text: string }[] {
  const runs: { font: PDFFont; text: string }[] = [];
  for (const ch of String(text ?? "").replace(/[\r\n\t]+/g, " ")) {
    const font = f.scriptGlyphs.has(ch.codePointAt(0)!) ? f.script : f.scriptFallback;
    const piece = font === f.script ? ch : safe(font, ch);
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += piece;
    else runs.push({ font, text: piece });
  }
  return runs;
}

const SIG_INK = rgb(0.05, 0.1, 0.35);

/** Draws an adopted signature (typed name in SIGNATURE_FONT), shrunk to fit maxWidth. */
function drawAdoptedSignature(page: PDFPage, f: Fonts, text: string, x: number, baseline: number, maxWidth: number) {
  const runs = scriptRuns(f, text);
  const fbSize = (size: number) => size * 0.62; // fallback serif looks huge next to the script's small x-height
  const WORD_GAP = 0.15; // the script's own space is very narrow; widen it (em) so names stay readable
  const runWidth = (r: { font: PDFFont; text: string }, size: number) => {
    const sz = r.font === f.script ? size : fbSize(size);
    const spaces = r.font === f.script ? (r.text.match(/ /g) ?? []).length : 0;
    return r.font.widthOfTextAtSize(r.text, sz) + spaces * WORD_GAP * size;
  };
  const width = (size: number) => runs.reduce((w, r) => w + runWidth(r, size), 0);
  let size = 34;
  while (size > 12 && width(size) > maxWidth) size -= 1;
  let cx = x;
  for (const r of runs) {
    const sz = r.font === f.script ? size : fbSize(size);
    const parts = r.font === f.script ? r.text.split(" ") : [r.text];
    parts.forEach((part, i) => {
      if (i > 0) cx += r.font.widthOfTextAtSize(" ", sz) + WORD_GAP * size;
      if (part) page.drawText(part, { x: cx, y: baseline, size: sz, font: r.font, color: SIG_INK });
      cx += r.font.widthOfTextAtSize(part, sz);
    });
  }
}

function footer(page: PDFPage, f: Fonts, a: ContractAudit, label: string) {
  const text = safe(f.regular, `${label} · Document ID ${a.document_id} · E-signed via the KESHAH creator portal`);
  const size = 7;
  page.drawText(text, { x: (PAGE_W - f.regular.widthOfTextAtSize(text, size)) / 2, y: 22, size, font: f.regular, color: GREY });
}

/** Simple top-down writer that adds pages as needed. */
class Writer {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    private f: Fonts,
    private a: ContractAudit,
    private label: string,
  ) {
    this.page = this.newPage();
    this.y = PAGE_H - MARGIN;
  }
  private newPage(): PDFPage {
    const p = this.doc.addPage([PAGE_W, PAGE_H]);
    footer(p, this.f, this.a, this.label);
    return p;
  }
  ensure(h: number) {
    if (this.y - h < MARGIN) {
      this.page = this.newPage();
      this.y = PAGE_H - MARGIN;
    }
  }
  text(s: string, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const font = o.font ?? this.f.regular;
    const size = o.size ?? 10;
    const x = o.x ?? MARGIN;
    const lines = wrap(font, s, size, o.width ?? PAGE_W - x - MARGIN);
    for (const line of lines) {
      this.ensure(size * 1.45);
      this.page.drawText(line, { x, y: this.y - size, size, font, color: o.color ?? BLACK });
      this.y -= size * 1.45;
    }
    this.y -= o.gap ?? 0;
  }
  rule() {
    this.ensure(10);
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 4 }, end: { x: PAGE_W - MARGIN, y: this.y - 4 }, thickness: 0.5, color: GREY });
    this.y -= 12;
  }
}

async function buildSignedPdf(template: Buffer, title: string, a: ContractAudit, founder: FounderSignature, effectiveDate: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template);
  doc.registerFontkit(fontkit);
  const script = await doc.embedFont(loadSignatureFont(), { subset: true });
  const f: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    script,
    scriptFallback: await doc.embedFont(StandardFonts.TimesRomanItalic),
    scriptGlyphs: new Set(script.getCharacterSet()),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const sig: PDFImage | null = founder.kind === "drawn" ? await doc.embedPng(founder.png) : null;
  const original = doc.getPages();
  original.forEach((p) => {
    const { width } = p.getSize();
    const text = `Document ID ${a.document_id}`;
    p.drawText(text, { x: width - MARGIN - f.regular.widthOfTextAtSize(text, 6.5), y: 10, size: 6.5, font: f.regular, color: GREY });
  });
  const signedDate = effectiveDate;

  // ---- signature page
  const w = new Writer(doc, f, a, "Signature page");
  w.text("Signature Page", { font: f.bold, size: 16, gap: 6 });
  w.text(
    `This signature page completes the ${title} above ` +
      `(template ${a.template_version}, SHA-256 ${a.template_sha256}) between ${a.entity_name} ("KESHAH") and the Creator named below.`,
    { size: 10, gap: 6 },
  );
  w.text(
    `For the purposes of the Agreement, including any blanks in it: the Effective Date is ${effectiveDate}, and the Creator is ` +
      `${a.signer_legal_name}, an individual residing at ${a.signer_address}.`,
    { size: 10, gap: 6 },
  );
  w.text(
    "Both Parties signed this Agreement electronically under the U.S. Electronic Signatures in Global and National Commerce Act (ESIGN) " +
      "and the Uniform Electronic Transactions Act (UETA). Each electronic signature is an original.",
    { size: 10, gap: 18 },
  );

  const colW = (PAGE_W - MARGIN * 2 - 32) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 32;
  w.ensure(260);
  const top = w.y;
  const p = w.page;
  const label = (x: number, y: number, s: string) => p.drawText(safe(f.bold, s), { x, y, size: 10, font: f.bold });
  label(leftX, top - 10, safe(f.bold, a.entity_name.toUpperCase()));
  label(rightX, top - 10, "CREATOR");

  const lineY = top - 90;
  if (sig) {
    // drawn founder signature image (fit 190 x 56)
    const scale = Math.min(190 / sig.width, 56 / sig.height, 1);
    p.drawImage(sig, { x: leftX, y: lineY + 4, width: sig.width * scale, height: sig.height * scale });
  } else if (founder.kind === "typed") {
    drawAdoptedSignature(p, f, founder.text, leftX + 4, lineY + 12, colW - 8);
  }
  // creator's adopted signature
  drawAdoptedSignature(p, f, a.signature_adopted_text ?? a.signer_typed_name, rightX + 4, lineY + 12, colW - 8);
  for (const x of [leftX, rightX]) {
    p.drawLine({ start: { x, y: lineY }, end: { x: x + colW, y: lineY }, thickness: 0.7, color: BLACK });
  }
  const rows = (x: number, items: [string, string][]) => {
    let y = lineY - 16;
    for (const [k, v] of items) {
      const lines = wrap(f.regular, `${k}: ${v}`, 9.5, colW);
      for (const l of lines) {
        p.drawText(l, { x, y, size: 9.5, font: f.regular });
        y -= 13;
      }
    }
    return y;
  };
  const yl = rows(leftX, [
    ["Signature", founder.kind === "drawn" ? "electronic (adopted signature image)" : "electronic (adopted by typing full name)"],
    ["Name", a.countersigner_name],
    ["Title", a.countersigner_title],
    ["Date", signedDate],
  ]);
  const yr = rows(rightX, [
    ["Signature", "electronic (adopted by typing full name)"],
    ["Name", a.signer_legal_name],
    ["Address", a.signer_address],
    ["Email", a.signer_email],
    ["Date", signedDate],
  ]);
  w.y = Math.min(yl, yr) - 18;
  w.text(
    `KESHAH's signature was applied automatically when the Creator signed, on ${a.signed_at_local}. ` +
      "The Creator adopted a signature by typing their full legal name, after agreeing to use electronic records and signatures. " +
      "Full details are on the audit certificate that follows.",
    { size: 8.5, color: GREY },
  );

  // ---- audit certificate
  const c = new Writer(doc, f, a, "Audit certificate");
  c.text("Audit Certificate", { font: f.bold, size: 16, gap: 2 });
  c.text("Electronic signature record for the agreement above.", { size: 10, color: GREY, gap: 8 });
  c.rule();
  const items: [string, string, boolean?][] = [
    ["Document ID", a.document_id, true],
    ["Document", `${title}, template ${a.template_version} (${original.length} pages) + signature page + this certificate`],
    ["Template SHA-256", a.template_sha256, true],
    ["Signed PDF SHA-256", "Kept in KESHAH's records and in the emails sent to both parties at signing (a file can't contain its own hash)."],
    ["Status", "Completed. Signed by the Creator and countersigned by KESHAH."],
    ["Sent to signer (UTC)", a.sent_at ?? "not recorded"],
    ["First opened (UTC)", a.first_viewed_at ?? "not recorded"],
    ["Signed (UTC)", a.signed_at_utc],
    ["Signed (signer's time)", `${a.signed_at_local} (${a.signer_timezone})`],
    ["Signer typed name", a.signer_typed_name],
    ["Signature", `Signature adopted by typing full name ("${a.signature_adopted_text ?? a.signer_typed_name}", style: ${a.signature_style ?? SIGNATURE_STYLE}); electronic signature under ESIGN/UETA.`],
    ["Signer legal name", a.signer_legal_name],
    ["Signer address", a.signer_address],
    ["Signer email", a.signer_email],
    ["Signer account ID", a.signer_user_id, true],
    ["Signer IP address", a.signer_ip],
    ["Signer device (user agent)", a.signer_user_agent],
    ["Authentication", signerAuthText(a.signer_auth)],
    ["Consent to e-records", `Ticked "${CONSENT_CHECKBOX_LABEL}" (consent text ${a.consent_text_version}).`],
    ["Consent text SHA-256", a.consent_text_sha256, true],
    ["Intent to sign", 'Typed full legal name to adopt a signature and pressed "Adopt and sign".'],
    ["Countersigned by", `${a.countersigner_name}, ${a.countersigner_title}, for ${a.entity_name}`],
  ];
  if (a.countersignature_style === "drawn image" || (!a.countersignature_style && a.countersignature_sha256)) {
    items.push(["Countersignature", "Drawn signature image adopted by the countersigner."]);
    if (a.countersignature_sha256) items.push(["Countersignature SHA-256", a.countersignature_sha256, true]);
  } else {
    items.push([
      "Countersignature",
      `Signature adopted by typing full name ("${a.countersignature_adopted_text ?? a.countersigner_name}", style: ${a.countersignature_style ?? SIGNATURE_STYLE})` +
        `${a.countersignature_adopted_at ? `, adopted ${a.countersignature_adopted_at} (UTC)` : ""}; applied automatically when the Creator signed.`,
    ]);
  }
  const keyW = 150;
  for (const [k, v, mono] of items) {
    const font = mono ? f.mono : f.regular;
    const size = mono ? 8.5 : 9.5;
    const lines = wrap(font, v, size, PAGE_W - MARGIN * 2 - keyW);
    c.ensure(lines.length * size * 1.45 + 6);
    c.page.drawText(safe(f.bold, k), { x: MARGIN, y: c.y - 9.5, size: 9, font: f.bold, color: GREY });
    for (const l of lines) {
      c.page.drawText(l, { x: MARGIN + keyW, y: c.y - size, size, font });
      c.y -= size * 1.45;
    }
    c.y -= 6;
  }

  doc.setTitle(`${title} (signed) - ${safe(f.regular, a.signer_legal_name)}`);
  doc.setSubject(`Document ID ${a.document_id}`);
  doc.setKeywords([a.document_id, `template:${a.template_version}`, `template-sha256:${a.template_sha256}`]);
  doc.setProducer("KESHAH creator portal");
  doc.setCreator("KESHAH creator portal");
  doc.setCreationDate(new Date(a.signed_at_utc));
  doc.setModificationDate(new Date(a.signed_at_utc));
  return doc.save();
}

/** Test hook: render a signed PDF without Firestore/Storage. */
export const __buildSignedPdfForTest = buildSignedPdf;

/** What the portal's Contract tab needs (reads the raw doc so an empty legal_name is visible). */
export async function getSigningInfo(id: string): Promise<{
  status: CreatorContract["status"];
  legal_name_on_file: string;
  template: { version: string; title: string; pages: number } | null;
  signed_at: string | null;
  pdf_path: string | null;
  signed_sha256: string | null;
  document_id: string | null;
  /** True only when the signed copy was actually emailed to the creator (an "emailed" event for this signature). */
  emailed_copy: boolean;
}> {
  const snap = await creatorRef(id).get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const d = snap.data()!;
  const c = contractOf(d);
  const status = (c.status ?? "none") as CreatorContract["status"];
  const tpl = status !== "none" && c.template_version ? await getTemplate(c.template_version) : null;
  return {
    status,
    legal_name_on_file: squash(d.legal_name),
    template: tpl ? { version: tpl.version, title: tpl.title, pages: tpl.pages } : null,
    signed_at: c.signed_at ? String(c.signed_at) : null,
    pdf_path: c.pdf_path ?? null,
    signed_sha256: c.signed_sha256 ?? null,
    document_id: c.audit?.document_id ?? null,
    emailed_copy: status === "signed" && !!c.signed_sha256 ? await creatorCopyEmailed(id, c.signed_sha256) : false,
  };
}

async function creatorCopyEmailed(id: string, signedSha: string): Promise<boolean> {
  const snap = await creatorRef(id).collection("contract_events").where("type", "==", "emailed").get();
  return snap.docs.some((d) => d.data().signed_sha256 === signedSha && String(d.data().detail ?? "").startsWith("creator:"));
}
