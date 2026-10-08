import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";

// Proxy to RevenueCat REST API for subscription revenue
export async function GET() {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const apiKey = process.env.REVENUECAT_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "RevenueCat API key not configured" }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.revenuecat.com/v2/projects/app4e0f50f36b/metrics/overview", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 300 }, // cache for 5 minutes
    });

    if (!res.ok) {
      // Fallback: try the v1 overview endpoint
      const v1Res = await fetch("https://api.revenuecat.com/v1/developers/me/overview", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!v1Res.ok) {
        throw new Error(`RevenueCat API error: ${v1Res.status}`);
      }

      const v1Data = await v1Res.json();
      return NextResponse.json(v1Data);
    }

    const data = await res.json();
    // v2 returns metrics: [{ id, value }]; flatten the ones the dashboard and the founder app read.
    const flat: Record<string, number> = {};
    for (const m of Array.isArray(data?.metrics) ? data.metrics : []) {
      if (typeof m?.id === "string" && typeof m?.value === "number") flat[m.id] = m.value;
    }
    return NextResponse.json({
      ...data,
      ...(flat.mrr !== undefined ? { mrr: flat.mrr } : {}),
      ...(flat.active_subscriptions !== undefined ? { active_subscribers: flat.active_subscriptions } : {}),
      ...(flat.active_trials !== undefined ? { active_trials: flat.active_trials } : {}),
      ...(flat.revenue !== undefined ? { revenue: flat.revenue } : {}),
      ...(flat.new_customers !== undefined ? { new_customers: flat.new_customers } : {}),
      ...(flat.active_users !== undefined ? { active_users: flat.active_users } : {}),
    });
  } catch (error) {
    console.error("RevenueCat error:", error);
    return NextResponse.json({ error: "Failed to fetch revenue data" }, { status: 500 });
  }
}
