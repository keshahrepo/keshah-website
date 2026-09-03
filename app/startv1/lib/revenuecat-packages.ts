// RC package identifier for the US /startfree annual + 1-day trial plan.
// Exported separately so TrialInfoPageUS can import without pulling in the
// whole RC SDK wrapper.
export const RC_PACKAGE_ANNUAL = "$rc_annual";

// Annual + 7-day trial package used by the /watch ad funnel. Package
// identifier `Yearly Trial` on the current RC offering; wraps the
// `yearly_7_days` product on the Keshah (Web Billing) app — yearly billing
// cycle, 1-week free trial, trial-eligible only when the customer has never
// made a prior purchase.
export const RC_PACKAGE_YEARLY_TRIAL = "Yearly Trial";
