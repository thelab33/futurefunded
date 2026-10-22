import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { testCheckoutContext } from "@/server/donations/store";
import { newsletterReady } from "@/server/newsletter-store";
import { getCampaign } from "@/data/campaigns";
import { publicCampaignSnapshot } from "@/domain/campaigns/season-dispatch";
import { getCampaignCanonicalUrl } from "@/config/site";
import { CampaignExperience } from "@/components/campaign/CampaignExperience";
import { toCampaignPresentationV1 } from "@/server/campaigns/presentation-adapter";
export const dynamic = "force-dynamic";
type Props = {params: Promise<{slug: string}>; searchParams: Promise<{checkout?: string}>};
export async function generateMetadata({params}: Pick<Props,"params">): Promise<Metadata> {
  const {slug} = await params;
  const campaign = getCampaign(slug);
  if (!campaign) return {};
  const canonical = getCampaignCanonicalUrl(slug);
  return {
    title: `${campaign.headline} | ${campaign.organization}`,
    description: campaign.subhead,
    alternates: canonical ? {canonical} : undefined,
    robots: {index: false, follow: false},
    openGraph: {title:campaign.headline,description:campaign.subhead,type:"website",url:canonical ?? undefined},
  };
}
export default async function CampaignPage({params,searchParams}: Props) {
  const {slug} = await params;
  const source = getCampaign(slug);
  if (!source) notFound();
  // Campaign content stays public-only; newsletter readiness checks its isolated schema.
  const snapshot = publicCampaignSnapshot(source,new Date().toISOString());
  const checkout = await testCheckoutContext(slug);
  // Test-ledger projection replaces demo figures only while explicitly configured.
  const campaign = checkout.ready && checkout.funding ? {
    ...snapshot, raised:checkout.funding.raised, supporters:checkout.funding.gifts,
    branding:{...snapshot.branding,supporterLabel:"test gifts"},
  } : snapshot;
  const presentation = toCampaignPresentationV1(campaign,{
    checkoutReady:checkout.ready, purposes:[], canonicalUrl:getCampaignCanonicalUrl(slug),
  });
  const query = await searchParams;
  return <CampaignExperience campaign={campaign} presentation={presentation}
    returned={query.checkout === "returned"} cancelled={query.checkout === "cancelled"}
    newsletterConfigured={await newsletterReady(slug)} />;
}
