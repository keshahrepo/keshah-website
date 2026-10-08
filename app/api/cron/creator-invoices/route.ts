// Cron (daily 09:00 UTC, see vercel.json): self-billing. From the 1st of a
// month (creator-local), drafts last month's invoice if missing and submits
// any still-draft one on the creator's behalf, opening a 3-day dispute
// window. Emails + pushes the creator (not for $0 invoices). Reruns never
// resubmit: only a draft -> submitted transition sends anything.
// See lib/creators/invoice-auto.ts.
//
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
// GET ?dry=1 lists who is due without writing or sending.

import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { autoSubmitInvoice, draftOrGetInvoice, listCreators } from "@/lib/creators/db";
import { CREATOR_FROM_NAME } from "@/lib/creators/invite";
import { runInvoiceAutoSubmit } from "@/lib/creators/invoice-auto";
import { emailConfigured, sendEmail } from "@/lib/email";
import { notify } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const report = await runInvoiceAutoSubmit(
      {
        // Inactive creators only when they have an ended_on (invoiceMonthDue then
        // stops after their final month); a deactivated creator with no end date is skipped.
        // Only creators actually paid through this system: old-program records with a
        // fallback start date (e.g. March 2026 managers) never get invoices.
        listCreators: async () => (await listCreators({ includeInactive: true })).filter((c) => (c.is_active || !!c.ended_on) && !c.legacy_start),
        draftOrGet: (id, month, now) => draftOrGetInvoice(id, month, { now }),
        autoSubmit: (id, number, now) => autoSubmitInvoice(id, number, { now }),
        sendEmail: async (to, subject, text) => {
          if (!emailConfigured()) throw new Error("email not configured");
          await sendEmail({ to, subject, text, fromName: CREATOR_FROM_NAME });
        },
        push: (target, msg) => notify(target, msg),
      },
      { dry },
    );
    return NextResponse.json({ ok: true, dry, report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
