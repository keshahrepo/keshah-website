import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KESHAH — I stopped my hair loss in 55 days",
  description:
    "No finasteride. No minoxidil. I found out my hair loss was a tight-scalp problem — and I fixed it.",
  robots: { index: false, follow: false },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        rel="preload"
        as="image"
        href="/images/logo.png"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ fetchpriority: "high" } as any)}
      />
      {children}
    </>
  );
}
