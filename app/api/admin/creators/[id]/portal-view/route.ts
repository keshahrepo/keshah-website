import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { creatorToday, getCreator, getHistory, getOnboarding, hasStarted, isOnboardingComplete, isYyyyMm, isYyyyMmDd } from "@/lib/creators/db";
import { invoiceView } from "@/lib/creators/invoice-auto";
import { detectedDays, listPosts } from "@/lib/creators/post-sync";
import { addMonths, monthOf } from "@/lib/creators/pay";
import { errorResponse, publicCreator } from "../../../../creator/_auth";
import { monthPayload } from "../../../../creator/_payload";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MAX_RANGE_DAYS = 62;

// GET /api/admin/creators/:id/portal-view?part=portal|month|invoices|posts|bonus
// The founder's read-only copy of what this creator's own app loads
// (/api/creator/portal, /month, /invoices, /posts, /bonus), so the founder's
// creator page can show exactly the creator's Earnings. Same server functions
// and payload shapes; never drafts invoices or writes anything.
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const creator = await getCreator(id);
    if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const q = req.nextUrl.searchParams;
    const part = q.get("part") ?? "portal";
    const now = new Date();
    const today = creatorToday(creator, now);

    if (part === "portal") {
      const [onboarding, history] = await Promise.all([getOnboarding(id), getHistory(id)]);
      const signed = creator.contract.status === "signed";
      return NextResponse.json({
        creator: publicCreator(creator),
        onboarding: { ...onboarding, complete: isOnboardingComplete(onboarding, { contractSigned: signed }) },
        contract: { status: creator.contract.status, signed_at: creator.contract.signed_at ?? null },
        tracking_url: creator.tracking_url || null,
        config: {},
        today: { date: today },
        month: await monthPayload(creator, monthOf(today), history, now),
      });
    }

    if (part === "month") {
      const m = q.get("month");
      const month = isYyyyMm(m) ? m : monthOf(today);
      return NextResponse.json(await monthPayload(creator, month, await getHistory(id), now));
    }

    if (part === "invoices") {
      // Like /api/creator/invoices, without drafting: last month's invoice only if it exists.
      const lastMonth = addMonths(monthOf(today), -1);
      const history = await getHistory(id);
      const startedBy = hasStarted(creator) && creator.start_date <= `${lastMonth}-31`;
      const current = startedBy ? (history.invoices.find((i) => i.month === lastMonth) ?? null) : null;
      const list = [...history.invoices].sort((a, b) => b.month.localeCompare(a.month));
      return NextResponse.json({
        last_month: lastMonth,
        current: current ? invoiceView(current, creator.timezone) : null,
        history: list.map((i) => invoiceView(i, creator.timezone)),
      });
    }

    if (part === "posts") {
      const from = isYyyyMmDd(q.get("from")) ? q.get("from")! : today;
      const to = isYyyyMmDd(q.get("to")) ? q.get("to")! : today;
      if (from > to) return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
      if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_RANGE_DAYS) {
        return NextResponse.json({ error: `Pick a range of ${MAX_RANGE_DAYS} days or less` }, { status: 400 });
      }
      const all = await listPosts(id, from, to);
      // Only the current handles' posts, like the creator sees.
      const norm = (h: unknown) => String(h ?? "").trim().replace(/^@/, "").toLowerCase();
      const current: Record<string, string> = { tiktok: norm(creator.tiktok_handle), instagram: norm(creator.instagram_handle) };
      const posts = all.filter((p) => {
        const want = current[p.platform];
        const h = norm(p.handle);
        return !want || !h || h === want;
      });
      return NextResponse.json({
        today,
        from,
        to,
        days: detectedDays(posts),
        posts: posts.map((p) => ({
          platform: p.platform,
          url: p.url,
          posted_at: p.posted_at,
          local_date: p.local_date,
          caption: p.caption,
          views: p.views,
          pinned: p.pinned,
          thumbnail_url: p.thumbnail_url,
        })),
      });
    }

    if (part === "bonus") {
      const { bonusClaims } = await getHistory(id);
      return NextResponse.json({
        claims: bonusClaims.map((c) => ({
          id: c.id,
          video_url: c.video_url,
          platform: c.platform,
          posted_on: c.posted_on,
          views_claimed: c.views_claimed,
          status: c.status,
          admin_note: c.admin_note ?? null,
          claimed_at: c.claimed_at ?? null,
          has_screenshot: !!c.screenshot_path,
          crossed_100k_on: c.crossed_100k_on ?? null,
          crossed_1m_on: c.crossed_1m_on ?? null,
          source: c.source === "auto" ? "auto" : "manual",
        })),
      });
    }

    return NextResponse.json({ error: "Unknown part" }, { status: 400 });
  } catch (e) {
    return errorResponse(e, "admin portal view");
  }
}
