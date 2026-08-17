import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start your KESHAH treatment",
  description:
    "60-day mechanotherapy treatment to stop your hair loss. No drugs. No side effects. Guaranteed.",
  robots: { index: false, follow: false },
};

const PREFETCH_GIFS = [
  "/start/results/proof_clip_1.mp4",
  "/start/results/proof_clip_2.mp4",
  "/start/results/proof_clip_3.mp4",
  "/start/results/proof_clip_4.mp4",
  "/start/results/proof_clip_5.mp4",
  "/start/results/proof_clip_6.mp4",
  "/start/results/proof_clip_7.mp4",
  "/start/results/women_clip_1.mp4",
  "/start/results/women_clip_2.mp4",
  "/start/results/women_clip_3.mp4",
  "/start/results/women_clip_4.mp4",
  "/start/results/women_clip_5.mp4",
  "/start/results/women_clip_6.mp4",
];

export default function StartIndiaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        rel="preload"
        as="image"
        href="/images/logo.png"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ fetchpriority: "high" } as any)}
      />
      <link rel="prefetch" href="/start/video/huberman_clip.mp4" />
      {PREFETCH_GIFS.map((href) => (
        <link key={href} rel="prefetch" href={href} />
      ))}
      {children}
    </>
  );
}
