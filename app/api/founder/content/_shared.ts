import { NextResponse } from "next/server";
import { CreatorDataError } from "@/lib/creators/db";

/** Founder content POST errors: bad input -> 400, anything else -> 500. */
export function contentError(e: unknown, what: string) {
  if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: 400 });
  console.error(`${what} failed:`, e);
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
