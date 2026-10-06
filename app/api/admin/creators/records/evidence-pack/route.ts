import { NextRequest, NextResponse } from "next/server";
import {
  PAYMENT_METHOD_LABEL,
  bucket,
  buildZip,
  invoiceHtml,
  isDate,
  paidInvoices,
  requireAdmin,
  safeFilename,
  signedReadUrl,
  toCsv,
} from "@/lib/creators/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function download(path: string | undefined | null): Promise<Buffer | null> {
  if (!path) return null;
  try {
    const [buf] = await bucket().file(path).download();
    return buf;
  } catch {
    return null;
  }
}

function ext(path: string): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(path);
  return m ? m[1].toLowerCase() : "bin";
}

// POST /api/admin/creators/records/evidence-pack { from, to }
// Builds a ZIP of every invoice PAID in [from, to]:
//   ledger.csv
//   <Creator>/<yyyy-mm>/invoice-<number>.html
//   <Creator>/<yyyy-mm>/payment-proof-<number>.<ext>
//   <Creator>/<yyyy-mm>/contract.pdf
// The ZIP is written to storage (creators/_exports/) and a signed download URL
// is returned, which avoids the serverless response-size cap.
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { from?: string; to?: string };
  if (!isDate(body.from) || !isDate(body.to) || body.from > body.to) {
    return NextResponse.json({ error: "from / to must be yyyy-mm-dd with from <= to" }, { status: 400 });
  }
  const { creators, records } = await paidInvoices(body.from, body.to);
  if (!records.length) return NextResponse.json({ error: "No paid invoices in that range" }, { status: 404 });
  const byId = new Map(creators.map((c) => [c.id, c]));

  const files: { name: string; data: Uint8Array | string }[] = [];
  const contractCache = new Map<string, Buffer | null>();
  const missing: string[] = [];

  for (const r of records) {
    const c = byId.get(r.creatorId)!;
    const folder = `${safeFilename(r.creatorName || c.id)}/${r.invoice.month || r.paidOn.slice(0, 7)}`;
    files.push({ name: `${folder}/invoice-${safeFilename(r.invoice.number)}.html`, data: invoiceHtml(c, r.invoice) });

    const proof = await download(r.invoice.payment_proof_path);
    if (proof) files.push({ name: `${folder}/payment-proof-${safeFilename(r.invoice.number)}.${ext(r.invoice.payment_proof_path!)}`, data: proof });
    else missing.push(`${r.creatorName} ${r.invoice.number}: payment proof`);

    if (!contractCache.has(c.id)) contractCache.set(c.id, await download(c.contract.pdf_path));
    const contract = contractCache.get(c.id);
    if (contract) {
      if (!files.some((f) => f.name === `${folder}/contract.pdf`)) files.push({ name: `${folder}/contract.pdf`, data: contract });
    } else if (!missing.includes(`${r.creatorName}: contract`)) {
      missing.push(`${r.creatorName}: contract`);
    }
  }

  files.unshift({
    name: "ledger.csv",
    data: toCsv([
      ["date", "creator", "invoice_number", "period", "amount_usd", "method", "reference", "contract_status", "w9_on_file"],
      ...records.map((r) => {
        const c = byId.get(r.creatorId)!;
        return [
          r.paidOn,
          r.creatorName,
          r.invoice.number,
          r.invoice.month,
          ((r.invoice.total_cents || 0) / 100).toFixed(2),
          PAYMENT_METHOD_LABEL,
          r.invoice.payment_reference ?? "",
          c.contract.status,
          c.w9_on_file ? "yes" : "no",
        ];
      }),
    ]),
  });
  if (missing.length) files.push({ name: "MISSING.txt", data: missing.join("\n") + "\n" });

  const zip = buildZip(files);
  const path = `creators/_exports/e2-evidence-${body.from}-to-${body.to}-${Date.now().toString(36)}.zip`;
  await bucket().file(path).save(zip, { contentType: "application/zip", resumable: false });
  const url = await signedReadUrl(path, 60);
  return NextResponse.json({ url, invoices: records.length, files: files.length, missing, bytes: zip.length });
}
