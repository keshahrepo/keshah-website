// Admin page for the microneedling masterclass toggle. Reads the current
// state from Settings/app_general_settings via Firebase admin SDK, then
// hands off to a client component for the form + save flow.

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import MasterclassConfigClient from "./MasterclassConfigClient";

export const dynamic = "force-dynamic";

const SETTINGS_DOC = "Settings/app_general_settings";
const F = {
  enabled: "microneedling_masterclass_enabled",
  calendlyUrl: "microneedling_masterclass_calendly_url",
  meetUrl: "microneedling_masterclass_meet_url",
  availableUntil: "microneedling_masterclass_available_until",
};

export default async function MasterclassAdminPage() {
  const { db } = getFirebaseAdmin();
  const snap = await db.doc(SETTINGS_DOC).get();
  const data = snap.data() || {};

  const rawUntil = data[F.availableUntil];
  let availableUntilIso: string | null = null;
  if (rawUntil?.toDate) availableUntilIso = rawUntil.toDate().toISOString();
  else if (typeof rawUntil === "string") availableUntilIso = rawUntil;

  // Count booked users in the current window (rough usage signal).
  let bookedCount = 0;
  if (rawUntil?.toDate) {
    try {
      const untilDate = rawUntil.toDate();
      const bookedSnap = await db
        .collection("Users")
        .where("microneedling_masterclass_booked_at", "!=", null)
        .get();
      for (const doc of bookedSnap.docs) {
        const raw = doc.data().microneedling_masterclass_booked_at;
        const bookedAt =
          raw?.toDate?.() ??
          (typeof raw === "string" ? new Date(raw) : null);
        if (bookedAt && bookedAt <= untilDate) bookedCount++;
      }
    } catch {
      // Non-blocking — count stays at 0 if the query fails.
    }
  }

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
          Microneedling Masterclass
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            margin: "4px 0 0",
          }}
        >
          Toggle the in-app banner + set Calendly link + set booking deadline.
        </p>
      </header>

      <MasterclassConfigClient
        initialEnabled={data[F.enabled] === true}
        initialCalendlyUrl={(data[F.calendlyUrl] as string | null) || ""}
        initialMeetUrl={(data[F.meetUrl] as string | null) || ""}
        initialAvailableUntilIso={availableUntilIso}
        bookedCount={bookedCount}
      />
    </div>
  );
}
