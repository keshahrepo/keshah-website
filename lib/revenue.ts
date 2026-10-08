/**
 * RevenueCat project overview, shared by the web overview and the founder app.
 * Tries the v2 metrics API, then the v1 overview (what the original route fell
 * back to), and flattens whichever answers into the same fields.
 */
export interface RevenueOverview {
  mrr?: number;
  active_subscribers?: number;
  active_trials?: number;
  revenue?: number;
  new_customers?: number;
  active_users?: number;
  /** Which API answered, or why none did (shown to the founder when numbers are missing). */
  source?: string;
  error?: string;
}

/** Pull numbers out of either shape: { metrics: [{ id, value }] } or flat keys. */
export function flattenOverview(data: unknown): RevenueOverview {
  const flat: Record<string, number> = {};
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const metrics = Array.isArray(obj.metrics) ? obj.metrics : [];
  for (const m of metrics as Array<Record<string, unknown>>) {
    if (typeof m?.id === "string" && typeof m?.value === "number") flat[m.id] = m.value;
  }
  for (const [k, v] of Object.entries(obj)) if (typeof v === "number") flat[k] = v;
  const pick = (...keys: string[]) => keys.map((k) => flat[k]).find((v) => typeof v === "number");
  return {
    mrr: pick("mrr"),
    active_subscribers: pick("active_subscriptions", "active_subscribers", "active_subscribers_count", "active_subscriptions_count"),
    active_trials: pick("active_trials", "active_trials_count"),
    revenue: pick("revenue", "revenue_last_28_days"),
    new_customers: pick("new_customers", "new_customers_count"),
    active_users: pick("active_users", "active_users_count"),
  };
}

export async function revenueOverview(): Promise<RevenueOverview> {
  // A v2 secret key with Charts & metrics read access; the main key may not have it.
  const apiKey = process.env.REVENUECAT_METRICS_KEY || process.env.REVENUECAT_API_KEY;
  if (!apiKey) return { error: "RevenueCat key not set" };
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const errors: string[] = [];
  const project = (await projectId(headers)) ?? "app4e0f50f36b";
  for (const [source, url] of [
    ["v2", `https://api.revenuecat.com/v2/projects/${project}/metrics/overview`],
    ["v1", "https://api.revenuecat.com/v1/developers/me/overview"],
  ] as const) {
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
        errors.push(`${source} ${res.status}${body ? ` ${body}` : ""}`);
        continue;
      }
      const data = await res.json();
      const out = flattenOverview(data);
      if (out.mrr === undefined && out.active_trials === undefined && out.active_subscribers === undefined) {
        errors.push(`${source} no metrics (keys: ${Object.keys(data ?? {}).slice(0, 8).join(",")})`);
        continue;
      }
      return { ...out, source };
    } catch (e) {
      errors.push(`${source} ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.error("revenue overview failed:", errors.join("; "));
  return { error: errors.join("; ") };
}

let cachedProject: string | null = null;

/** The project the key belongs to: REVENUECAT_PROJECT_ID, else the first one /v2/projects lists. */
async function projectId(headers: Record<string, string>): Promise<string | null> {
  if (process.env.REVENUECAT_PROJECT_ID) return process.env.REVENUECAT_PROJECT_ID;
  if (cachedProject) return cachedProject;
  try {
    const res = await fetch("https://api.revenuecat.com/v2/projects", { headers, cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const keshah = items.find((p: { name?: string }) => /keshah/i.test(String(p?.name ?? ""))) ?? items[0];
    cachedProject = typeof keshah?.id === "string" ? keshah.id : null;
    if (cachedProject) console.log("revenuecat project:", cachedProject, keshah?.name ?? "");
    return cachedProject;
  } catch {
    return null;
  }
}
