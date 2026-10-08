/** RevenueCat project overview (v2 metrics, flattened), shared by the web overview and the founder app. */
export interface RevenueOverview {
  mrr?: number;
  active_subscribers?: number;
  active_trials?: number;
  revenue?: number;
  new_customers?: number;
  active_users?: number;
}

export async function revenueOverview(): Promise<RevenueOverview | null> {
  const apiKey = process.env.REVENUECAT_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.revenuecat.com/v2/projects/app4e0f50f36b/metrics/overview", {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const flat: Record<string, number> = {};
    for (const m of Array.isArray(data?.metrics) ? data.metrics : []) {
      if (typeof m?.id === "string" && typeof m?.value === "number") flat[m.id] = m.value;
    }
    return {
      mrr: flat.mrr,
      active_subscribers: flat.active_subscriptions,
      active_trials: flat.active_trials,
      revenue: flat.revenue,
      new_customers: flat.new_customers,
      active_users: flat.active_users,
    };
  } catch (e) {
    console.error("revenue overview failed:", e);
    return null;
  }
}
