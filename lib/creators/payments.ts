/**
 * Creator payment details + tax forms (server only).
 *
 * Firestore
 *   ContentCreators/{id}.payment_details     PaymentDetailsSummary  (non-sensitive: bank name, last 4)
 *   ContentCreators/{id}.tax_form            TaxFormSummary         (non-sensitive: type, dates, TIN last 4 for W-9)
 *   ContentCreators/{id}.w9_on_file          kept true once a tax form is submitted (admin + E-2 code read it)
 *   ContentCreators/{id}/private/payment     PrivatePayment: bank + TIN, each AES-256-GCM sealed (lib/creators/secure.ts).
 *                                            Never returned by any creator or admin GET.
 *   ContentCreators/{id}/private/payment/reveal_log/{auto}   every admin reveal / tax form download / export
 *   ContentCreators/{id}/tax_events/{auto}   append-only audit log of tax form signing (no TIN)
 *   ContentCreators/{id}/payment_events/{auto} append-only log of bank detail saves + payee toggles (no numbers)
 * Storage
 *   creators/<id>/tax/<w9|w8ben>-<stamp>.pdf.enc   the signed PDF, sealed (JSON envelope), write-once
 *
 * Nothing here ever stores a full account number, routing number or TIN in plaintext.
 */
import { createHash, randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import type { DocumentData } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION, CreatorDataError, DEFAULT_TIMEZONE, STORAGE_BUCKET } from "./db";
import {
  DecryptError,
  PAYMENTS_DISABLED_MESSAGE,
  PaymentsDisabledError,
  encryptionConfigured,
  openFile,
  openJson,
  sealFile,
  sealJson,
  type Sealed,
} from "./secure";
import {
  W8BEN_REVISION,
  W9_REVISION,
  checkSignature,
  last4,
  validateBank,
  validateW8ben,
  validateW9,
  type BankDetails,
  type W8benInput,
  type W9Input,
} from "./payment-validate";
import { buildW8benPdf, buildW9Pdf, mmddyyyy, w8benTemplate, w9Template, type TaxSignatureRecord } from "./tax-forms";
import { adoptedSignatureText } from "./signature";
import { isValidTimezone } from "./time";

export type TaxFormType = "w9" | "w8ben";

export interface PaymentDetailsSummary {
  status: "missing" | "submitted" | "payee_set_up";
  bank_name: string | null;
  last4: string | null;
  account_type: "checking" | "savings" | null;
  submitted_at: string | null;
  payee_set_up_at: string | null;
}

export interface TaxFormSummary {
  type: TaxFormType | null;
  status: "missing" | "submitted";
  submitted_at: string | null;
  signed_name: string | null;
  /** Sealed PDF in Storage. */
  storage_path: string | null;
  /** W-9 only. */
  tin_last4: string | null;
  document_id: string | null;
  /** SHA-256 of the plaintext signed PDF. */
  pdf_sha256: string | null;
}

export interface PrivatePayment {
  bank?: Sealed;
  bank_updated_at?: string;
  /** { form, tin_type, tin, us_tin? } sealed: kept for 1099 / 1042-S filing. */
  tin?: Sealed;
  tin_updated_at?: string;
}

interface SealedTin {
  form: TaxFormType;
  tin_type: "ssn" | "ein" | "ftin" | "none";
  tin: string;
  us_tin?: string;
}

/** Bumped when the certification wording or review flow changes (stale portal pages are refused). */
export const TAX_CERT_VERSION = "tax-cert-v1";

const ctx = {
  bank: (id: string) => `bank:${id}`,
  tin: (id: string) => `tin:${id}`,
  pdf: (id: string, path: string) => `taxpdf:${id}:${path}`,
};

// ---------------------------------------------------------------- plumbing

function fdb() {
  return getFirebaseAdmin().db;
}
function creatorRef(id: string) {
  return fdb().collection(CREATORS_COLLECTION).doc(id);
}
function privateRef(id: string) {
  return creatorRef(id).collection("private").doc("payment");
}
function bucket() {
  return getStorage(getFirebaseAdmin().app).bucket(STORAGE_BUCKET);
}
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Throws a friendly 503 when CREATOR_DATA_KEY isn't set. */
export function requirePaymentsEnabled(): void {
  if (!encryptionConfigured()) throw new CreatorDataError(PAYMENTS_DISABLED_MESSAGE, 503);
}

/** Run a crypto step, mapping key/decrypt failures to CreatorDataError. */
function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof PaymentsDisabledError) throw new CreatorDataError(PAYMENTS_DISABLED_MESSAGE, 503);
    if (e instanceof DecryptError) throw new CreatorDataError(e.message, 500);
    throw e;
  }
}

const iso = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function paymentDetailsOf(d: DocumentData | undefined): PaymentDetailsSummary {
  const p = (d?.payment_details ?? {}) as Record<string, unknown>;
  const status = p.status === "submitted" || p.status === "payee_set_up" ? p.status : "missing";
  return {
    status,
    bank_name: iso(p.bank_name),
    last4: iso(p.last4),
    account_type: p.account_type === "checking" || p.account_type === "savings" ? p.account_type : null,
    submitted_at: iso(p.submitted_at),
    payee_set_up_at: iso(p.payee_set_up_at),
  };
}

export function taxFormOf(d: DocumentData | undefined): TaxFormSummary {
  const t = (d?.tax_form ?? {}) as Record<string, unknown>;
  const type = t.type === "w9" || t.type === "w8ben" ? t.type : null;
  const submitted = t.status === "submitted" && !!type;
  return {
    type,
    status: submitted ? "submitted" : "missing",
    submitted_at: iso(t.submitted_at),
    signed_name: iso(t.signed_name),
    storage_path: iso(t.storage_path),
    tin_last4: iso(t.tin_last4),
    document_id: iso(t.document_id),
    pdf_sha256: iso(t.pdf_sha256),
  };
}

/** What the creator sees: no storage paths, no hashes. */
export function creatorPaymentView(d: DocumentData | undefined) {
  const pd = paymentDetailsOf(d);
  const tf = taxFormOf(d);
  return {
    enabled: encryptionConfigured(),
    /** Prefills the forms (the creator's own name). */
    legal_name: String(d?.legal_name || d?.name || ""),
    payment_details: { status: pd.status, bank_name: pd.bank_name, last4: pd.last4, account_type: pd.account_type, submitted_at: pd.submitted_at },
    tax_form: { type: tf.type, status: tf.status, submitted_at: tf.submitted_at, tin_last4: tf.tin_last4 },
    complete: pd.status !== "missing" && tf.status === "submitted",
  };
}

export async function getCreatorPaymentView(id: string) {
  const snap = await creatorRef(id).get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  return creatorPaymentView(snap.data());
}

// ---------------------------------------------------------------- bank details

export interface RequestMeta {
  ip: string;
  user_agent: string;
  now?: Date;
}

export async function saveBankDetails(id: string, raw: Record<string, unknown>, meta: RequestMeta) {
  requirePaymentsEnabled();
  const v = validateBank(raw as Parameters<typeof validateBank>[0]);
  if (!v.ok) throw new CreatorDataError(v.error);
  const bank: BankDetails = v.bank;
  const now = (meta.now ?? new Date()).toISOString();
  const sealed = guard(() => sealJson(bank, ctx.bank(id)));
  const summary: PaymentDetailsSummary = {
    status: "submitted",
    bank_name: bank.bank_name,
    last4: last4(bank.account_number),
    account_type: bank.account_type,
    submitted_at: now,
    payee_set_up_at: null,
  };
  const ref = creatorRef(id);
  const batch = fdb().batch();
  batch.set(privateRef(id), { bank: sealed, bank_updated_at: now }, { merge: true });
  batch.update(ref, { payment_details: summary });
  batch.create(ref.collection("payment_events").doc(), {
    type: "bank_saved",
    at: now,
    actor: "creator",
    bank_name: bank.bank_name,
    last4: summary.last4,
    ip: meta.ip,
    user_agent: meta.user_agent.slice(0, 500),
  });
  await batch.commit();
  return summary;
}

// ---------------------------------------------------------------- tax forms

type TaxRaw = Record<string, unknown>;

function parseTaxInput(form: TaxFormType, raw: TaxRaw): W9Input | W8benInput {
  const v = form === "w9" ? validateW9(raw) : validateW8ben(raw);
  if (!v.ok) throw new CreatorDataError(v.error);
  return v.value;
}

/** Unsigned, watermarked PDF so the creator can see the filled form before signing. Nothing is stored. */
export async function previewTaxForm(form: TaxFormType, raw: TaxRaw): Promise<Uint8Array> {
  const input = parseTaxInput(form, raw);
  return form === "w9" ? buildW9Pdf(input as W9Input) : buildW8benPdf(input as W8benInput);
}

export interface TaxSignInput {
  form: TaxFormType;
  fields: TaxRaw;
  typed_name: string;
  certify: boolean;
  cert_version: string;
}

function localTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "long", timeStyle: "long" }).format(d);
}
function localYmd(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Creator e-signs a W-9 or W-8BEN. `id` MUST come from the session token.
 * Builds the filled official PDF, seals it, uploads it write-once, seals the
 * TIN into private/payment, updates the summary + w9_on_file, and logs a
 * tax_events record (no TIN).
 */
export async function signTaxForm(id: string, input: TaxSignInput, meta: RequestMeta) {
  requirePaymentsEnabled();
  if (input.form !== "w9" && input.form !== "w8ben") throw new CreatorDataError("Pick which form you're filling in.");
  if (input.cert_version !== TAX_CERT_VERSION) throw new CreatorDataError("This page is out of date. Refresh it and try again.", 409);
  if (input.certify !== true) throw new CreatorDataError("Tick the box to confirm the certification before you sign.");
  const fields = parseTaxInput(input.form, input.fields);
  const nameOnForm = fields.name;
  const mustMatch = input.form === "w8ben" || (fields as W9Input).classification === "individual";
  const sigErr = checkSignature(input.typed_name, nameOnForm, mustMatch);
  if (sigErr) throw new CreatorDataError(sigErr);
  const typed = String(input.typed_name).trim().replace(/\s+/g, " ");

  const snap = await creatorRef(id).get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const d = snap.data()!;
  const tz = typeof d.timezone === "string" && isValidTimezone(d.timezone) ? d.timezone : DEFAULT_TIMEZONE;
  const now = meta.now ?? new Date();
  const signedAt = now.toISOString();
  const ymd = localYmd(now, tz);
  const template = input.form === "w9" ? w9Template() : w8benTemplate();
  const rec: TaxSignatureRecord = {
    document_id: randomUUID(),
    form_revision: input.form === "w9" ? W9_REVISION : W8BEN_REVISION,
    template_sha256: sha256(template),
    signer_typed_name: typed,
    signer_email: String(d.email ?? "").trim().toLowerCase(),
    signer_user_id: id,
    signer_ip: meta.ip || "unknown",
    signer_user_agent: (meta.user_agent || "unknown").slice(0, 500),
    signed_at_utc: signedAt,
    signed_at_local: localTime(now, tz),
    signer_timezone: tz,
    form_date: input.form === "w9" ? mmddyyyy(ymd, "/") : mmddyyyy(ymd, "-"),
    signature_style: "Great Vibes typed",
  };
  const pdf = input.form === "w9" ? await buildW9Pdf(fields as W9Input, { signature: rec }) : await buildW8benPdf(fields as W8benInput, { signature: rec });
  const pdfSha = sha256(pdf);

  const stamp = signedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const path = `creators/${id}/tax/${input.form}-${stamp}.pdf.enc`;
  const body = guard(() => sealFile(pdf, ctx.pdf(id, path)));
  const tin: SealedTin =
    input.form === "w9"
      ? { form: "w9", tin_type: (fields as W9Input).tin_type, tin: (fields as W9Input).tin }
      : (() => {
          const w8 = fields as W8benInput;
          return {
            form: "w8ben" as const,
            tin_type: w8.ftin_status === "have" ? ("ftin" as const) : ("none" as const),
            tin: w8.ftin_status === "have" ? w8.ftin : "",
            ...(w8.us_tin ? { us_tin: w8.us_tin } : {}),
          };
        })();
  const sealedTin = guard(() => sealJson(tin, ctx.tin(id)));

  const file = bucket().file(path);
  await file.save(body, {
    contentType: "application/json",
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { metadata: { encrypted: "aes-256-gcm-v1", creator_id: id, document_id: rec.document_id } },
  });

  const tinLast4 = input.form === "w9" ? last4((fields as W9Input).tin) : null;
  const summary: TaxFormSummary = {
    type: input.form,
    status: "submitted",
    submitted_at: signedAt,
    signed_name: typed,
    storage_path: path,
    tin_last4: tinLast4,
    document_id: rec.document_id,
    pdf_sha256: pdfSha,
  };
  const { signer_typed_name, ...recRest } = rec;
  try {
    const ref = creatorRef(id);
    const batch = fdb().batch();
    batch.set(privateRef(id), { tin: sealedTin, tin_updated_at: signedAt }, { merge: true });
    batch.update(ref, { tax_form: summary, w9_on_file: true });
    batch.create(
      ref.collection("tax_events").doc(),
      clean({
        type: "signed",
        at: signedAt,
        actor: "creator",
        form: input.form,
        cert_version: TAX_CERT_VERSION,
        storage_path: path,
        pdf_sha256: pdfSha,
        signed_name: signer_typed_name,
        signature_adopted_text: adoptedSignatureText(signer_typed_name),
        tin_last4: tinLast4,
        ...recRest,
      }),
    );
    await batch.commit();
  } catch (e) {
    await file.delete().catch(() => {});
    throw e;
  }
  return summary;
}

async function readSealedPdf(id: string, path: string): Promise<Buffer> {
  if (!path.startsWith(`creators/${id}/tax/`)) throw new CreatorDataError("Tax form not found.", 404);
  let body: Buffer;
  try {
    [body] = await bucket().file(path).download();
  } catch {
    throw new CreatorDataError("Tax form file is missing from storage.", 404);
  }
  return guard(() => openFile(body, ctx.pdf(id, path)));
}

export function taxFormFilename(name: string, type: TaxFormType, submittedAt: string | null): string {
  const base = (name || "creator").replace(/[^\w.\-]+/g, "_").slice(0, 60);
  return `${base}-${type === "w9" ? "W-9" : "W-8BEN"}-${(submittedAt ?? "").slice(0, 10) || "signed"}.pdf`;
}

/** The creator's own signed copy. */
export async function creatorTaxFormPdf(id: string, meta: RequestMeta) {
  requirePaymentsEnabled();
  const snap = await creatorRef(id).get();
  const tf = taxFormOf(snap.data());
  if (tf.status !== "submitted" || !tf.storage_path || !tf.type) throw new CreatorDataError("You haven't signed a tax form yet.", 404);
  const pdf = await readSealedPdf(id, tf.storage_path);
  await creatorRef(id)
    .collection("tax_events")
    .doc()
    .create({ type: "downloaded", at: new Date().toISOString(), actor: "creator", form: tf.type, document_id: tf.document_id, ip: meta.ip, user_agent: meta.user_agent.slice(0, 500) })
    .catch((e) => console.error("tax_events log failed:", e));
  return { pdf, filename: taxFormFilename(String(snap.data()?.legal_name || snap.data()?.name || ""), tf.type, tf.submitted_at) };
}

// ---------------------------------------------------------------- admin

export interface AdminActor {
  /** Admin token name/userId, or "admin" when the token carries neither. */
  who: string;
  ip: string;
  user_agent: string;
}

async function logReveal(id: string, action: string, actor: AdminActor, extra: Record<string, unknown> = {}) {
  // Logged BEFORE the data is returned: if the log write fails, nothing is revealed.
  await privateRef(id)
    .collection("reveal_log")
    .doc()
    .create(clean({ action, at: new Date().toISOString(), who: actor.who, ip: actor.ip, user_agent: actor.user_agent.slice(0, 500), ...extra }));
}

export async function listRevealLog(id: string, limit = 20) {
  const snap = await privateRef(id).collection("reveal_log").orderBy("at", "desc").limit(limit).get();
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, action: String(x.action ?? ""), at: String(x.at ?? ""), who: String(x.who ?? "") };
  });
}

export const REVEAL_SECONDS = 60;

/** Decrypted bank details for a 60 second admin display. Every call is logged. */
export async function revealBankDetails(id: string, actor: AdminActor): Promise<BankDetails & { expires_in: number }> {
  requirePaymentsEnabled();
  const snap = await privateRef(id).get();
  const sealed = snap.data()?.bank;
  if (!sealed) throw new CreatorDataError("No bank details saved yet.", 404);
  await logReveal(id, "reveal_bank", actor);
  const bank = guard(() => openJson<BankDetails>(sealed, ctx.bank(id)));
  return { ...bank, expires_in: REVEAL_SECONDS };
}

export async function adminTaxFormPdf(id: string, actor: AdminActor) {
  requirePaymentsEnabled();
  const snap = await creatorRef(id).get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const tf = taxFormOf(snap.data());
  if (tf.status !== "submitted" || !tf.storage_path || !tf.type) throw new CreatorDataError("No tax form on file.", 404);
  await logReveal(id, "download_tax_form", actor, { form: tf.type, document_id: tf.document_id });
  const pdf = await readSealedPdf(id, tf.storage_path);
  const d = snap.data()!;
  return { pdf, filename: taxFormFilename(String(d.legal_name || d.name || id), tf.type, tf.submitted_at) };
}

export async function setPayeeSetUp(id: string, on: boolean, actor: AdminActor): Promise<PaymentDetailsSummary> {
  const ref = creatorRef(id);
  const now = new Date().toISOString();
  return fdb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
    const pd = paymentDetailsOf(snap.data());
    if (pd.status === "missing") throw new CreatorDataError("The creator hasn't added bank details yet.", 409);
    const next: PaymentDetailsSummary = { ...pd, status: on ? "payee_set_up" : "submitted", payee_set_up_at: on ? now : null };
    tx.update(ref, { payment_details: next });
    tx.create(ref.collection("payment_events").doc(), { type: on ? "payee_set_up" : "payee_unset", at: now, actor: "admin", who: actor.who });
    return next;
  });
}

/** Every submitted tax form, decrypted, for the accountant's ZIP. Each one is logged on its creator. */
export async function allTaxFormPdfs(actor: AdminActor): Promise<{ name: string; data: Buffer }[]> {
  requirePaymentsEnabled();
  const snap = await fdb().collection(CREATORS_COLLECTION).where("tax_form.status", "==", "submitted").get();
  const out: { name: string; data: Buffer }[] = [];
  for (const doc of snap.docs) {
    const tf = taxFormOf(doc.data());
    if (!tf.storage_path || !tf.type) continue;
    await logReveal(doc.id, "export_tax_forms_zip", actor, { form: tf.type, document_id: tf.document_id });
    const pdf = await readSealedPdf(doc.id, tf.storage_path);
    const d = doc.data();
    let name = taxFormFilename(String(d.legal_name || d.name || doc.id), tf.type, tf.submitted_at);
    if (out.some((f) => f.name === name)) name = name.replace(/\.pdf$/, `-${doc.id.slice(0, 6)}.pdf`);
    out.push({ name, data: pdf });
  }
  return out;
}
