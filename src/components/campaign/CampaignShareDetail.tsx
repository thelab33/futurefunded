import type { Campaign } from "@/domain/campaigns/types";
import { CommunityRelay } from "@/components/campaign/relay/CommunityRelay";

export function CampaignShareDetail({ campaign, canonicalUrl }: { campaign: Campaign; canonicalUrl: string | null }) {
    return <CommunityRelay campaign={campaign} canonicalUrl={canonicalUrl}/>;
}
