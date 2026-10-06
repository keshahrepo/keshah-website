// Integration test for the full post sync against the LOCAL Firestore emulator,
// with ScrapeCreators mocked (fixtures). Skipped unless FIRESTORE_EMULATOR_HOST
// points at localhost, so it can never touch production.
//
//   firebase emulators:start --only firestore --project demo-keshah   (port 8181 here)
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 npx tsx --test lib/creators/post-sync.emulator.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EMU = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const enabled = /^(127\.0\.0\.1|localhost):\d+$/.test(EMU);

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "__fixtures__", name), "utf8"));

test("full sync against the emulator (mocked ScrapeCreators)", { skip: !enabled && "FIRESTORE_EMULATOR_HOST not set to localhost" }, async () => {
  // Throwaway service account so lib/firebase-admin's cert() init works offline.
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const sa = {
      type: "service_account",
      project_id: "demo-keshah",
      private_key_id: "x",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      client_email: "test@demo-keshah.iam.gserviceaccount.com",
      client_id: "1",
    };
    process.env.FIREBASE_SERVICE_ACCOUNT = Buffer.from(JSON.stringify(sa)).toString("base64");
  }
  process.env.GCLOUD_PROJECT ??= "demo-keshah";
  const { getFirebaseAdmin } = await import("@/lib/firebase-admin");
  const { syncCreatorPosts, syncAllCreatorPosts, listPosts, detectedDays } = await import("./post-sync");
  const { getHistory } = await import("./db");
  const { monthSummary, completeVideoCount } = await import("./pay");
  const db = getFirebaseAdmin().db;
  const id = `postsync-test-${Date.now()}`;
  const ref = db.collection("ContentCreators").doc(id);
  const settingsRef = db.collection("Settings").doc("creator_portal");
  const settingsBefore = (await settingsRef.get()).data() ?? null;

  const TT_ID_OCT5 = "7693255888584346894"; // non-pinned, posted Mon Oct 5 (Chicago)
  const tt1 = fixture("tt_isai.json");
  const ig1 = fixture("ig_isai.json");
  const empty = { tiktok: { success: true, credits_remaining: 97, has_more: 0, max_cursor: 0, aweme_list: [] }, instagram: { success: true, credits_remaining: 97, items: [], paging_info: { more_available: false } } };
  let ttViews = 150_000;
  let fail = false;
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    if (fail) return new Response("upstream down", { status: 503 });
    const isTt = String(url).includes("/tiktok/");
    const paged = /max_cursor=|max_id=/.test(String(url));
    let body: unknown;
    if (isTt) {
      if (paged) body = empty.tiktok;
      else {
        const page = structuredClone(tt1);
        page.aweme_list.find((a: { aweme_id: string }) => a.aweme_id === TT_ID_OCT5).statistics.play_count = ttViews;
        body = page;
      }
    } else body = paged ? empty.instagram : ig1;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;

  try {
    await ref.set({
      name: "Sync Test",
      email: "sync-test@example.com",
      status: "active",
      is_active: true,
      timezone: "America/Chicago",
      tiktok_handle: "@isai.trujillo01",
      instagram_handle: "isai.trujillo1",
      start_mode: "first_post",
      contract: { status: "signed" },
    });
    await ref.collection("onboarding").doc("state").set({ completed_at: "2026-09-30T15:00:00.000Z", videos_watched: {} });
    const manualRow = {
      tiktok_url: `https://www.tiktok.com/@isai.trujillo01/video/${TT_ID_OCT5}?_r=1&u_code=abc`,
      instagram_url: "",
      inspired_by_url: "https://www.youtube.com/watch?v=x",
    };
    await ref.collection("posting_days").doc("2026-10-05").set({ date: "2026-10-05", videos: [manualRow], logged_at: "2026-10-05T18:00:00.000Z" });
    await ref.collection("days_off").doc("2026-10-02").set({ date: "2026-10-02", status: "approved" });

    // ---- run 1
    const now1 = new Date("2026-10-06T15:00:00Z");
    const r1 = await syncCreatorPosts(id, { apiKey: "test", fetchImpl, now: now1, log: () => {} });
    assert.equal(r1.ok, true);
    assert.equal(r1.platforms.tiktok!.posts, 10);
    assert.equal(r1.platforms.instagram!.posts, 12);
    assert.equal(r1.mode, "shallow");
    assert.equal(calls.length, 2, "shallow = page 1 per platform");
    assert.equal(r1.credits_remaining, 98);
    assert.deepEqual(r1.posted_days_detected, ["2026-10-05"]);
    assert.equal(r1.start_date_set, "2026-10-05");
    assert.deepEqual(r1.days_written, ["2026-10-05"]);
    assert.deepEqual(r1.claims_created, [`auto_tiktok_${TT_ID_OCT5}`]);

    const doc = (await ref.get()).data()!;
    assert.equal(doc.start_date, "2026-10-05");
    assert.equal(doc.start_date_source, "auto_post");
    assert.equal(doc.post_sync.consecutive_failures, 0);
    assert.equal(doc.post_sync.last_ok_at, now1.toISOString());

    const postsSnap = await ref.collection("posts").get();
    assert.equal(postsSnap.size, 22);
    const p = (await ref.collection("posts").doc(`tiktok_${TT_ID_OCT5}`).get()).data()!;
    assert.equal(p.local_date, "2026-10-05");
    assert.equal(p.views, 150_000);
    assert.equal(p.crossed_100k_at, now1.toISOString());
    assert.equal(p.crossed_1m_at, null);
    assert.equal(p.views_history.length, 1);
    // pinned 190K post from September: stored, but before start_date -> no claim
    const pinned = (await ref.collection("posts").doc("tiktok_7683764136622214414").get()).data()!;
    assert.equal(pinned.pinned, true);
    assert.ok(pinned.crossed_100k_at);

    const day = (await ref.collection("posting_days").doc("2026-10-05").get()).data()!;
    assert.deepEqual(day.videos[0].tiktok_url, manualRow.tiktok_url, "manual link untouched");
    assert.equal(day.videos[0].inspired_by_url, manualRow.inspired_by_url);
    assert.ok(day.videos[0].instagram_url.startsWith("https://www.instagram.com/reel/"), "gap filled");
    assert.equal(day.videos.length, 5);
    assert.equal(completeVideoCount(day as never), 5);
    assert.equal(day.source, "manual+auto");
    assert.equal(day.auto_urls.length, 9);
    assert.equal(day.logged_at, "2026-10-05T18:00:00.000Z", "creator's logged_at kept");
    assert.equal((await ref.collection("posting_days").doc("2026-10-02").get()).exists, false, "before start_date: not recorded");

    const claim = (await ref.collection("bonus_claims").doc(`auto_tiktok_${TT_ID_OCT5}`).get()).data()!;
    assert.equal(claim.status, "approved");
    assert.equal(claim.source, "auto");
    assert.equal(claim.crossed_100k_on, "2026-10-06");
    assert.equal(claim.posted_on, "2026-10-05");

    // readers
    const listed = await listPosts(id, "2026-10-01", "2026-10-31");
    assert.equal(listed.length, 17); // 7 TikToks + 10 Reels posted in October (pinned ones are older)
    const oct5 = detectedDays(listed).find((d) => d.date === "2026-10-05")!;
    assert.equal(oct5.posted, true);

    // ---- deep run: pages on (page 1 oldest is inside 32 days), page 2 says has_more=0
    calls.length = 0;
    const rd = await syncCreatorPosts(id, { mode: "deep", apiKey: "test", fetchImpl, now: new Date("2026-10-07T03:45:00Z"), log: () => {} });
    assert.equal(calls.length, 4);
    assert.equal(rd.deep_pages_last, 4);
    assert.equal(rd.credits_remaining, 97, "latest page's credits_remaining");
    assert.equal((await ref.get()).data()!.post_sync.last_deep_pages, 4);
    assert.deepEqual(rd.claims_created, [], "deep re-run is idempotent");

    // ---- run 2: 1M views -> same claim upgraded, nothing duplicated
    ttViews = 1_250_000;
    const now2 = new Date("2026-10-08T15:00:00Z");
    const r2 = await syncCreatorPosts(id, { apiKey: "test", fetchImpl, now: now2, log: () => {} });
    assert.deepEqual(r2.claims_created, []);
    assert.deepEqual(r2.claims_upgraded, [`auto_tiktok_${TT_ID_OCT5}`]);
    assert.deepEqual(r2.days_written, []);
    assert.equal((await ref.collection("bonus_claims").get()).size, 1);
    const p2 = (await ref.collection("posts").doc(`tiktok_${TT_ID_OCT5}`).get()).data()!;
    assert.equal(p2.views_history.length, 2); // run 1 (150K) + run 2 (1.25M); deep run saw no change
    assert.equal(p2.first_seen_at, now1.toISOString());

    // pay: Oct 5 posted counts once; bonus lands on October
    const h = await getHistory(id);
    const s = monthSummary({ start_date: "2026-10-05", starting_completed_months: 0 }, "2026-10", h.postingDays, h.daysOff, h.bonusClaims, [], { today: "2026-10-08" });
    assert.equal(s.postedDays, 1);
    assert.deepEqual(s.bonusLines.map((l) => [l.kind, l.amount_cents]), [["bonus_1m", 10000]]);

    // ---- failures: 3 in a row -> one alert per day
    fail = true;
    const alerts: string[] = [];
    const sendAlert = async (subject: string, text: string) => void alerts.push(`${subject}\n${text}`);
    await settingsRef.set({ post_sync_alert_at: null }, { merge: true });
    for (let i = 1; i <= 3; i++) {
      const r = await syncAllCreatorPosts({ apiKey: "test", fetchImpl, now: new Date(Date.parse("2026-10-09T00:00:00Z") + i * 3 * 3600e3), onlyIds: [id], sendAlert, log: () => {} });
      assert.equal(r.results[0].ok, false);
      assert.equal(r.results[0].consecutive_failures, i);
      assert.equal(r.alert_sent, i === 3);
    }
    const again = await syncAllCreatorPosts({ apiKey: "test", fetchImpl, now: new Date("2026-10-09T15:00:00Z"), onlyIds: [id], sendAlert, log: () => {} });
    assert.equal(again.alert_sent, false, "max one alert per 24h");
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /Sync Test .*4|3 failed syncs in a row/);
    const failed = (await ref.get()).data()!.post_sync;
    assert.equal(failed.consecutive_failures, 4);
    assert.match(failed.last_error, /HTTP 503/);
    assert.equal(failed.last_ok_at, now2.toISOString());
    // failed fetches never touch posting days or posts
    assert.equal((await ref.collection("posts").get()).size, 22);

    // recovery resets the counter
    fail = false;
    const ok = await syncCreatorPosts(id, { apiKey: "test", fetchImpl, now: new Date("2026-10-09T18:00:00Z"), log: () => {} });
    assert.equal(ok.consecutive_failures, 0);
  } finally {
    await db.recursiveDelete(ref);
    if (settingsBefore) await settingsRef.set(settingsBefore);
    else await settingsRef.delete();
  }
});
