import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're in — KESHAH",
  description:
    "Welcome to KESHAH. Open the app on your phone to start your daily scalp routine.",
  robots: { index: false, follow: false },
};

export default function SuccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
