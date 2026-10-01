// List all career applications for the admin Recruit tab. Returns
// applications ordered by most-recent activity first. Video read URLs
// are minted on demand by /api/careers/[id]/video-url — this endpoint
// only returns metadata, keeping the response small enough to fetch
// all rows in one shot.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = getFirebaseAdmin();
    const snap = await db
      .collection("careers_applications")
      .orderBy("last_updated_at", "desc")
      .limit(500)
      .get();
    const rows = snap.docs.map((d) => {
      const x = d.data() as Record<string, unknown>;
      const toIso = (v: unknown) =>
        v && typeof v === "object" && "toDate" in (v as object)
          ? (v as { toDate: () => Date }).toDate().toISOString()
          : null;
      return {
        id: d.id,
        listing_slug: x.listing_slug ?? null,
        full_name: x.full_name ?? null,
        email: x.email ?? null,
        phone: x.phone ?? null,
        gender: x.gender ?? null,
        college: x.college ?? null,
        graduation_year: x.graduation_year ?? null,
        can_commit: x.can_commit ?? null,
        comfortable_on_camera: x.comfortable_on_camera ?? null,
        wants_virality: x.wants_virality ?? null,
        posted_before: x.posted_before ?? null,
        social_handle: x.social_handle ?? null,
        calendly_event_start_time: x.calendly_event_start_time ?? null,
        calendly_join_url: x.calendly_join_url ?? null,
        calendly_reschedule_url: x.calendly_reschedule_url ?? null,
        calendly_cancel_url: x.calendly_cancel_url ?? null,
        status: x.status ?? "pending",
        created_at: toIso(x.created_at),
        submitted_at: toIso(x.submitted_at),
        booked_at: toIso(x.booked_at),
        last_updated_at: toIso(x.last_updated_at),
        decided_at: toIso(x.decided_at),
      };
    });
    return NextResponse.json({ applications: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
