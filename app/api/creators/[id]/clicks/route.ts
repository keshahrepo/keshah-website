import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

// GET — fetch click data for a creator (last 30 days)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = getFirebaseAdmin();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const clicksSnap = await db
      .collection("Creators")
      .doc(id)
      .collection("clicks")
      .where("timestamp", ">=", thirtyDaysAgo)
      .get();

    // Group clicks by date
    const clicksByDate: Record<string, number> = {};
    clicksSnap.forEach((doc) => {
      const data = doc.data();
      const ts = data.timestamp?.toDate?.();
      if (ts) {
        const dateStr = ts.toISOString().split("T")[0];
        clicksByDate[dateStr] = (clicksByDate[dateStr] || 0) + 1;
      }
    });

    // Fill in missing dates with 0
    const result = [];
    const current = new Date(thirtyDaysAgo);
    const today = new Date();
    while (current <= today) {
      const dateStr = current.toISOString().split("T")[0];
      result.push({
        date: dateStr,
        label: `${current.getMonth() + 1}/${current.getDate()}`,
        clicks: clicksByDate[dateStr] || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Creator clicks error:", error);
    return NextResponse.json({ error: "Failed to fetch clicks" }, { status: 500 });
  }
}
