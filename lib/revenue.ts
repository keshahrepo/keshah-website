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
    if (!res.ok) {
      console.error("revenuecat projects lookup:", res.status, (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200));
      return null;
    }
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const keshah = items.find((p: { name?: string }) => /keshah/i.test(String(p?.name ?? ""))) ?? items[0];
    cachedProject = typeof keshah?.id === "string" ? keshah.id : null;
    console.log("revenuecat projects:", items.map((p: { id?: string; name?: string }) => `${p?.id}:${p?.name}`).join(", "));
    return cachedProject;
  } catch {
    return null;
  }
}

/**
 * Exact revenue for an inclusive date range, straight from RevenueCat
 * (GET /v2/projects/{id}/metrics/revenue). type: "revenue" (gross) or
 * "proceeds" (after taxes and store commission). Throws when RevenueCat
 * doesn't answer, so callers never show a made-up number.
 */
export async function rcRevenue(startDate: string, endDate: string, type: "revenue" | "proceeds"): Promise<number> {
  const apiKey = process.env.REVENUECAT_METRICS_KEY || process.env.REVENUECAT_API_KEY;
  if (!apiKey) throw new Error("RevenueCat key not set");
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const project = (await projectId(headers)) ?? "app4e0f50f36b";
  const q = new URLSearchParams({ start_date: startDate, end_date: endDate, currency: "USD", revenue_type: type });
  const res = await fetch(`https://api.revenuecat.com/v2/projects/${project}/metrics/revenue?${q}`, { headers, cache: "no-store" });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    throw new Error(`RevenueCat ${res.status} ${body}`);
  }
  const data = await res.json();
  if (typeof data?.value !== "number") throw new Error("RevenueCat returned no value");
  return data.value;
}

/** RevenueCat chart options (resolutions, segments, filters, selectors) for a chart. */
export async function rcChartOptions(chart: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.REVENUECAT_METRICS_KEY || process.env.REVENUECAT_API_KEY;
  if (!apiKey) throw new Error("RevenueCat key not set");
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const project = (await projectId(headers)) ?? "app4e0f50f36b";
  const res = await fetch(`https://api.revenuecat.com/v2/projects/${project}/charts/${chart}/options`, { headers, cache: "no-store" });
  const body = await res.text();
  if (!res.ok) throw new Error(`RevenueCat ${res.status} ${body.replace(/\s+/g, " ").slice(0, 200)}`);
  return JSON.parse(body);
}

/** Raw RevenueCat chart data (GET /charts/{chart}) with query params. */
export async function rcChart(chart: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const apiKey = process.env.REVENUECAT_METRICS_KEY || process.env.REVENUECAT_API_KEY;
  if (!apiKey) throw new Error("RevenueCat key not set");
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const project = (await projectId(headers)) ?? "app4e0f50f36b";
  const res = await fetch(`https://api.revenuecat.com/v2/projects/${project}/charts/${chart}?${new URLSearchParams(params)}`, { headers, cache: "no-store" });
  const body = await res.text();
  if (!res.ok) throw new Error(`RevenueCat ${res.status} ${body.replace(/\s+/g, " ").slice(0, 300)}`);
  return JSON.parse(body);
}

/**
 * RevenueCat revenue (or proceeds) for an inclusive date range, split by
 * attribution campaign (the campaign a creator's link sets). Keys are the
 * campaign names as RevenueCat shows them ("Isai TikTok", "No campaign", "Total").
 */
export async function rcRevenueByCampaign(startDate: string, endDate: string, type: "revenue" | "proceeds"): Promise<Map<string, number>> {
  const o = await rcChart("revenue", {
    resolution: "2",
    start_date: startDate,
    end_date: endDate,
    segment: "attribution_campaign",
    currency: "USD",
    selectors: JSON.stringify({ revenue_type: type }),
  });
  // The first measure is the money column; its name follows revenue_type ("Revenue", "Proceeds"…).
  const measure = String(((o.measures as Array<Record<string, unknown>> | undefined) ?? [])[0]?.display_name ?? "Revenue");
  const total = ((o.summary as Record<string, unknown> | undefined)?.total ?? {}) as Record<string, Record<string, number>>;
  const out = new Map<string, number>();
  for (const [name, m] of Object.entries(total)) if (typeof m?.[measure] === "number") out.set(name, m[measure]);
  if (!out.has("Total")) {
    throw new Error(`RevenueCat chart had no totals (measure ${measure}; keys ${Object.keys(total).slice(0, 5).join(",")}; ${JSON.stringify(Object.values(total)[0] ?? {}).slice(0, 120)})`);
  }
  return out;
}
