// Call notes for one application (founder app, Recruit).
// POST { action: "append", text } adds a typed or dictated note under the others.
// POST { action: "set", text }    replaces them (editing).
// POST { action: "tidy" }         Claude turns them into short bullets (call_notes_tidy); the notes stay.
// Returns { call_notes, call_notes_tidy }.
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireDashboardSession } from "@/lib/support/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { appendCallNote, cleanCallNotes, tidyCallNotes } from "@/lib/call-notes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; text?: string };
  const ref = getFirebaseAdmin().db.collection("careers_applications").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const cur = snap.data() ?? {};
  try {
    if (body.action === "append" || body.action === "set") {
      const notes = body.action === "append" ? appendCallNote(cur.call_notes, body.text) : cleanCallNotes(body.text);
      await ref.set({ call_notes: notes, call_notes_at: new Date().toISOString(), last_updated_at: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ call_notes: notes, call_notes_tidy: cur.call_notes_tidy ?? null });
    }
    if (body.action === "tidy") {
      const notes = cleanCallNotes(cur.call_notes);
      if (!notes) return NextResponse.json({ error: "Add some notes first." }, { status: 400 });
      const text = await tidyCallNotes(String(cur.full_name ?? ""), notes);
      if (!text) return NextResponse.json({ error: "Couldn't tidy them. Try again." }, { status: 502 });
      const tidy = { text, at: new Date().toISOString() };
      await ref.set({ call_notes_tidy: tidy, last_updated_at: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ call_notes: notes, call_notes_tidy: tidy });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("call notes:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
  }
}
