// Group-interview video test. Applicants open this in the last 15
// minutes of the group call: desktop people scan the QR on the last
// slide (it points to /interview/live), phone people get the link in
// chat. /interview/<slug> targets one session; "live" resolves to the
// current open one. Follow-up emails link here with ?email= prefilled.

import type { Metadata } from "next";
import InterviewFlow from "./InterviewFlow";

export const metadata: Metadata = {
  title: "KESHAH | Your test video",
  robots: { index: false, follow: false },
};

export default async function InterviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  return <InterviewFlow slug={slug.toLowerCase()} initialEmail={email} />;
}
