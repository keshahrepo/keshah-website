// Where the founder app's "All time" begins: Aug 18, 2026, the first day
// trial starts were tracked on users. Before it signups exist but trials
// don't, so all-time funnels and rates would be wrong (96k signups, 3k trials).
// Money (RevenueCat) uses the same start so every all-time number covers the same days.
export const ALL_TIME_START = "2026-08-18";
export const ALL_TIME_START_MS = Date.parse(`${ALL_TIME_START}T00:00:00Z`);

/** A yyyy-mm-dd start no earlier than ALL_TIME_START, so August (and All time) start on the same day and months add up to All time. */
export const clampStart = (d: string): string => (d < ALL_TIME_START ? ALL_TIME_START : d);
