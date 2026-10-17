/**
 * Creator onboarding content. Edit freely: this file is the only place the
 * portal's "Getting started" copy lives.
 */

export interface FounderVideo {
  /** Stable id: watched-state is stored against it, so don't change once live. */
  id: string;
  title: string;
  url: string;
}

export const KESHAH_SITE_URL = "https://www.keshah.com";

export const FOUNDER_VIDEOS: FounderVideo[] = [
  {
    id: "reversed-hair-loss",
    title: "How I reversed my hair loss naturally (no drugs)",
    url: "https://www.youtube.com/watch?v=Vu4qtKlTbIc",
  },
  {
    id: "science-of-hair-loss",
    title: "The real science of hair loss",
    url: "https://www.youtube.com/watch?v=tw_21vGcxBY",
  },
];

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** Index into options. Checked server-side only; never sent to the browser. */
  correct: number;
}

// Draft questions. All must be right to pass; retries allowed.
export const QUIZ: QuizQuestion[] = [
  {
    id: "cause",
    question: "What's usually behind the hair loss KESHAH helps with?",
    options: [
      "Washing your hair too often",
      "A tight scalp that squeezes the blood vessels, so blood can't reach the hair",
      "Wearing hats",
      "Not taking enough vitamins",
    ],
    correct: 1,
  },
  {
    id: "how",
    question: "How does KESHAH help?",
    options: [
      "A pill you take every morning",
      "A special shampoo",
      "Daily scalp exercises that loosen the scalp",
      "A laser cap",
    ],
    correct: 2,
  },
  {
    id: "blood",
    question: "What happens when blood can't reach your hair?",
    options: [
      "It grows back thicker",
      "The hair gets weaker and falls out",
      "Nothing, hair doesn't need blood",
      "It turns grey overnight",
    ],
    correct: 1,
  },
];

/** Quiz without answers, safe to send to the browser. */
export function publicQuiz() {
  return QUIZ.map(({ id, question, options }) => ({ id, question, options }));
}

// Copy for the "Set up your accounts" step. Change here only.
export const ACCOUNTS_STEP_TEXT =
  "Create a new TikTok account and a new Instagram account with your keshah.com email, shown below. For now, just set your name, username and photo. You'll add your bio and link yourself in the last step.";

export const VERIFICATION_CODE_TEXT =
  "TikTok and Instagram will send a code to your keshah.com email. It arrives in your personal inbox too, so check there.";

export const HANDLE_TAKEN_TEXT =
  "If it's taken, add a number at the end, like jen.keshah1 or jen.keshah2. Use the same handle on TikTok and Instagram if you can.";

/**
 * Suggested username: first name, lowercase, plain a to z letters only, then
 * ".keshah". "Jen Rivera" gives "jen.keshah", "José" gives "jose.keshah".
 */
export function suggestedHandle(name: string): string {
  const first = (name.trim().split(/\s+/)[0] ?? "")
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return `${first || "yourname"}.keshah`;
}

// PLACEHOLDER: link to the accounts setup guide PDF.
export const ACCOUNTS_GUIDE_URL = "";

// PLACEHOLDER: link to the full posting guide.
export const POSTING_GUIDE_URL = "";

export const WARMUP_DAYS = 3;
export const WARMUP_HEADLINE = "Warm up your accounts for 3 days. Don't post yet.";
export const WARMUP_TEXT =
  "For the next 3 days, don't post anything. Each day, spend 10 minutes on TikTok and 10 minutes on Instagram using your new accounts. Scroll, like and comment on hair loss and hair care videos, like a normal person would. This tells the apps what your account is about, so your videos get shown to the right people later. Come back each day and tick it off.";
export const FIRST_POSTING_DAY_TEXT = "Your first posting day is the weekday after your warm-up ends.";
export const WARMUP_DONE_TEXT = "Warm-up done. You can start posting on your first posting day.";

export const POSTING_RULES: string[] = [
  "Post unique videos every weekday, Monday to Friday: 3 a day during your 20-day paid trial, then 5 a day once you pass.",
  "Post each video on both TikTok and Instagram.",
  "Your deadline is 11:59 pm in your own timezone.",
  "Log both links for every video on the Today tab before the deadline.",
];
