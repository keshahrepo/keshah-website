import { getFirebaseAdmin } from "@/lib/firebase-admin";
import RegrowthConsultationConfigClient from "./RegrowthConsultationConfigClient";

export const dynamic = "force-dynamic";

const SETTINGS_DOC = "Settings/app_general_settings";
const F = {
  capacity: "regrowth_consultation_capacity_reached",
};

export default async function RegrowthConsultationAdminPage() {
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
          Regrowth Consultation
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            margin: "4px 0 0",
          }}
        >
          Throttle for the Regrowth-tab "See if you qualify" CTA. Flip on
          when the schedule is full — the button becomes disabled with a
          "we're at capacity" message. Flip off to resume bookings.
        </p>
      </header>

      <RegrowthConsultationConfigClient
        initialCapacityReached={data[F.capacity] === true}
      />
    </div>
  );
}
