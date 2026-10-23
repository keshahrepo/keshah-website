// GET  /api/founder/tests: every test (newest first) with its before / after.
// POST /api/founder/tests: add one { title, metric, scope, started_on, area?, window_days?, notes? }.
// Results are recomputed at most hourly and kept on the doc (lib/founder/tests.ts).
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import { computeResult, METRICS, scopeName, TESTS_COLLECTION, type Metric, type TestDoc } from "@/lib/founder/tests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOUR = 3600000;

export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const snap = await getFirebaseAdmin().db.collection(TESTS_COLLECTION).orderBy("started_on", "desc").get();
  const tests = await Promise.all(
    snap.docs.map(async (d) => {
      const t = d.data() as TestDoc & { result?: unknown; result_at?: string; scope_name?: string };
      let result = t.result ?? null;
      const stale = !t.result_at || Date.now() - Date.parse(t.result_at) > HOUR;
      if (fresh || stale) {
        try {
          result = await computeResult(t);
          await d.ref.set({ result, result_at: new Date().toISOString() }, { merge: true });
        } catch (e) {
          console.error("test result", d.id, e instanceof Error ? e.message : e);
        }
      }
      return { id: d.id, ...t, result, result_at: undefined };
    }),
  );
  return NextResponse.json({ tests });
}

export async function POST(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(b.title ?? "").trim().slice(0, 140);
  const metric = String(b.metric ?? "") as Metric;
  const scope = String(b.scope ?? "").trim();
  const started = String(b.started_on ?? "");
  if (!title || !METRICS.includes(metric) || !scope || !/^\d{4}-\d{2}-\d{2}$/.test(started)) {
    return NextResponse.json({ error: "title, metric, scope and started_on (yyyy-mm-dd) are required" }, { status: 400 });
  }
  const doc: TestDoc & Record<string, unknown> = {
    title,
    area: String(b.area ?? "content").slice(0, 30),
    metric,
    scope,
    scope_name: await scopeName(scope),
    started_on: started,
    window_days: Math.max(3, Math.min(60, Number(b.window_days) || 14)),
    status: "running",
    ended_on: null,
    notes: String(b.notes ?? "").slice(0, 500),
    created_at: FieldValue.serverTimestamp(),
  };
  const ref = await getFirebaseAdmin().db.collection(TESTS_COLLECTION).add(doc);
  return NextResponse.json({ ok: true, id: ref.id });
}
