import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KESHAH — Drug-free hair restoration for women",
  description:
    "Stress and other factors tighten your scalp. A tight scalp gets no blood. Scalp massages — done right — loosen everything up so your hair can come back.",
  robots: { index: false, follow: false },
};

const PREFETCH_VIDEOS = [
  "/start/results/women_clip_1.mp4",
  "/start/results/women_clip_4.mp4",
  "/start/results/women_clip_5.mp4",
];

export default function MandyLayout({ children }: { children: React.ReactNode }) {
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
      <div data-funnel="mandy" style={{ minHeight: "100%" }}>
        {children}
      </div>
    </>
  );
}
