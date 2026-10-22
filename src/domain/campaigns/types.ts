import type { CampaignCapabilities } from "@/config/capabilities";

export type ImpactOption = { category?: string; amount: number; label: string; description?: string; recommended?: boolean };
export type Team = { slug: string; name: string; media?: CampaignMediaAsset; focus?: string; supportNote?: string };

export type CampaignMediaAsset = {
  src: string;
  alt: string;
  credit?: string;
  presentation?: "identity" | "photograph";
  objectPosition?: string;
};

export type CampaignMedia = {
  logo?: CampaignMediaAsset;
  hero?: CampaignMediaAsset;
  story?: CampaignMediaAsset;
  community?: CampaignMediaAsset;
};

export type CampaignStoryFact = {
  label: string;
  value: string;
};

export type CampaignCoverage = {
  publisher: string;
  label: string;
  headline: string;
  articleUrl: string;
};

export type CampaignStory = {
  heading: string;
  lede: string;
  narrative: string;
  /** Short public summaries; the full lede and narrative remain in the Story record. */
  summary?: string;
  programSummary?: string;
  facts: readonly CampaignStoryFact[];
  priorities?: readonly { label: string; description: string }[];
  coverage?: CampaignCoverage;
};

export type CampaignSeasonPlan = {
  status: "proposed" | "approved";
  updatedAt?: string;
  allocations: readonly { label: string; percent: number }[];
};

export type GearItem = {
  slug: string;
  name: string;
  price: number;
  category: string;
  description: string;
  image?: string;
  imageAlt?: string;
  externalUrl?: string;
};

export type CampaignCommerce = {
  storefrontUrl?: string;
  fulfillmentNote?: string;
};

export type CampaignUpdate = {
  id: string;
  title: string;
  summary: string;
  /** Publish explicitly; legacy or missing statuses fail closed as drafts. */
  status?: "draft" | "published";
  /** Required for publication: an ISO UTC timestamp, not an arbitrary local date. */
  publishedAt?: string;
  category?: "practice" | "competition" | "travel" | "equipment" | "access" | "community";
};

export type SupportActivity = {
  id: string;
  kind: "gift" | "milestone" | "sponsor";
  supporterName?: string;
  anonymous?: boolean;
  amount?: number;
  label: string;
  occurredAt?: string;
};

export type CampaignCommunity = {
  updates: CampaignUpdate[];
  support: SupportActivity[];
};

export type SponsorshipTier = {
  slug: string;
  name: string;
  price: number;
  focus: string;
  summary: string;
  featured?: boolean;
};

export type SponsorRecognition = {
  slug: string;
  name: string;
  logo?: string;
  url?: string;
};

export type SupporterDeskItem = {
  slug: string;
  category: "giving" | "trust" | "help";
  shortLabel: string;
  question: string;
  answer: string;
};

export type CampaignSponsorship = {
  tiers: SponsorshipTier[];
  recognizedSponsors: SponsorRecognition[];
  inquiryUrl?: string;
  recognitionNote?: string;
};

export type TextToGiveConfig = {
  keyword: string;
  publicNumber?: string;
  replyCopy: string;
};

export type NewsletterConfig = {
  enabled: boolean;
  eyebrow: string;
  heading: string;
  description: string;
};

export type CampaignEngagement = {
  textToGive?: TextToGiveConfig;
  newsletter?: NewsletterConfig;
};

export type SeasonMission = {
  /** Tenant-owned campaign rallying line; omit to use a general mission fallback. */
  rallyingCry?: string;
  title: string;
  summary: string;
  priorities: readonly { id: string; title: string; summary: string; detail: string; image?: CampaignMediaAsset }[];
};

/** Public presentation preferences, never payment authorization. */
export type CampaignBranding = {
  accent?: string;
  surface?: "warm" | "clean" | "dark";
  typography?: "editorial" | "modern";
  recommendedLabel?: string;
  supporterLabel?: string;
};

export type Campaign = {
  branding?: CampaignBranding;
  slug: string;
  organization: string;
  location: string;
  season: string;
  headline: string;
  subhead: string;
  raised: number;
  goal: number;
  supporters: number;
  capabilities: CampaignCapabilities;
  media?: CampaignMedia;
  story?: CampaignStory;
  seasonPlan?: CampaignSeasonPlan;
  impact: ImpactOption[];
  teams: Team[];
  seasonMission?: SeasonMission;
  /** Documentary history, not a current roster or participation count. */
  athleteGallery?: readonly CampaignMediaAsset[];
  gear: GearItem[];
  commerce?: CampaignCommerce;
  community?: CampaignCommunity;
  sponsorship?: CampaignSponsorship;
  supporterDesk: SupporterDeskItem[];
  engagement?: CampaignEngagement;
};
