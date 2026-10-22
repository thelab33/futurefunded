import type { Campaign } from "@/domain/campaigns/types";
export type CampaignChapter = "story" | "plan" | "squads" | "partners" | "share" | "support" | "give" | "gear";
export type RecordProps = {
    chapter: CampaignChapter;
    campaign: Campaign;
    amount: number;
    custom: string;
    purposes: {
        amountCents: number;
        id: string;
    }[];
    checkoutReady: boolean;
    canonicalUrl: string | null;
    onBack: () => void;
};
