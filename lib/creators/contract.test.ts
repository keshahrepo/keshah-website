// Run: npx tsx --test lib/creators/contract.test.ts
// Set CONTRACT_SAMPLE_OUT=/path/sample.pdf to keep a rendered sample.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "fs";
import { deflateSync } from "zlib";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { CONSENT_TEXT_SHA256, CONSENT_TEXT_VERSION, SIGNATURE_STYLE, __buildSignedPdfForTest, contractSetupProblem, founderSignatureMode, nameMatchesOnFile } from "./contract";
import type { ContractAudit, ContractSettings } from "./types";

async function tinyTemplate(pages = 2): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([612, 792]);
    p.drawText(`Content Creator Agreement, page ${i}`, { x: 64, y: 720, size: 14, font });
  }
  return Buffer.from(await doc.save());
}

/** A valid 4x2 white PNG (no image library needed). */
function tinyPng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.concat([0, 1].map(() => Buffer.concat([Buffer.from([0]), Buffer.alloc(12, 0xff)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function audit(name: string, extra: Partial<ContractAudit> = {}): ContractAudit {
  return {
    document_id: "00000000-1111-2222-3333-444444444444",
    template_version: "v1",
    template_sha256: "a".repeat(64),
    signer_typed_name: name,
    signer_legal_name: name,
    signer_address: "12 Calle Mayor, Austin, TX 78701",
    signer_email: "creator@example.com",
    signer_user_id: "creator123",
    signer_ip: "203.0.113.7",
    signer_user_agent: "Mozilla/5.0 (test)",
    signed_at_utc: "2026-10-06T18:00:00.000Z",
    signed_at_local: "October 6, 2026 at 1:00:00 PM CDT",
    signer_timezone: "America/Chicago",
    consent_text_version: CONSENT_TEXT_VERSION,
    consent_text_sha256: CONSENT_TEXT_SHA256,
    countersigner_name: "Aaditya Agrawal",
    countersigner_title: "Founder & CEO",
    entity_name: "KESHAH, Inc.",
    signature_style: SIGNATURE_STYLE,
    signature_adopted_text: name,
    countersignature_style: SIGNATURE_STYLE,
    countersignature_adopted_text: "Aaditya Agrawal",
    countersignature_adopted_at: "2026-10-01T12:00:00.000Z",
    ...extra,
  };
}

async function assertValid(pdf: Uint8Array, expectedPages: number) {
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
  const back = await PDFDocument.load(pdf);
  assert.equal(back.getPageCount(), expectedPages);
}

test("signed PDF with an accented name and the generated founder signature", async () => {
  const tpl = await tinyTemplate(2);
  const name = "José Núñez";
  const pdf = await __buildSignedPdfForTest(
    tpl,
    "Content Creator Agreement",
    audit(name),
    { kind: "typed", text: "Aaditya Agrawal", adopted_at: "2026-10-01T12:00:00.000Z" },
    "October 6, 2026",
  );
  await assertValid(pdf, 4); // 2 template pages + signature page + audit certificate
  if (process.env.CONTRACT_SAMPLE_OUT) writeFileSync(process.env.CONTRACT_SAMPLE_OUT, pdf);
});

test("characters missing from the script font fall back without throwing", async () => {
  const tpl = await tinyTemplate(1);
  for (const name of ["Zoë Łukasz-Đặng", "李小龍 Bruce", "Ægir Øvergård ŞŽ"]) {
    const pdf = await __buildSignedPdfForTest(tpl, "Agreement", audit(name), { kind: "typed", text: "Aaditya Agrawal", adopted_at: "2026-10-01T12:00:00.000Z" }, "October 6, 2026");
    await assertValid(pdf, 3);
  }
});

test("drawn founder signature override still works", async () => {
  const tpl = await tinyTemplate(1);
  const pdf = await __buildSignedPdfForTest(
    tpl,
    "Agreement",
    audit("Maria Lopez", { countersignature_style: "drawn image", countersignature_sha256: "b".repeat(64), countersignature_adopted_text: undefined, countersignature_adopted_at: undefined }),
    { kind: "drawn", png: tinyPng() },
    "October 6, 2026",
  );
  await assertValid(pdf, 3);
});

test("founder signature readiness", () => {
  const base: ContractSettings = { founder_name: "Aaditya Agrawal", founder_title: "Founder & CEO", entity_name: "KESHAH, Inc." };
  assert.equal(founderSignatureMode(base), null);
  assert.equal(contractSetupProblem(base, true), "Adopt your signature in Settings first");
  assert.equal(contractSetupProblem(base, false), "Upload the final contract and adopt your signature in Settings first");
  const adopted = { ...base, founder_signature_adopted_at: "2026-10-01T00:00:00Z", founder_signature_adopted_text: "Aaditya Agrawal" };
  assert.equal(founderSignatureMode(adopted), "typed");
  assert.equal(contractSetupProblem(adopted, false), "Upload the final contract first");
  assert.equal(contractSetupProblem(adopted, true), null);
  // Name changed after adopting: must adopt again.
  assert.equal(founderSignatureMode({ ...adopted, founder_name: "Aadi Agrawal" }), null);
  // Uploaded PNG without the override flag isn't used; with it, it is (no adoption needed).
  assert.equal(founderSignatureMode({ ...base, signature_path: "contracts/founder_signature.png" }), null);
  assert.equal(founderSignatureMode({ ...base, signature_path: "contracts/founder_signature.png", use_drawn_signature: true }), "drawn");
});

test("nameMatchesOnFile: first and last name as on file, any case, accents or middle names", () => {
  assert.equal(nameMatchesOnFile("Isai Trujillo", "Isai Trujillo"), true);
  assert.equal(nameMatchesOnFile("isai trujillo", "Isai Trujillo"), true);
  assert.equal(nameMatchesOnFile("Isai María Trujillo", "Isai Trujillo"), true);
  assert.equal(nameMatchesOnFile("Isaí Trujillo", "Isai Trujillo"), true);
  assert.equal(nameMatchesOnFile("Isai", "Isai Trujillo"), false);
  assert.equal(nameMatchesOnFile("Jen Lopez", "Isai Trujillo"), false);
});
