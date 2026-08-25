import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KESHAH — drug-free hair regrowth",
  description:
    "Stop hair loss with daily scalp work. Regrow with weekly microneedling. Two tools, one system. Drug-free.",
  robots: { index: false, follow: false },
};

const PREFETCH_VIDEOS = [
  "/start/results/proof_clip_1.mp4",
  "/start/results/proof_clip_2.mp4",
  "/start/results/proof_clip_3.mp4",
];

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        rel="preload"
        as="image"
        href="/images/logo.png"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ fetchpriority: "high" } as any)}
      />
      {PREFETCH_VIDEOS.map((href) => (
        <link key={href} rel="prefetch" href={href} />
      ))}
      {children}
    </>
  );
}
