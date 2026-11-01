/**
 * The core script (Nov 1 2026, Isai first): every video is a test hook with its
 * own verdict, then the same proven middle with rotating lines. Only the hook
 * changes, so hook tests are clean. Lines are the founder's words from the
 * "Isai's winning video structure" doc; don't reword them here.
 *
 * Every creator (unless `script_core` is false) gets proven hooks + 2 new
 * hooks a day (5-video days; shorter days are proven only), each shown as a
 * line-by-line script (the app's ScriptLines view).
 */

import type { ScriptLine } from "./proven";

export interface CoreHook {
  /** The ProvenVideos doc shown as the reference ("Watch the original"). */
  proven_id: string;
  /** Hook + verdict, said as written. */
  text: string;
}

/** Proven test hooks (posted, 0.2M to 3.75M views). */
export const CORE_PROVEN_HOOKS: CoreHook[] = [
  { proven_id: "tiktok_7663840250380225823", text: "Take two fingers and a thumb and pinch this. Now take the same two fingers and a thumb and pinch on the top. If it's very hard to pinch on the top, and if it's not as flexible as this, that could be the reason you're losing hair." },
  { proven_id: "tiktok_7639010477657443614", text: "If you cannot pinch and separate the skin from your scalp, if you cannot move your scalp skin like this, that could be the reason you're losing hair." },
  { proven_id: "tiktok_7542148485546528055", text: "If you're losing hair, take your thumb and take your two fingers and pinch the areas of your scalp where you're losing hair. If it's very tight, that could be the reason you're losing hair." },
  { proven_id: "instagram_DdZxakQvEsz", text: "If your scalp doesn't move like this, no one can save you from balding. If it's stuck, if it doesn't move, try moving it with me." },
  { proven_id: "tiktok_7684328640347344142", text: "Alright, so if you pinch your neck right here and it hurts, that could actually be an early sign of hair loss." },
  { proven_id: "tiktok_7673308095770086686", text: "If you're losing hair, here, take two fingers and a thumb and pinch your hairline, okay? Really try to pinch. If it's very tight, if it's very hard, that could be the reason why you're losing hair." },
  { proven_id: "instagram_DM8MGPpMQam", text: "Pinch the top of your scalp right now. Now, pinch the sides. Feel the difference? The top feels way tighter, right? That could be the reason why you're losing hair." },
  { proven_id: "tiktok_7613572321558695199", text: "If you're losing hair here, take your hand and make a fist out of it like you're gonna punch someone. And press where you're losing hair. If it's very hard, that could be the reason why you're losing hair." },
  { proven_id: "tiktok_7605783726185794847", text: "Are you losing hair there? If you're losing hair on the top like that photo, do this for me right now. Take a thumb and two fingers and pinch that top of your scalp where you're losing hair. If it's very tight, that could be the reason why you're losing hair." },
  { proven_id: "tiktok_7557104458388311326", text: "If you're losing hair, stop everything you're doing, take your hand and press your traps. If you notice pain there, that could be the reason why you're losing hair." },
  { proven_id: "tiktok_7687769199837564191", text: "If you press your eye, does it hurt? If it hurts when you press your eye, that could be the reason you're losing hair." },
  { proven_id: "tiktok_7657196568864623903", text: "Can you move your scalp like this? If not, that's why. That's probably why you're balding." },
];

/** New test hooks (never posted): the two "own concept" slots of the day. */
export const CORE_NEW_HOOKS: CoreHook[] = [
  { proven_id: "idea_c20261026s01_292afef77b50", text: "If you're losing hair, pinch the spot where it's thinning. Now pinch where your hair is still thick. Feel the difference? If the thin spot is tighter, that could be the reason why you're losing hair." },
  { proven_id: "idea_c20261026s02_5cd9478e538a", text: "Put your fingertips on top of your head and try to slide the skin. Not your hair, the skin. Does it move? If it doesn't, that could be the reason why you're losing hair." },
  { proven_id: "idea_c20261019s01_08f1af9e51f7", text: "Raise your eyebrows as high as you can right now. Did your hairline move with them? If it didn't, that could be the reason why you're losing hair." },
  { proven_id: "idea_c20261026s03_a57767f7d7da", text: "Slide the skin on the back of your head. Easy, right? Now try the top. If the top doesn't move, that could be the reason why you're losing hair." },
  { proven_id: "idea_c20261026s04_c83064c08c9b", text: "Pinch the skin on top of your head and try to lift it up, like a little tent. How high does it go? If it barely lifts, that could be the reason why you're losing hair." },
  { proven_id: "idea_c20261026s05_40e33d73b0dc", text: "Gently pull the hair on the side of your head. Now gently pull the hair on top. Does the top feel weaker? If it does, your scalp on top is probably tight, and that could be the reason why you're losing hair." },
  { proven_id: "idea_c20261026s06_ef57558fdf0b", text: "Frown as hard as you can. Now put your hand on top of your head and frown again. Feel that pull? If you do, that tension could be the reason why you're losing hair." },
  { proven_id: "idea_c20261026s07_29c943bbcd74", text: "Press the muscles on the sides of your jaw, right here. Does it hurt? If it hurts, that could be the reason why you're losing hair." },
  { proven_id: "idea_c20261026s08_6f099b86e1ee", text: "Tilt your head and try to touch your ear to your shoulder. Can you get close? If you can't, that could be the reason why you're losing hair." },
];

/** Slots of the day that get a new hook (the rest get proven ones). */
export const CORE_NEW_PER_DAY = 2;

const NOT_CAUSE = ["It's not your genetics.", "It's not your age.", "It's not your hormones."];

/** What people take; `product` ties it to the "Products can't fix it" line it must not repeat. */
const NOT_TAKE: { text: string; product?: "oils" | "minoxidil" | "pills" }[] = [
  { text: "It's not what shampoo you use." },
  { text: "It's not because you need more rosemary oil.", product: "oils" },
  { text: "It's not because you're low on Vitamin D." },
  { text: "It's not taking minoxidil.", product: "minoxidil" },
  { text: "It's not taking finasteride." },
  { text: "It's not getting a transplant." },
  { text: "It's not taking more pills.", product: "pills" },
];

const NOT_ABSURD = [
  "It's not what you ate in the morning.",
  "It's not because your mom doesn't like you.",
  "It's not because your friends don't like you.",
  "It's not because Mercury is in retrograde.",
  "It's not because you don't do icebaths.",
  "It's not because the girl you like hates you.",
  "It's not because god hates you.",
];

const WHY = [
  "I make these videos because I'm tired of all the bullshit going around.",
  "I make these videos because I'm tired of all the scamming people are doing.",
];

const SCIENCE_BLOOD = "When your scalp is tight, it gets 2.6 times less blood flow than when it's loose.";
const SCIENCE_JAPAN = "Japanese research shows with 99% accuracy that we go bald EXACTLY where our scalp is the tightest.";

const NOTICED: { text: string; hands?: string }[] = [
  { text: "Have you noticed bald men always have hair on the back and sides? It's because it's not as tight there." },
  { text: "Have you noticed how bald men have a shiny, dome like head shape? It's because of all the built up tension.", hands: "Show the dome with your hand." },
];

const CHAIN = "When your scalp is tight, your hair gets less blood. And when blood does not reach your hair follicles, it just thins and falls out.";

const PRODUCTS: { text: string; product: "oils" | "minoxidil" | "pills" }[] = [
  { text: "You can keep applying all these magical oils from the himalayas but that's not going to fix a tight scalp.", product: "oils" },
  { text: "You can buy the best minoxidil in the world but that's not going to fix a tight scalp.", product: "minoxidil" },
  { text: "You can keep stuffing pills into your body, but that's not going to fix a tight scalp.", product: "pills" },
];

const FIX =
  "The actual fix takes work and consistency. So if you can't do that keep taking your pills. It's called mechanical therapy or mechanotherapy. These are specific scalp techniques like pinching, sliding, pressing that loosen up your scalp, get the blood flowing, and get your hair to stop falling. They have to be done with FORCE.";

export const CORE_ENDING =
  "Go to the pinned video on my profile. It's the one that says, watch this first. It's gonna tell you my step-by-step routine to fix your hair loss without any products. It's a separate video because I don't want to keep repeating myself. Also don't DM me you can't find it. It's the only pinned video and it says in caps WATCH THIS FIRST.";

const CORE_BY_ID = new Map([...CORE_PROVEN_HOOKS, ...CORE_NEW_HOOKS].map((h) => [h.proven_id, h]));
export const CORE_PROVEN_IDS = new Set(CORE_PROVEN_HOOKS.map((h) => h.proven_id));
export const CORE_NEW_IDS = CORE_NEW_HOOKS.map((h) => h.proven_id);

export function isCoreHook(provenId: string): boolean {
  return CORE_BY_ID.has(provenId);
}

/** Small seeded generator, so a video's script is the same every time it's opened. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];

/** The pool in a fixed order for the day; slot n takes item n, so a day's videos don't repeat a line until the pool runs out. */
/** Videos in a creator's day (3 proven + 2 new hooks). */
const SLOTS_PER_DAY = 5;

/**
 * A half-in beat for the day: exactly 2 or 3 of the day's videos get it (which
 * ones is random), and those take the pool's lines in turn, so it alternates.
 * null = this video leaves the beat out.
 */
function dayHalf<T>(daySeed: string, pool: string, xs: T[], slot: number): T | null {
  const r = rng(`${daySeed}|${pool}|half`);
  const order = Array.from({ length: SLOTS_PER_DAY }, (_, i) => ({ i, k: r() })).sort((a, b) => a.k - b.k).map((o) => o.i);
  const on = new Set(order.slice(0, r() < 0.5 ? 2 : 3));
  if (!on.has(slot % SLOTS_PER_DAY)) return null;
  const rank = [...on].filter((i) => i < slot % SLOTS_PER_DAY).length;
  return xs[(Math.floor(r() * xs.length) + rank) % xs.length];
}

function dayItem<T>(daySeed: string, pool: string, xs: T[], slot: number, ok: (x: T) => boolean = () => true): T {
  const r = rng(`${daySeed}|${pool}`);
  const order = xs.map((x) => ({ x, k: r() })).sort((a, b) => a.k - b.k).map((o) => o.x);
  for (let i = 0; i < order.length; i++) {
    const x = order[(slot + i) % order.length];
    if (ok(x)) return x;
  }
  return order[0];
}

/** The verdict's word, repeated in the rabbit hole line. */
export function verdictWord(hook: string): "balding" | "losing hair" {
  return /balding/i.test(hook) ? "balding" : "losing hair";
}

/**
 * The full script for one video. `daySeed` is unique per creator and day;
 * `slot` is the video's place in the day, so the day's videos get different
 * lines. Unknown proven id -> null (the video keeps its normal script).
 *
 * Rules: "Why I make these" and "Have you noticed" each in 2 or 3 of the
 * day's 5 videos, alternating their lines;
 * the products line never repeats slot 2; without "Have you noticed" the
 * science line is the Japanese research one, so the 2.6x line never sits
 * right before the chain saying the same thing.
 */
export function coreLines(provenId: string, daySeed: string, slot = 0): ScriptLine[] | null {
  const hook = CORE_BY_ID.get(provenId);
  if (!hook) return null;
  const r = rng(`${daySeed}|${slot}|${provenId}`);
  const item = <T>(pool: string, xs: T[], ok?: (x: T) => boolean) => dayItem(daySeed, pool, xs, slot, ok);
  const take = item("take", NOT_TAKE);
  const why = dayHalf(daySeed, "why", WHY, slot);
  const noticed = dayHalf(daySeed, "noticed", NOTICED, slot);
  const science = noticed ? pick(r, [SCIENCE_BLOOD, SCIENCE_JAPAN]) : SCIENCE_JAPAN;
  const product = item("products", PRODUCTS, (p) => p.product !== take.product);

  const lines: ScriptLine[] = [
    { label: "Hook", text: hook.text, hands: "Do the test on yourself while you say it. Copy the hook from the original. After that, follow these cards, not the original." },
    {
      label: "It's not",
      text: `${item("cause", NOT_CAUSE)} ${take.text} ${item("absurd", NOT_ABSURD)}`,
      hands: "Say the last one fed up, almost mocking it, like you've heard every excuse.",
    },
  ];
  if (why) lines.push({ label: "Why I make these", text: `${why} I went down a rabbithole and this is why you're ACTUALLY ${verdictWord(hook.text)}.` });
  lines.push({ label: "Science", text: science });
  if (noticed) lines.push({ label: "Have you noticed", text: noticed.text, ...(noticed.hands ? { hands: noticed.hands } : {}) });
  lines.push(
    { label: "Chain", text: CHAIN },
    { label: "Products", text: product.text },
    { label: "The fix", text: FIX, hands: "Say \"keep taking your pills\" mocking. Show each technique on your scalp while you name it." },
    { label: "Ending", text: CORE_ENDING },
  );
  return lines;
}

/** Which beats a script includes, for the half-and-half tests. */
export function coreBeats(lines: ScriptLine[]): { why: boolean; noticed: boolean } {
  return { why: lines.some((l) => l.label === "Why I make these"), noticed: lines.some((l) => l.label === "Have you noticed") };
}

/**
 * The day's two new hooks: least recently given first, then in list order
 * rotated by date so a creator doesn't always start at the same one.
 */
export function chooseNewHooks(history: Record<string, string[]>, date: string, count = CORE_NEW_PER_DAY, exclude: string[] = []): string[] {
  const skip = new Set(exclude);
  const offset = Math.floor(rng(date)() * CORE_NEW_IDS.length);
  const ordered = CORE_NEW_IDS.map((_, i) => CORE_NEW_IDS[(i + offset) % CORE_NEW_IDS.length]).filter((id) => !skip.has(id));
  const last = (id: string) => (history[id] ?? []).reduce((a, b) => (b > a ? b : a), "");
  return ordered
    .map((id, i) => ({ id, i, last: last(id) }))
    .sort((a, b) => (a.last === b.last ? a.i - b.i : a.last < b.last ? -1 : 1))
    .slice(0, count)
    .map((x) => x.id);
}
