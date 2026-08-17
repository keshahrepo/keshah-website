// Funnel config — single source of truth for what differs between creators
// and audiences. Adding a new creator = drop a new entry in CREATOR_CONFIGS
// and they get a route at /f/{slug} with the right audience + theme +
// pricing + attribution wired up.
//
// Step components read config via useFunnelConfig() instead of grepping
// pathname.startsWith("/mandy") etc. — that pattern was getting ugly fast.

export type Audience = "men" | "women" | "auto";
export type Theme = "dark" | "light";
export type PricingVariant = "default" | "us3";

/** One slide in a creator's mini-origin-story (replaces WhyItHappens) */
export interface OriginStoryBeat {
  title: string;
  body?: string;
  /** Optional image path under /public — full-bleed cover above text */
  image?: string;
}

/** Per-creator quote shown on the Us3PlanModal trust note */
export interface PaywallTrustQuote {
  quote: string;
  /** Creator's name shown below the quote */
  name?: string;
  /** Photo path under /public — shown left of the quote, like Aadi's avatar */
  photo?: string;
}

export interface CreatorConfig {
  /** URL slug — `/f/{slug}` */
  slug: string;
  /** Attribution string — funnel events tag with this for analytics */
  attribution: string;
  /** Locks the audience for this funnel. "auto" lets the quiz branch decide. */
  audience: Audience;
  /** Visual theme — "light" = cream background, "dark" = current black */
  theme: Theme;
  /** Which paywall modal renders */
  pricing: PricingVariant;
  /** Show the Hims-style FAQ on the paywall */
  faqEnabled: boolean;
  /** Skip Aadi's 25-beat founder story — used for women's funnels where
   *  WhyItHappens replaces it */
  skipFounderStory: boolean;
  /** Override the trial paywall headline. Falls back to default if unset. */
  headlineOverride?: string;
  /** Override the trial paywall subhead. Falls back to default if unset. */
  subheadOverride?: string;

  // ── Per-creator content overrides ─────────────────────────────────────
  // All optional. When set, the corresponding step renders the creator's
  // own copy/photo instead of the shared default. Customization is
  // intentionally concentrated at the top of the funnel (hook, pinch test,
  // origin story, paywall trust quote) — the high-trust screens where
  // user identification with the creator drives conversion. Everything
  // downstream (qualification, quiz, diagnosis, plans) stays shared.

  /** Hook headline — overrides "Are you losing hair because of a tight scalp?" */
  hookHeadline?: string;
  /** Hook subhead — overrides "Let's do the 60-second test and find out." */
  hookSubhead?: string;
  /** Hook hero image — replaces aadi_hook.mp4 with a static photo */
  hookImage?: string;
  /** Creator's first name. Used in copy that references the creator by
   *  name. Leave unset on generic funnels. */
  creatorName?: string;
  /** Full bio sentence rendered as a caption overlay at the bottom of the
   *  Hook creator photo. Lives ON the photo (gradient backdrop for
   *  legibility) instead of as an eyebrow above the headline, so the
   *  intro feels attached to the face speaking — not a brand tag.
   *  Example: "Hey! I'm Jennifer, a mom of 6 and a hair loss educator at KESHAH." */
  creatorBio?: string;

  /** Pinch-test sides photo — replaces /start/pinch_sides_photo.jpg */
  pinchSidesImage?: string;
  /** Pinch-test top photo — replaces /start/pinch_top_photo.jpg */
  pinchTopImage?: string;
  /** Pinch-test result bridge text — replaces the default Aadi-voiced
   *  "That's exactly what I felt 4 years ago..." copy. Use \n for
   *  paragraph breaks. */
  pinchResultText?: string;

  /** Mini origin-story beats — replaces WhyItHappens' 4 default slides
   *  with the creator's personal story (3-5 beats works best). */
  originStoryBeats?: OriginStoryBeat[];

  /** Paywall trust quote — replaces the default women's neutral note in
   *  Us3PlanModal's guarantee block. */
  paywallTrustQuote?: PaywallTrustQuote;
}

const DEFAULT_CONFIG: CreatorConfig = {
  slug: "default",
  attribution: "us_kit",
  audience: "auto",
  theme: "dark",
  pricing: "us3",
  faqEnabled: true,
  skipFounderStory: false,
};

export const CREATOR_CONFIGS: Record<string, CreatorConfig> = {
  mandy: {
    slug: "mandy",
    attribution: "us_women_mandy",
    audience: "women",
    theme: "light",
    pricing: "us3",
    faqEnabled: true,
    skipFounderStory: true,
    // headline + subhead come from TrialPaywall's women's-frame defaults
    // (audience === "women") so all women's funnels share the same copy.
  },

  // Creator #1 — Jennifer, mom of 6. Postpartum hair loss angle.
  // Copy drafted from her own answers; replace photo files at
  // /public/start/creators/jennifer/{hook,pinch_sides,pinch_top,avatar}.jpg.
  jennifer: {
    slug: "jennifer",
    attribution: "us_women_jennifer",
    audience: "women",
    theme: "light",
    pricing: "us3",
    faqEnabled: true,
    skipFounderStory: true,
    // Hook headline stays the universal "Are you losing hair because of a
    // tight scalp?" — first-page consistency keeps the curiosity-test
    // framing intact across all funnels. Only the photo changes per creator.
    hookImage: "/start/creators/jennifer/hook.jpg",
    pinchSidesImage: "/start/creators/jennifer/pinch_sides.jpg",
    pinchTopImage: "/start/creators/jennifer/pinch_top.jpg",
    creatorName: "Jennifer",
    creatorBio: "I'm Jennifer, a mom of 6 and a hair loss educator at KESHAH.",
    // No story beats — Jennifer hasn't actually used the routine, so any
    // narrative she "tells" reads as fake. Educational interstitials inside
    // the quiz (HairLossRateResponse, StressFrequencyResponse, the
    // PersonalizedDiagnosis tie-together) do the mechanism-education job
    // honestly without requiring her to claim experience she doesn't have.
    paywallTrustQuote: {
      quote:
        "Six kids in, I'd given up on my hair. That's why I joined Keshah — drug-free is everything I believe in. Try this with me.",
      name: "Jennifer",
      photo: "/start/creators/jennifer/avatar.jpg",
    },
  },

  // Creator #2 — Donna, esthetician from Okinawa. Scalp-tension story.
  // Copy drafted from her own answers; replace photo files at
  // /public/start/creators/donna/{hook,pinch_sides,pinch_top,avatar}.jpg.
  donna: {
    slug: "donna",
    attribution: "us_women_donna",
    audience: "women",
    theme: "light",
    pricing: "us3",
    faqEnabled: true,
    skipFounderStory: true,
    // Hook headline stays the universal test framing — see jennifer above.
    hookImage: "/start/creators/donna/hook.jpg",
    pinchSidesImage: "/start/creators/donna/pinch_sides.jpg",
    pinchTopImage: "/start/creators/donna/pinch_top.jpg",
    creatorName: "Donna",
    creatorBio: "I'm Donna, a licensed skincare professional and educator at KESHAH.",
    // No story beats — see jennifer above. Same rationale.
    paywallTrustQuote: {
      quote:
        "I'd tried everything for years and still hadn't fixed it. That's why I joined Keshah — mechanical, drug-free, plant-aligned. Come do this with me.",
      name: "Donna",
      photo: "/start/creators/donna/avatar.jpg",
    },
  },
};

/** Resolve the config for the current pathname. Used both for the new
 *  /c/{slug} routes AND for legacy paths that we keep around (/startus3,
 *  /mandy, /startindia, /startfree). Anything outside this list gets the
 *  default. */
export function configForPath(pathname: string): CreatorConfig {
  // /f/{slug} — config-driven creator funnel routes
  if (pathname.startsWith("/f/")) {
    const slug = pathname.split("/")[2];
    if (slug && CREATOR_CONFIGS[slug]) return CREATOR_CONFIGS[slug];
  }
  // Legacy routes that map to known configs
  if (pathname.startsWith("/mandy")) return CREATOR_CONFIGS.mandy;
  // /startus3, /startindia, /startfree, anything else → default
  return DEFAULT_CONFIG;
}

/** Client-side hook for step components. SSR-safe — returns default
 *  during the server pass, real config once mounted. */
export function useFunnelConfig(): CreatorConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  return configForPath(window.location.pathname);
}

/** Returns "scalp massages" for women's funnels and women quiz-takers,
 *  "scalp exercises" for everyone else. Used to keep terminology coherent
 *  across all step copy — men respond to "exercises" framing, women to the
 *  softer / more familiar "massages" framing. Capitalize the result at the
 *  call-site if needed (e.g. as a headline). */
export function practiceTerm(audience: Audience, gender?: string): string {
  if (audience === "women" || gender === "female") return "scalp massages";
  return "scalp exercises";
}
