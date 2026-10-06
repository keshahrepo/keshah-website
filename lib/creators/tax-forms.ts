/**
 * Fills the OFFICIAL IRS PDFs (server only):
 *   lib/creators/forms/fw9.pdf     Form W-9 (Rev. March 2024)       https://www.irs.gov/pub/irs-pdf/fw9.pdf
 *   lib/creators/forms/fw8ben.pdf  Form W-8BEN (Rev. October 2021)  https://www.irs.gov/pub/irs-pdf/fw8ben.pdf
 * Both are public US government forms, kept unmodified in the repo.
 *
 * The AcroForm fields are filled with pdf-lib, the creator's adopted
 * signature (typed name in Great Vibes, same as contracts) and the date are
 * stamped in the "Sign Here" area, and the form is flattened. A second page,
 * the electronic signature record, lists who signed and how (IRS electronic
 * W-9 rules: signer identity, the perjury statement, and the consent notice).
 *
 * Field names were read from the PDFs with pdf-lib (see FIELD maps below).
 * If the IRS publishes a new revision, re-download, re-check the names, and
 * bump W9_REVISION / W8BEN_REVISION in payment-validate.ts.
 */
import { readFileSync } from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import { adoptedSignatureText } from "./signature";
import {
  IRS_CONSENT_STATEMENT,
  W8BEN_CAPACITY,
  W8BEN_CERTIFICATION,
  W8BEN_REVISION,
  W9_CERTIFICATION,
  W9_REVISION,
  type W8benInput,
  type W9Input,
} from "./payment-validate";

const FORMS_DIR = path.join(process.cwd(), "lib", "creators", "forms");
const FONT_FILE = path.join(process.cwd(), "lib", "creators", "fonts", "GreatVibes-Regular.ttf");
const cache = new Map<string, Buffer>();
function load(file: string): Buffer {
  if (!cache.has(file)) cache.set(file, readFileSync(file));
  return cache.get(file)!;
}
export const w9Template = () => load(path.join(FORMS_DIR, "fw9.pdf"));
export const w8benTemplate = () => load(path.join(FORMS_DIR, "fw8ben.pdf"));

const W9 = "topmostSubform[0].Page1[0].";
const W9_BOX = `${W9}Boxes3a-b_ReadOrder[0].`;
const W9_FIELD = {
  name: `${W9}f1_01[0]`,
  business: `${W9}f1_02[0]`,
  classBox: (i: number) => `${W9_BOX}c1_1[${i}]`,
  llcCode: `${W9_BOX}f1_03[0]`,
  otherText: `${W9_BOX}f1_04[0]`,
  foreignPartners: `${W9_BOX}c1_2[0]`,
  exemptPayee: `${W9}f1_05[0]`,
  fatca: `${W9}f1_06[0]`,
  address: `${W9}Address_ReadOrder[0].f1_07[0]`,
  cityStateZip: `${W9}Address_ReadOrder[0].f1_08[0]`,
  ssn: [`${W9}f1_11[0]`, `${W9}f1_12[0]`, `${W9}f1_13[0]`],
  ein: [`${W9}f1_14[0]`, `${W9}f1_15[0]`],
};
const W9_CLASS_INDEX: Record<W9Input["classification"], number> = {
  individual: 0,
  c_corp: 1,
  s_corp: 2,
  partnership: 3,
  trust: 4,
  llc: 5,
  other: 6,
};

const W8 = "topmostSubform[0].Page1[0].";
const W8_FIELD = {
  name: `${W8}f_1[0]`,
  citizenship: `${W8}f_2[0]`,
  address: `${W8}f_3[0]`,
  city: `${W8}f_4[0]`,
  country: `${W8}f_5[0]`,
  mailAddress: `${W8}f_6[0]`,
  mailCity: `${W8}f_7[0]`,
  mailCountry: `${W8}f_8[0]`,
  usTin: `${W8}f_9[0]`,
  ftin: `${W8}f_10[0]`,
  ftinNotRequired: `${W8}c1_01[0]`,
  dob: `${W8}f_12[0]`,
  treatyCountry: `${W8}f_13[0]`,
  treatyArticle: `${W8}f_14[0]`,
  treatyRate: `${W8}f_15[0]`,
  treatyIncome: `${W8}f_16[0]`,
  treatyConditions: `${W8}f_18[0]`,
  capacity: `${W8}c1_02[0]`,
  signature: `${W8}f_20[0]`,
  date: `${W8}Date[0]`,
  printName: `${W8}f_21[0]`,
};

/** Who signed and how. Printed on the record page and saved (minus the TIN) in tax_events. */
export interface TaxSignatureRecord {
  document_id: string;
  form_revision: string;
  template_sha256: string;
  signer_typed_name: string;
  signer_email: string;
  signer_user_id: string;
  signer_ip: string;
  signer_user_agent: string;
  signed_at_utc: string;
  signed_at_local: string;
  signer_timezone: string;
  /** Date printed on the form: MM/DD/YYYY (W-9) or MM-DD-YYYY (W-8BEN). */
  form_date: string;
  signature_style: string;
}

export interface BuildOpts {
  /** Omit for an unsigned preview (watermarked). */
  signature?: TaxSignatureRecord;
}

const INK = rgb(0.05, 0.1, 0.35);
const GREY = rgb(0.4, 0.4, 0.4);

/** Helvetica can only draw WinAnsi; strip accents (and drop anything else) so filling never throws. */
function winAnsi(font: PDFFont, s: string): string {
  let out = "";
  for (const ch of s) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
      try {
        font.encodeText(base);
        out += base;
      } catch {
        out += "?";
      }
    }
  }
  return out;
}

async function scriptFonts(doc: PDFDocument) {
  doc.registerFontkit(fontkit);
  const script = await doc.embedFont(load(FONT_FILE), { subset: true });
  const fallback = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const glyphs = new Set<number>(script.getCharacterSet());
  return { script, fallback, glyphs };
}

/** Typed name drawn in Great Vibes (fallback serif for missing glyphs), shrunk to fit. */
async function drawSignature(doc: PDFDocument, page: PDFPage, text: string, x: number, baseline: number, maxWidth: number, maxSize: number) {
  const f = await scriptFonts(doc);
  const runs: { font: PDFFont; text: string }[] = [];
  for (const ch of text) {
    const font = f.glyphs.has(ch.codePointAt(0)!) ? f.script : f.fallback;
    const piece = font === f.script ? ch : winAnsi(font, ch);
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += piece;
    else runs.push({ font, text: piece });
  }
  const sizeFor = (r: { font: PDFFont }, size: number) => (r.font === f.script ? size : size * 0.62);
  const width = (size: number) => runs.reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, sizeFor(r, size)), 0);
  let size = maxSize;
  while (size > 8 && width(size) > maxWidth) size -= 0.5;
  let cx = x;
  for (const r of runs) {
    page.drawText(r.text, { x: cx, y: baseline, size: sizeFor(r, size), font: r.font, color: INK });
    cx += r.font.widthOfTextAtSize(r.text, sizeFor(r, size));
  }
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function watermark(page: PDFPage, font: PDFFont) {
  const { width, height } = page.getSize();
  page.drawText("PREVIEW. NOT SIGNED.", {
    x: width * 0.18,
    y: height * 0.35,
    size: 44,
    font,
    color: rgb(0.85, 0.1, 0.1),
    opacity: 0.18,
    rotate: degrees(35),
  });
}

/** Appends the electronic signature record page. */
async function addRecordPage(doc: PDFDocument, formLabel: string, certification: string[], rec: TaxSignatureRecord) {
  const page = doc.addPage([612, 792]);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 54;
  let y = 792 - M;
  const text = (s: string, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const font = o.font ?? reg;
    const size = o.size ?? 9;
    for (const line of wrap(font, winAnsi(font, s), size, 612 - 2 * M)) {
      page.drawText(line, { x: M, y: y - size, size, font, color: o.color ?? rgb(0, 0, 0) });
      y -= size * 1.4;
    }
    y -= o.gap ?? 0;
  };
  text("Electronic signature record", { font: bold, size: 15, gap: 4 });
  text(`${formLabel}, signed electronically in the KESHAH creator portal.`, { size: 10, gap: 10 });
  const rows: [string, string][] = [
    ["Document ID", rec.document_id],
    ["Form", rec.form_revision],
    ["Official form SHA-256", rec.template_sha256],
    ["Signed by (typed name)", rec.signer_typed_name],
    ["Signature", `${rec.signature_style}: "${adoptedSignatureText(rec.signer_typed_name)}"`],
    ["Signer email", rec.signer_email],
    ["Signer account ID", rec.signer_user_id],
    ["Signed at (UTC)", rec.signed_at_utc],
    ["Signed at (local)", `${rec.signed_at_local} (${rec.signer_timezone})`],
    ["IP address", rec.signer_ip],
    ["Device", rec.signer_user_agent],
  ];
  for (const [k, v] of rows) {
    const vLines = wrap(reg, winAnsi(reg, v), 9, 612 - 2 * M - 150);
    page.drawText(k, { x: M, y: y - 9, size: 9, font: bold });
    vLines.forEach((l, i) => page.drawText(l, { x: M + 150, y: y - 9 - i * 12.6, size: 9, font: reg }));
    y -= Math.max(1, vLines.length) * 12.6 + 3;
  }
  y -= 8;
  text("How the signer was identified", { font: bold, size: 10, gap: 2 });
  text(
    "The signer was signed in to their own KESHAH creator portal account (password login tied to the email above). " +
      "They filled in the form, were shown every entry and the full certification below before signing, ticked a box " +
      "confirming the certification under penalties of perjury, and adopted their signature by typing their full name.",
    { gap: 8 },
  );
  text("Certification the signer agreed to (verbatim from the form)", { font: bold, size: 10, gap: 2 });
  for (const line of certification) text(line, { size: 8.5, gap: 1 });
  y -= 6;
  text(IRS_CONSENT_STATEMENT, { size: 8.5, color: GREY });
}

async function finish(doc: PDFDocument, keepPages: number): Promise<Uint8Array> {
  doc.getForm().flatten();
  // Copy the kept pages into a fresh document so the instruction pages' objects are dropped too.
  const out = await PDFDocument.create();
  out.setTitle(doc.getTitle() ?? "");
  out.setSubject(doc.getSubject() ?? "");
  const pages = await out.copyPages(doc, Array.from({ length: Math.min(keepPages, doc.getPageCount()) }, (_, i) => i));
  for (const p of pages) out.addPage(p);
  return out.save({ useObjectStreams: false });
}

/** Fills Form W-9. Only page 1 (the form itself) is kept; pages 2-6 are general instructions. */
export async function buildW9Pdf(input: W9Input, opts: BuildOpts = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(w9Template(), { updateMetadata: false });
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const set = (name: string, value: string) => {
    const f = form.getTextField(name);
    const max = f.getMaxLength();
    f.setText(winAnsi(helv, max ? value.slice(0, max) : value));
  };
  set(W9_FIELD.name, input.name);
  if (input.business_name) set(W9_FIELD.business, input.business_name);
  form.getCheckBox(W9_FIELD.classBox(W9_CLASS_INDEX[input.classification])).check();
  if (input.classification === "llc") set(W9_FIELD.llcCode, input.llc_code);
  if (input.classification === "other") set(W9_FIELD.otherText, input.other_text);
  if (input.foreign_partners) form.getCheckBox(W9_FIELD.foreignPartners).check();
  if (input.exempt_payee_code) set(W9_FIELD.exemptPayee, input.exempt_payee_code);
  if (input.fatca_code) set(W9_FIELD.fatca, input.fatca_code);
  set(W9_FIELD.address, input.address);
  set(W9_FIELD.cityStateZip, `${input.city}, ${input.state} ${input.zip}`);
  if (input.tin_type === "ssn") {
    set(W9_FIELD.ssn[0], input.tin.slice(0, 3));
    set(W9_FIELD.ssn[1], input.tin.slice(3, 5));
    set(W9_FIELD.ssn[2], input.tin.slice(5));
  } else {
    set(W9_FIELD.ein[0], input.tin.slice(0, 2));
    set(W9_FIELD.ein[1], input.tin.slice(2));
  }
  form.updateFieldAppearances(helv);

  const page = doc.getPage(0);
  if (input.backup_withholding) {
    // Certification instructions: cross out item 2.
    for (const [x1, x2, y] of [
      [36, 561, 306.4],
      [45, 575, 296.8],
      [45, 207, 287.2],
    ]) {
      page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.9, color: INK });
    }
  }
  const sig = opts.signature;
  if (sig) {
    // "Signature of U.S. person" line runs from x~118 to ~380 at y~194; "Date" from x~405.
    await drawSignature(doc, page, adoptedSignatureText(sig.signer_typed_name), 122, 197, 255, 22);
    page.drawText(sig.form_date, { x: 410, y: 198, size: 10, font: helv, color: INK });
  } else {
    watermark(page, await doc.embedFont(StandardFonts.HelveticaBold));
  }
  const bytes = await finish(doc, 1);
  if (!sig) return bytes;
  const out = await PDFDocument.load(bytes);
  await addRecordPage(out, W9_REVISION, input.backup_withholding ? [...W9_CERTIFICATION, "(Item 2 crossed out by the signer: subject to backup withholding.)"] : W9_CERTIFICATION, sig);
  return out.save({ useObjectStreams: false });
}

/** "2026-10-06" -> "10-06-2026" (the W-8BEN date format). */
export const mmddyyyy = (iso: string, sep = "-") => `${iso.slice(5, 7)}${sep}${iso.slice(8, 10)}${sep}${iso.slice(0, 4)}`;

export async function buildW8benPdf(input: W8benInput, opts: BuildOpts = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(w8benTemplate(), { updateMetadata: false });
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const set = (name: string, value: string) => {
    if (!value) return;
    const f = form.getTextField(name);
    const max = f.getMaxLength();
    f.setText(winAnsi(helv, max ? value.slice(0, max) : value));
  };
  set(W8_FIELD.name, input.name);
  set(W8_FIELD.citizenship, input.citizenship);
  set(W8_FIELD.address, input.address);
  set(W8_FIELD.city, input.city);
  set(W8_FIELD.country, input.country);
  set(W8_FIELD.mailAddress, input.mailing_address);
  set(W8_FIELD.mailCity, input.mailing_city);
  set(W8_FIELD.mailCountry, input.mailing_country);
  if (input.us_tin) set(W8_FIELD.usTin, `${input.us_tin.slice(0, 3)}-${input.us_tin.slice(3, 5)}-${input.us_tin.slice(5)}`);
  if (input.ftin_status === "have") set(W8_FIELD.ftin, input.ftin);
  if (input.ftin_status === "none") set(W8_FIELD.ftin, `None: ${input.ftin_reason}`);
  if (input.ftin_status === "not_required") form.getCheckBox(W8_FIELD.ftinNotRequired).check();
  set(W8_FIELD.dob, mmddyyyy(input.dob));
  if (input.claim_treaty) {
    set(W8_FIELD.treatyCountry, input.treaty_country);
    set(W8_FIELD.treatyArticle, input.treaty_article);
    set(W8_FIELD.treatyRate, input.treaty_rate);
    set(W8_FIELD.treatyIncome, input.treaty_income_type);
    set(W8_FIELD.treatyConditions, input.treaty_conditions);
  }
  const sig = opts.signature;
  if (sig) {
    form.getCheckBox(W8_FIELD.capacity).check();
    set(W8_FIELD.date, sig.form_date);
    set(W8_FIELD.printName, input.name);
  }
  // The empty digital-signature field can't be flattened; the adopted signature is drawn instead.
  // (form.removeField throws on a widget with no appearance, so unlink it by hand.)
  const sigField = form.getFieldMaybe(W8_FIELD.signature);
  if (sigField) {
    for (const w of sigField.acroField.getWidgets()) {
      const ref = doc.context.getObjectRef(w.dict);
      if (ref) for (const p of doc.getPages()) p.node.removeAnnot(ref);
    }
    form.acroForm.removeField(sigField.acroField);
  }
  form.updateFieldAppearances(helv);
  const page = doc.getPage(0);
  if (sig) await drawSignature(doc, page, adoptedSignatureText(sig.signer_typed_name), 112, 74, 305, 18);
  else watermark(page, await doc.embedFont(StandardFonts.HelveticaBold));
  const bytes = await finish(doc, 1);
  if (!sig) return bytes;
  const out = await PDFDocument.load(bytes);
  await addRecordPage(out, W8BEN_REVISION, [...W8BEN_CERTIFICATION, W8BEN_CAPACITY], sig);
  return out.save({ useObjectStreams: false });
}
