// Admin page for the post-purchase onboarding-call prompt toggle.
// Server component reads current state from Settings/app_general_settings,
// hands off to a client form for edit + save. Mirrors the masterclass admin
// page pattern verbatim — only two fields (enabled + calendlyUrl) since
// there's no availability window or meeting URL for this one.

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import OnboardingCallConfigClient from "./OnboardingCallConfigClient";

export const dynamic = "force-dynamic";

const SETTINGS_DOC = "Settings/app_general_settings";
const F = {
  enabled: "onboarding_call_post_purchase_enabled",
  calendlyUrl: "onboarding_call_post_purchase_calendly_url",
};

export default async function OnboardingCallAdminPage() {
  const { db } = getFirebaseAdmin();
  const snap = await db.doc(SETTINGS_DOC).get();
  const data = snap.data() || {};

  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#fff",
            margin: 0,
          }}
        >
          Post-Purchase Onboarding Call
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            margin: "4px 0 0",
          }}
        >
          Full-screen prompt shown right after a user completes trial-paywall
          purchase. Tier-1 (US) users only — non-US users skip the page
          regardless of this toggle.
        </p>
      </header>

      <OnboardingCallConfigClient
        initialEnabled={data[F.enabled] === true}
        initialCalendlyUrl={(data[F.calendlyUrl] as string | null) || ""}
      />
    </div>
  );
}
