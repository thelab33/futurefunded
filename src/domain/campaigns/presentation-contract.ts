import type { CampaignCapabilities, } from "@/config/capabilities";
import type { CampaignMediaAsset } from "@/domain/campaigns/types";

/** Version 1 public campaign projection. No donor PII or payment credentials. */
export type CampaignPresentationV1 = {
  readonly schemaVersion: 1;
  readonly identity: {
    readonly slug: string;
    readonly organization: string;
    readonly location: string;
    readonly season: string;
    readonly headline: string;
    readonly subhead: string;
    readonly logo: CampaignMediaAsset | null;
    readonly hero: CampaignMediaAsset | null;
  };
  readonly funding: {
    readonly source: "campaign_record_unreconciled";
    readonly isVerifiedSettlement: false;
    readonly raised: number;
    readonly goal: number;
    readonly supporters: number;
    readonly remaining: number;
    readonly fundedPercent: number;
  };
  readonly capabilities: CampaignCapabilities;
  readonly giving: {
    readonly impact: readonly { readonly amount: number; readonly label: string; readonly description?: string; readonly recommended: boolean }[];
    readonly checkoutReady: boolean;
    readonly purposes: readonly { readonly id: string; readonly amountCents: number }[];
  };
  readonly story: {
    readonly heading: string;
    readonly summary: string;
    readonly image: CampaignMediaAsset | null;
  } | null;
  readonly program: {
    readonly sharedFund: true;
    readonly teams: readonly { readonly slug: string; readonly name: string; readonly image: CampaignMediaAsset | null }[];
  };
  readonly sponsorship: {
    readonly tiers: readonly { readonly slug: string; readonly name: string; readonly price: number }[];
    readonly inquiryConfigured: boolean;
  };
  readonly publicUrl: string | null;
};
