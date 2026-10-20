import type { Campaign } from "@/domain/campaigns/types";
import type { CampaignPresentationV1 } from "@/domain/campaigns/presentation-contract";

type Options = {
  checkoutReady: boolean;
  canonicalUrl: string | null;
  purposes: readonly { id: string; amountCents: number }[];
};

/** Pure server-entry adapter. A source record is not a payment settlement ledger. */
export function toCampaignPresentationV1(campaign: Campaign, options: Options): CampaignPresentationV1 {
  const { raised, goal, supporters } = campaign;
  if (![raised, goal, supporters].every(Number.isFinite) || raised < 0 || goal <= 0 || supporters < 0) {
    throw new Error("invalid_campaign_funding_snapshot");
  }
  if (options.purposes.some(p => !p.id || !Number.isSafeInteger(p.amountCents) || p.amountCents <= 0)) {
    throw new Error("invalid_purpose_configuration");
  }
  const media = (asset: import("@/domain/campaigns/types").CampaignMediaAsset | undefined) => asset ? { ...asset } : null;
  return {
    schemaVersion: 1,
    identity: {
      slug: campaign.slug, organization: campaign.organization, location: campaign.location,
      season: campaign.season, headline: campaign.headline, subhead: campaign.subhead,
      logo: media(campaign.media?.logo), hero: media(campaign.media?.hero),
    },
    funding: {
      source: "campaign_record_unreconciled", isVerifiedSettlement: false,
      raised, goal, supporters, remaining: Math.max(0, goal - raised),
      fundedPercent: Math.min(100, Math.round((raised / goal) * 100)),
    },
    capabilities: { ...campaign.capabilities },
    giving: {
      impact: campaign.impact.map(i => ({ amount: i.amount, label: i.label,
        ...(i.description === undefined ? {} : { description: i.description }), recommended: Boolean(i.recommended) })),
      checkoutReady: options.checkoutReady,
      purposes: options.purposes.map(p => ({ id: p.id, amountCents: p.amountCents })),
    },
    story: campaign.story ? {
      heading: campaign.story.heading,
      summary: campaign.story.summary ?? campaign.story.lede,
      image: media(campaign.media?.story),
    } : null,
    program: { sharedFund: true, teams: campaign.teams.map(t => ({ slug: t.slug, name: t.name, image: media(t.media) })) },
    sponsorship: {
      tiers: (campaign.sponsorship?.tiers ?? []).map(t => ({ slug: t.slug, name: t.name, price: t.price })),
      inquiryConfigured: Boolean(campaign.sponsorship?.inquiryUrl?.trim()),
    },
    publicUrl: options.canonicalUrl,
  };
}
