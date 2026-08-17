import type { Metadata } from "next";

// Generic creator funnel layout. The actual config (audience, theme, etc.)
// is resolved from the slug via funnel-config.ts at runtime in the step
// components. This layout just sets common <head> metadata + image preload.

export const metadata: Metadata = {
  title: "KESHAH — Drug-free hair restoration",
  description:
    "Stress and other factors tighten your scalp. A tight scalp gets no blood. Scalp massages — done right — loosen everything up so your hair can come back.",
  robots: { index: false, follow: false },
};

export default function CreatorFunnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link
        rel="preload"
        as="image"
        href="/images/logo.png"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ fetchpriority: "high" } as any)}
      />
      <div data-funnel="creator">{children}</div>
    </>
  );
}
