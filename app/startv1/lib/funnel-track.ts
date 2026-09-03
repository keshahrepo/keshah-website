"use client";

// Lightweight sub-step tracking for funnel analytics.
// Used inside multi-screen steps like PinchTest (3 screens) and
// FounderStory (23 beats) where the main step-level tracking in
// flow-context.tsx doesn't capture internal drop-offs.

/** Fire-and-forget sub-step event to /api/funnel/track. */
export function trackSubStep(parentStep: string, subStep: string): void {
  if (typeof window === "undefined") return;
  try {
    let sessionId = sessionStorage.getItem("keshah_funnel_session");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem("keshah_funnel_session", sessionId);
    }
    // Source mapping must mirror flow-context.tsx exactly — otherwise main
    // step events (from flow-context) and sub-step events (from here) end
    // up in different source buckets and the dashboard sees only one.
    // /startus3 falling through to "us" was hiding all PinchTest + Founder
    // Story sub-step data from the new dashboard.
    const source = (() => {
      if (typeof window === "undefined") return "us";
      const p = window.location.pathname;
      if (p.startsWith("/startindiafree2")) return "india_premium_trial";
      if (p.startsWith("/startindia2")) return "india2";
      if (p.startsWith("/startindia3")) return "india3";
      if (p.startsWith("/startindia")) return "india";
      if (p.startsWith("/f/")) {
        const slug = p.split("/")[2];
        return slug ? `us_creator_${slug}` : "us_creator_unknown";
      }
      if (p.startsWith("/mandy")) return "us_women_mandy";
      if (p.startsWith("/startus3")) return "us_weekly_trial";
      if (p.startsWith("/startus2")) return "us_kit";
      if (p.startsWith("/startfree")) return "us_trial";
      return "us";
    })();
    fetch("/api/funnel/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: `${parentStep}.${subStep}`,
        sessionId,
        source,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
