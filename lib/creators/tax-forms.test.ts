// Run: npx tsx --test lib/creators/tax-forms.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  checkSignature,
  isValidEin,
  isValidRoutingNumber,
  isValidSsnOrItin,
  validateBank,
  validateW8ben,
  validateW9,
} from "./payment-validate";
import { buildW8benPdf, buildW9Pdf, type TaxSignatureRecord } from "./tax-forms";

test("ABA routing checksum", () => {
  for (const ok of ["021000021", "011000015", "122105155", "026009593", "322271627"]) assert.ok(isValidRoutingNumber(ok), ok);
  for (const bad of ["021000022", "12345678", "1234567890", "000000000", "abcdefghi", "991000021"]) assert.ok(!isValidRoutingNumber(bad), bad);
});

test("bank validation: confirm match, account length, type", () => {
  const base = { account_holder: "Maria  Gomez", bank_name: "Chase", routing_number: "021000021", account_number: "000123456789", account_number_confirm: "000123456789", account_type: "checking" };
  const r = validateBank(base);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.bank.account_holder, "Maria Gomez");
  assert.equal((validateBank({ ...base, account_number_confirm: "000123456780" }) as { field: string }).field, "account_number_confirm");
  assert.equal((validateBank({ ...base, account_number: "123", account_number_confirm: "123" }) as { field: string }).field, "account_number");
  assert.equal((validateBank({ ...base, account_number: "1".repeat(18), account_number_confirm: "1".repeat(18) }) as { field: string }).field, "account_number");
  assert.equal((validateBank({ ...base, routing_number: "021000022" }) as { field: string }).field, "routing_number");
  assert.equal((validateBank({ ...base, account_type: "brokerage" }) as { field: string }).field, "account_type");
});

test("SSN / ITIN / EIN formats", () => {
  assert.ok(isValidSsnOrItin("123-45-6780"));
  assert.ok(isValidSsnOrItin("912-70-1234"), "ITIN");
  for (const bad of ["000-12-3456", "666-12-3456", "123-00-4567", "123-45-0000", "912-40-1234", "111111111", "12345678"]) assert.ok(!isValidSsnOrItin(bad), bad);
  assert.ok(isValidEin("12-3456789"));
  assert.ok(!isValidEin("07-1234567"));
  assert.ok(!isValidEin("1234567"));
});

const w9Raw = {
  name: "Maria Gomez",
  business_name: "",
  classification: "individual",
  address: "123 Main St Apt 4",
  city: "Austin",
  state: "tx",
  zip: "78701",
  tin_type: "ssn",
  tin: "123-45-6780",
};

test("W-9 validation", () => {
  const r = validateW9(w9Raw);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.state, "TX");
    assert.equal(r.value.tin, "123456780");
    assert.equal(r.value.foreign_partners, false);
  }
  assert.equal((validateW9({ ...w9Raw, classification: "llc" }) as { field: string }).field, "llc_code");
  assert.ok(validateW9({ ...w9Raw, classification: "llc", llc_code: "s" }).ok);
  assert.equal((validateW9({ ...w9Raw, zip: "7870" }) as { field: string }).field, "zip");
  assert.equal((validateW9({ ...w9Raw, tin_type: "ein", tin: "07-1234567" }) as { field: string }).field, "tin");
  assert.equal((validateW9({ ...w9Raw, fatca_code: "Z" }) as { field: string }).field, "fatca_code");
});

const w8Raw = {
  name: "Isai Pérez",
  citizenship: "Spain",
  address: "Calle Mayor 10, 2B",
  city: "Madrid 28013",
  country: "Spain",
  ftin_status: "have",
  ftin: "12345678Z",
  dob: "1999-04-12",
};

test("W-8BEN validation", () => {
  assert.ok(validateW8ben(w8Raw).ok);
  assert.equal((validateW8ben({ ...w8Raw, country: "USA" }) as { field: string }).field, "country");
  assert.equal((validateW8ben({ ...w8Raw, address: "PO Box 12" }) as { field: string }).field, "address");
  assert.equal((validateW8ben({ ...w8Raw, ftin_status: "none" }) as { field: string }).field, "ftin_reason");
  assert.ok(validateW8ben({ ...w8Raw, ftin_status: "not_required", ftin: "" }).ok);
  assert.equal((validateW8ben({ ...w8Raw, dob: "1999-02-30" }) as { field: string }).field, "dob");
  const t = validateW8ben({ ...w8Raw, claim_treaty: false, treaty_country: "Spain" });
  assert.ok(t.ok && t.value.treaty_country === "", "treaty fields dropped unless claimed");
});

test("signature must match line 1 for individuals", () => {
  assert.equal(checkSignature("maria gomez", "Maria Gomez", true), null);
  assert.match(checkSignature("Maria G", "Maria Gomez", true)!, /exactly/);
  assert.equal(checkSignature("Jane Officer", "Acme LLC", false), null);
  assert.ok(checkSignature(" ", "Maria Gomez", true));
});

const sig: TaxSignatureRecord = {
  document_id: "test-doc",
  form_revision: "test",
  template_sha256: "abc",
  signer_typed_name: "maria gomez",
  signer_email: "maria@example.com",
  signer_user_id: "c1",
  signer_ip: "1.2.3.4",
  signer_user_agent: "test",
  signed_at_utc: "2026-10-06T15:00:00.000Z",
  signed_at_local: "October 6, 2026 at 10:00:00 AM CDT",
  signer_timezone: "America/Chicago",
  form_date: "10/06/2026",
  signature_style: "Great Vibes typed",
};

test("W-9 PDF: filled, flattened, form page + record page", async () => {
  const r = validateW9({ ...w9Raw, backup_withholding: true });
  assert.ok(r.ok);
  if (!r.ok) return;
  const bytes = await buildW9Pdf(r.value, { signature: sig });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2);
  assert.equal(doc.getForm().getFields().length, 0, "flattened");
  const preview = await PDFDocument.load(await buildW9Pdf(r.value));
  assert.equal(preview.getPageCount(), 1);
});

test("W-8BEN PDF: accents survive, flattened, record page", async () => {
  const r = validateW8ben({ ...w8Raw, claim_treaty: true, treaty_country: "Spain" });
  assert.ok(r.ok);
  if (!r.ok) return;
  const doc = await PDFDocument.load(await buildW8benPdf(r.value, { signature: { ...sig, signer_typed_name: "Isai Pérez", form_date: "10-06-2026" } }));
  assert.equal(doc.getPageCount(), 2);
  assert.equal(doc.getForm().getFields().length, 0);
});
