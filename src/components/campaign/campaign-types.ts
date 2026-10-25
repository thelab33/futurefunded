import type { Campaign } from "@/domain/campaigns/types";
export type CampaignChapter = "story" | "plan" | "squads" | "partners" | "share" | "support" | "give" | "gear";
import type {CheckoutMode,FundingSource,PublicGivingDetails} from "@/domain/campaigns/payment-presentation";
export type RecordProps = {
    checkoutMode?:CheckoutMode;
    fundingSource?:FundingSource;
    givingDetails?:PublicGivingDetails|null;
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
