/**
 * Self-test bank for the Scalp Report (AI videos on aadi.keshah): new tests
 * that aren't proven yet. The daily writer turns each into a fresh script
 * (test as the hook -> what a "fail" means for hair loss -> the routine ->
 * pinned video), alongside a couple of proven self-tests as a baseline.
 * Not connected to creators: winners are picked by hand later.
 */
export type TestArea = "scalp" | "hair" | "face" | "neck";

export interface BankTest {
  /** Stable id; FacelessVideos.source_id is "bank_<id>". */
  id: string;
  area: TestArea;
  /** The test as a spoken command (the hook). */
  test: string;
  /** What a "fail" looks or feels like. */
  fail: string;
}

export const TEST_BANK: readonly BankTest[] = [
  // Scalp
  { id: "side_then_top", area: "scalp", test: "Pinch the skin on the side of your head. Now pinch the top.", fail: "the top is stuck and barely lifts" },
  { id: "thin_vs_full", area: "scalp", test: "Pinch where you're losing hair, then pinch where your hair's still thick.", fail: "the thinning spot is way tighter" },
  { id: "slide_skin", area: "scalp", test: "Put your fingertips on your scalp and try to slide the skin.", fail: "the skin doesn't move, only your hair does" },
  { id: "push_test", area: "scalp", test: "Put your fingertips on top of your head and push forward and back.", fail: "the skin stays put" },
  { id: "back_vs_top", area: "scalp", test: "Slide the skin on the back of your head. Now slide the top.", fail: "the back moves but the top is stuck" },
  { id: "knuckle_test", area: "scalp", test: "Rub your knuckles across the top of your head.", fail: "the skin stays flat and stuck instead of bunching up" },
  { id: "crown_pinch", area: "scalp", test: "Reach back and pinch your crown.", fail: "you can't get any skin between your fingers" },
  { id: "hairline_pinch", area: "scalp", test: "Pinch the skin right on your hairline.", fail: "it feels tight and won't lift" },
  { id: "temple_pinch", area: "scalp", test: "Pinch the skin on your temples.", fail: "it's tight and hard to grab" },
  { id: "hard_spot", area: "scalp", test: "Press where you're thinning, then press where your hair's thick.", fail: "the thinning spot feels harder" },
  { id: "tent_test", area: "scalp", test: "Pinch the top of your scalp and lift it like a tent.", fail: "it barely lifts at all" },
  { id: "circles_glide", area: "scalp", test: "Rub small circles on the top of your head.", fail: "the skin sticks instead of gliding" },
  // Hair
  { id: "pull_sides_top", area: "hair", test: "Gently pull the hair on the sides of your head. Now pull the hair on top.", fail: "the top feels weaker" },
  { id: "pull_top_hurts", area: "hair", test: "Gently pull the hair on top of your head.", fail: "it hurts or feels sore" },
  { id: "brush_sore", area: "hair", test: "Brush the top of your head, then the sides.", fail: "the top feels sore" },
  { id: "fingers_front_back", area: "hair", test: "Run your fingers through the front of your hair, then the back.", fail: "the front feels thinner" },
  // Face, forehead, jaw
  { id: "eyebrow_raise", area: "face", test: "Raise your eyebrows as high as you can.", fail: "your hairline doesn't move with them" },
  { id: "frown_test", area: "face", test: "Frown as hard as you can.", fail: "you feel the top of your head tighten" },
  { id: "forehead_press", area: "face", test: "Press your fingertips into your forehead.", fail: "it hurts" },
  { id: "jaw_press", area: "face", test: "Press the muscles on the sides of your jaw.", fail: "it hurts" },
  { id: "mouth_wide", area: "face", test: "Open your mouth as wide as you can.", fail: "it hurts or feels tight" },
  { id: "clench_temples", area: "face", test: "Put your fingers on your temples and clench your teeth.", fail: "you feel them bulge and tighten" },
  { id: "temple_circles", area: "face", test: "Press your temples in small circles.", fail: "they're sore" },
  { id: "ear_wiggle", area: "face", test: "Try to wiggle your ears.", fail: "you can't move them at all" },
  { id: "brow_press", area: "face", test: "Press just above your eyebrows.", fail: "it's tender" },
  // Neck, shoulders, upper back
  { id: "traps_press", area: "neck", test: "Press your traps, the muscles between your neck and shoulders.", fail: "it hurts" },
  { id: "upper_back_press", area: "neck", test: "Reach over and press your upper back.", fail: "it hurts" },
  { id: "ear_to_shoulder", area: "neck", test: "Tilt your head and try to touch your ear to your shoulder.", fail: "you can't get close" },
  { id: "look_up", area: "neck", test: "Look straight up at the ceiling.", fail: "the back of your neck feels tight" },
  { id: "chin_to_chest", area: "neck", test: "Tuck your chin to your chest.", fail: "you feel a pull at the back of your head" },
  { id: "skull_base", area: "neck", test: "Press the base of your skull, where your neck meets your head.", fail: "it's sore" },
  { id: "turn_left_right", area: "neck", test: "Turn your head left as far as you can, then right.", fail: "one side is much tighter" },
  { id: "shrug_hold", area: "neck", test: "Shrug your shoulders up to your ears and hold.", fail: "you feel it pull all the way up into your scalp" },
  { id: "neck_sides", area: "neck", test: "Press the sides of your neck.", fail: "it's tender" },
  // Change on the spot
  { id: "before_after_massage", area: "scalp", test: "Pinch the top of your head. Now massage it for thirty seconds and pinch again.", fail: "it was stuck at first and you can feel the difference" },
  { id: "slouch_vs_straight", area: "neck", test: "Slouch and pinch the top of your head. Now sit up straight and pinch again.", fail: "it's tighter when you slouch" },
  { id: "left_vs_right", area: "scalp", test: "Pinch the left side of your scalp, then the right.", fail: "one side is much tighter" },
];

/** Example techniques from the app, named as a glimpse of the full routine. */
export const ROUTINE_TECHNIQUES = ["scalp pressing", "scalp pinching", "scalp stretches", "scalp sliding", "neck presses", "neck stretches", "acupressure points"];

export const bankSourceId = (id: string) => `bank_${id}`;
