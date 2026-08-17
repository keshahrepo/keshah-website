// Web equivalent of Flutter's HapticFeedback.
// Uses navigator.vibrate() which is supported on Android Chrome
// and iOS Safari 18.4+. On unsupported browsers it's a silent no-op.

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw on user-gesture requirements; ignore.
  }
}

/** Mirrors HapticFeedback.lightImpact — for taps, selections, advances. */
export function lightHaptic(): void {
  vibrate(10);
}

/** Mirrors HapticFeedback.mediumImpact — for primary CTAs and meaningful actions. */
export function mediumHaptic(): void {
  vibrate(18);
}

/** Mirrors HapticFeedback.selectionClick — for picker / scroll snap feel. */
export function selectionHaptic(): void {
  vibrate(6);
}
