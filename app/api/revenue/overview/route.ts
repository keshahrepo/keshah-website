import { NextResponse } from "next/server";

// Proxy to RevenueCat REST API for subscription revenue
export async function GET() {
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
    return NextResponse.json(data);
  } catch (error) {
    console.error("RevenueCat error:", error);
    return NextResponse.json({ error: "Failed to fetch revenue data" }, { status: 500 });
  }
}
