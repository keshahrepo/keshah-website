import { notFound } from "next/navigation";
import StartFlow from "../../start/components/StartFlow";
import { CREATOR_CONFIGS } from "../../start/lib/funnel-config";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CreatorFunnelPage({ params }: Props) {
  const { slug } = await params;
  if (!CREATOR_CONFIGS[slug]) {
    notFound();
  }
  return <StartFlow />;
}
