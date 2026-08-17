import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KESHAH",
  robots: { index: false, follow: false },
};

const PREFETCH_VIDEOS = [
  "/watch/how_it_works.mp4",
  "/watch/trial_explainer.mp4",
];

export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {PREFETCH_VIDEOS.map((href) => (
        <link key={href} rel="prefetch" href={href} />
      ))}
      {children}
    </>
  );
}
