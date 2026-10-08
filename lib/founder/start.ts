// Where the founder app's "All time" begins: Sep 1, 2026. Trial starts were
// only tracked from Aug 18 (before it signups exist but trials don't), and a
// clean month boundary keeps All time = the sum of its months.
// Money (RevenueCat) uses the same start so every all-time number covers the same days.
export const ALL_TIME_START = "2026-09-01";
export const ALL_TIME_START_MS = Date.parse(`${ALL_TIME_START}T00:00:00Z`);

/** A yyyy-mm-dd start no earlier than ALL_TIME_START, so every month and All time start on the same day and months add up to All time. */
export const clampStart = (d: string): string => (d < ALL_TIME_START ? ALL_TIME_START : d);
