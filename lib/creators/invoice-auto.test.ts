// Run: npx tsx --test lib/creators/invoice-auto.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoSubmitFields,
  deadlineDate,
  disputeUpdate,
  invoiceMonthDue,
  invoiceReadyEmail,
  invoiceView,
  InvoiceRuleError,
  paidByFor,
  runInvoiceAutoSubmit,
  type AutoSubmitDeps,
} from "./invoice-auto";
import type { CreatorProfile, Invoice } from "./types";

const creator = (over: Partial<CreatorProfile> = {}): CreatorProfile =>
  ({
    id: "c1",
    name: "Jen Smith",
    email: "jen@example.com",
    keshah_email: "",
    is_active: true,
    start_date: "2026-09-10",
    timezone: "America/Los_Angeles",
    ...over,
  }) as CreatorProfile;

/** In-memory invoices + recorders, mimicking draftOrGetInvoice / autoSubmitInvoice semantics. */
function fakeDeps(creators: CreatorProfile[], totalCents = 65000) {
  const invoices = new Map<string, Invoice>();
  const emails: { to: string; subject: string; text: string }[] = [];
  const pushes: { creatorId: string; title: string }[] = [];
  let seq = 0;
  const deps: AutoSubmitDeps = {
    listCreators: async () => creators,
    draftOrGet: async (id, month) => {
      const key = `${id}/${month}`;
      const cur = invoices.get(key);
      if (cur && cur.status !== "draft") return cur;
      const inv: Invoice = cur ?? {
        number: `JS-${String(++seq).padStart(3, "0")}`,
        month,
        lines: [],
        total_cents: totalCents,
        status: "draft",
        locked: false,
      };
      invoices.set(key, inv);
      return inv;
    },
    autoSubmit: async (id, number, now) => {
      const entry = [...invoices.entries()].find(([k, v]) => k.startsWith(`${id}/`) && v.number === number);
      if (!entry || entry[1].status !== "draft") return null;
      const inv: Invoice = { ...entry[1], status: "submitted", ...autoSubmitFields(now) };
      invoices.set(entry[0], inv);
      return inv;
    },
    sendEmail: async (to, subject, text) => {
      emails.push({ to, subject, text });
    },
    push: async (t, msg) => {
      pushes.push({ creatorId: t.creatorId, title: msg.title });
    },
  };
  return { deps, invoices, emails, pushes };
}

const NOV1 = new Date("2026-11-01T09:00:00Z");

test("cron submits last month's invoice once, emails + pushes, and reruns never resubmit", async () => {
  const f = fakeDeps([creator()]);
  const r1 = await runInvoiceAutoSubmit(f.deps, { now: NOV1 });
  assert.equal(r1.length, 1);
  assert.equal(r1[0].month, "2026-10");
  assert.match(r1[0].result, /^submitted, emailed/);
  const inv = f.invoices.get("c1/2026-10")!;
  assert.equal(inv.status, "submitted");
  assert.equal(inv.auto_submitted, true);
  assert.equal(inv.submitted_at, "2026-11-01T09:00:00.000Z");
  assert.equal(inv.dispute_until, "2026-11-04T09:00:00.000Z");
  assert.equal(f.emails.length, 1);
  assert.equal(f.pushes.length, 1);
  assert.equal(f.pushes[0].title, "Your October invoice is in");

  // Next day, and the same day again: nothing new sent, submitted_at untouched.
  const r2 = await runInvoiceAutoSubmit(f.deps, { now: new Date("2026-11-02T09:00:00Z") });
  const r3 = await runInvoiceAutoSubmit(f.deps, { now: NOV1 });
  assert.equal(r2[0].result, "already submitted");
  assert.equal(r3[0].result, "already submitted");
  assert.equal(f.emails.length, 1);
  assert.equal(f.pushes.length, 1);
  assert.equal(f.invoices.get("c1/2026-10")!.submitted_at, "2026-11-01T09:00:00.000Z");
});

test("cron: approved/paid invoices are left alone; a returned-to-draft invoice is re-submitted with a fresh window", async () => {
  const f = fakeDeps([creator()]);
  await runInvoiceAutoSubmit(f.deps, { now: NOV1 });
  const key = "c1/2026-10";
  f.invoices.set(key, { ...f.invoices.get(key)!, status: "approved" });
  const r = await runInvoiceAutoSubmit(f.deps, { now: new Date("2026-11-03T09:00:00Z") });
  assert.equal(r[0].result, "already approved");
  // Admin correction: back to draft (returnInvoiceToDraft clears submitted_at / dispute_until).
  f.invoices.set(key, { ...f.invoices.get(key)!, status: "draft", submitted_at: undefined, dispute_until: null });
  const later = new Date("2026-11-05T09:00:00Z");
  const r2 = await runInvoiceAutoSubmit(f.deps, { now: later });
  assert.match(r2[0].result, /^submitted/);
  assert.equal(f.invoices.get(key)!.dispute_until, "2026-11-08T09:00:00.000Z");
});

test("cron: zero-total invoices are still submitted but not emailed or pushed", async () => {
  const f = fakeDeps([creator()], 0);
  const r = await runInvoiceAutoSubmit(f.deps, { now: NOV1 });
  assert.equal(r[0].result, "submitted (zero, no email)");
  assert.equal(f.invoices.get("c1/2026-10")!.status, "submitted");
  assert.equal(f.emails.length, 0);
  assert.equal(f.pushes.length, 0);
});

test("cron: dry run writes and sends nothing", async () => {
  const f = fakeDeps([creator()]);
  const r = await runInvoiceAutoSubmit(f.deps, { now: NOV1, dry: true });
  assert.equal(r[0].result, "would check");
  assert.equal(f.invoices.size, 0);
  assert.equal(f.emails.length, 0);
});

test("which month is due: creator-local month, pay started, not ended before it", () => {
  // 09:00 UTC Nov 1 is still Oct 31 in Hawaii: October isn't over there yet.
  assert.equal(invoiceMonthDue(creator({ timezone: "Pacific/Honolulu" }), NOV1), "2026-09");
  assert.equal(invoiceMonthDue(creator(), NOV1), "2026-10");
  assert.equal(invoiceMonthDue(creator({ start_date: "" }), NOV1), null);
  assert.equal(invoiceMonthDue(creator({ start_date: "2026-11-01" }), NOV1), null);
  assert.equal(invoiceMonthDue(creator({ start_date: "2026-10-31" }), NOV1), "2026-10");
  assert.equal(invoiceMonthDue(creator({ ended_on: "2026-10-12" }), NOV1), "2026-10");
  // After the end, invoices keep coming through the month the 30-day bonus window closes in (§6.5).
  assert.equal(invoiceMonthDue(creator({ ended_on: "2026-09-30" }), NOV1), "2026-10"); // window ends Oct 30
  assert.equal(invoiceMonthDue(creator({ ended_on: "2026-09-01" }), NOV1), "2026-10"); // Oct 1
  assert.equal(invoiceMonthDue(creator({ ended_on: "2026-08-31" }), NOV1), null); // Sep 30: October isn't invoiced
});

const submitted = (over: Partial<Invoice> = {}): Invoice => ({
  number: "JS-001",
  month: "2026-10",
  lines: [],
  total_cents: 65000,
  status: "submitted",
  locked: false,
  ...autoSubmitFields(NOV1),
  ...over,
});

test("dispute window: allowed before dispute_until, refused at/after it", () => {
  const inv = submitted();
  const upd = disputeUpdate(inv, "  Missing Oct 14 ", new Date("2026-11-04T08:59:59Z"));
  assert.equal(upd.dispute_note, "Missing Oct 14");
  assert.equal(upd.disputed_at, "2026-11-04T08:59:59.000Z");
  assert.throws(() => disputeUpdate(inv, "x", new Date("2026-11-04T09:00:00Z")), InvoiceRuleError);
  assert.throws(() => disputeUpdate(inv, "x", new Date("2026-11-10T00:00:00Z")), /closed/);
});

test("dispute: needs a note, a submitted auto invoice, and no open dispute", () => {
  const t = new Date("2026-11-02T00:00:00Z");
  assert.throws(() => disputeUpdate(submitted(), "   ", t), /what looks wrong/);
  assert.throws(() => disputeUpdate(submitted({ status: "approved" }), "x", t), /approved/);
  assert.throws(() => disputeUpdate(submitted({ status: "paid", locked: true }), "x", t), InvoiceRuleError);
  assert.throws(() => disputeUpdate(submitted({ dispute_until: null }), "x", t), /Slack/);
  assert.throws(() => disputeUpdate(submitted({ disputed_at: "2026-11-01T10:00:00Z" }), "x", t), /already flagged/);
  // Resolved disputes can be flagged again inside the window.
  assert.ok(disputeUpdate(submitted({ disputed_at: "2026-11-01T10:00:00Z", dispute_resolved_at: "2026-11-01T12:00:00Z" }), "x", t));
});

test("paid-by date is submitted_at + 7 days (contract), shown as a never-late local date", () => {
  assert.equal(paidByFor("2026-11-01T09:00:00.000Z"), "2026-11-08T09:00:00.000Z");
  assert.equal(deadlineDate("2026-11-08T09:00:00.000Z", "America/Los_Angeles"), "2026-11-07");
  assert.equal(deadlineDate("2026-11-08T09:00:00.000Z", "Asia/Kolkata"), "2026-11-07");
  const v = invoiceView(submitted(), "America/New_York", new Date("2026-11-02T00:00:00Z"));
  assert.equal(v.paid_by, "2026-11-08T09:00:00.000Z");
  assert.equal(v.paid_by_date, "2026-11-07");
  assert.equal(v.dispute_by_date, "2026-11-03");
  assert.equal(v.can_dispute, true);
  assert.equal(invoiceView(submitted(), "UTC", new Date("2026-11-05T00:00:00Z")).can_dispute, false);
  const draft = invoiceView({ ...submitted(), status: "draft", submitted_at: undefined, dispute_until: null }, "UTC");
  assert.equal(draft.paid_by, null);
  assert.equal(draft.can_dispute, false);
});

test("creator email copy", () => {
  const m = invoiceReadyEmail(submitted(), "Jen", "America/Los_Angeles");
  assert.equal(m.subject, "Your October invoice is in: $650.00");
  assert.match(m.text, /Your October invoice is in: \$650\.00\. It'll be paid by bank transfer by Nov 7\./);
  assert.match(m.text, /tap "Something's off\?" in the app by Nov 3\./);
});

test("cron: an older month sent back to draft is re-submitted, then last month", async () => {
  const f = fakeDeps([creator()]);
  // September was returned to draft for a fix after it went in.
  f.invoices.set("c1/2026-09", { number: "JS-090", month: "2026-09", lines: [], total_cents: 41000, status: "draft", locked: false });
  f.deps.staleDrafts = async (id, before) => [...f.invoices.entries()].filter(([k, v]) => k.startsWith(`${id}/`) && v.status === "draft" && v.month < before).map(([, v]) => v);
  const r = await runInvoiceAutoSubmit(f.deps, { now: NOV1 });
  assert.deepEqual(r.map((x) => [x.month, x.result.split(",")[0]]), [["2026-09", "submitted"], ["2026-10", "submitted"]]);
  assert.equal(f.invoices.get("c1/2026-09")!.status, "submitted");
  assert.equal(f.emails.length, 2);
  // Next day nothing is stale any more.
  const r2 = await runInvoiceAutoSubmit(f.deps, { now: new Date("2026-11-02T09:00:00Z") });
  assert.deepEqual(r2.map((x) => x.result), ["already submitted"]);
});

test("cron: no bank details on file -> the email asks for them instead of promising a transfer", async () => {
  const f = fakeDeps([creator()]);
  f.deps.bankOnFile = async () => false;
  const r = await runInvoiceAutoSubmit(f.deps, { now: NOV1 });
  assert.match(r[0].result, /no bank details/);
  assert.equal(f.emails.length, 1);
  assert.doesNotMatch(f.emails[0].text, /paid by bank transfer/);
  assert.match(f.emails[0].text, /Add your bank details in the app so we can pay you/);
  assert.match(f.emails[0].subject, /Add your bank details/);
  // With bank details (Isai's US bank, or anyone's): the usual line.
  const g = fakeDeps([creator()]);
  g.deps.bankOnFile = async () => true;
  await runInvoiceAutoSubmit(g.deps, { now: NOV1 });
  assert.match(g.emails[0].text, /It'll be paid by bank transfer by/);
});
