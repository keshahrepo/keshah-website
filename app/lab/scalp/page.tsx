import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LAB_KEY } from "@/lib/lab/key";
import ScalpLab from "./scalp-lab";

export const metadata: Metadata = {
  title: "Scalp mobility lab",
  robots: { index: false, follow: false },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  if (k !== LAB_KEY) notFound();
  return <ScalpLab labKey={k} />;
}
