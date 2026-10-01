// Source of truth for careers page listings. Edit this file to add,
// remove, or update roles — the page + detail page + filters all
// derive from this. When a listing is added, run a deploy and it
// shows up automatically.

export type Listing = {
  slug: string;
  title: string;
  team: string;
  location: string;
  employment: string; // "Full-time" | "Part-time" | "Internship" | "Contract"
  summary: string; // 1-2 line teaser shown on the listing card
  meta: {
    startDate: string;
    duration: string;
    schedule: string;
  };
  sections: {
    heading: string;
    body?: string;
    bullets?: string[];
  }[];
  compensation: string;
  applicationProcess: string[];
  closingNote?: string;
};

export const LISTINGS: Listing[] = [
  {
    slug: "paid-creator-intern",
    title: "Paid Creator Intern",
    team: "Content",
    location: "Remote",
    employment: "Part-time",
    summary:
      "Create daily short-form video content and learn how content drives growth at a startup.",
    meta: {
      startDate: "Rolling",
      duration: "3 months, with the option to extend",
      schedule: "~1 hr/day, Mon–Fri, designed to fit alongside classes",
    },
    sections: [
      {
        heading: "About KESHAH",
        body:
          "KESHAH is a drug-free hair loss app founded by a Berkeley EECS graduate, with 80M+ views across short-form video in the last 6 months. We're hiring college students to create daily short-form content and learn how content drives growth at a startup.",
      },
      {
        heading: "What you'll do",
        bullets: [
          "Film 4 talking-head videos per day (~60 seconds each), Mon–Fri, using scripts and references provided",
          "Complete basic edits in the TikTok app (training provided; no prior editing experience required)",
          "Post to TikTok and Instagram accounts created for you by KESHAH, separate from your personal accounts",
        ],
      },
      {
        heading: "What you'll get",
        bullets: [
          "Training in short-form content: hooks, scripting, delivery and editing",
          "On-camera confidence that carries into interviews, presentations and pitches",
          "Direct experience at an early-stage startup",
          "Advancement to higher retainer levels based on performance",
          "Measurable performance results for your résumé",
        ],
      },
      {
        heading: "Minimum qualifications",
        bullets: [
          "Currently enrolled in a US college (juniors and seniors preferred)",
          "Comfortable speaking on camera",
          "No personal experience with hair loss or prior posting experience required",
        ],
      },
    ],
    compensation:
      "Base $400/mo + $15 bonus per video over 100K views, following a paid two-week trial.",
    applicationProcess: [
      "Apply",
      "If deemed a fit, select a time for a 30-min group interview with Aadi, our founder",
      "Selected applicants begin a paid two-week trial",
      "Following a successful trial, you officially join the KESHAH creator team",
    ],
    closingNote:
      "If you're comfortable on camera and want flexible, paid work that builds real startup experience and on-camera confidence, we encourage you to apply.",
  },
];

export const APPLY_EMAIL = "contact@keshah.com";

export function getListing(slug: string): Listing | undefined {
  return LISTINGS.find((l) => l.slug === slug);
}

export function allTeams(): string[] {
  return Array.from(new Set(LISTINGS.map((l) => l.team))).sort();
}

export function allLocations(): string[] {
  return Array.from(new Set(LISTINGS.map((l) => l.location))).sort();
}
