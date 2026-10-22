import type { RecordProps } from "@/components/campaign/campaign-types";
export type { CampaignChapter } from "@/components/campaign/campaign-types";
import { CampaignGiveDetail } from "@/components/campaign/CampaignGiveDetail";
import { CampaignStoryDetail } from "@/components/campaign/CampaignStoryDetail";
import { CampaignPlanDetail } from "@/components/campaign/CampaignPlanDetail";
import { CampaignAthletesDetail } from "@/components/campaign/CampaignAthletesDetail";
import { CampaignPartnersDetail } from "@/components/campaign/CampaignPartnersDetail";
import { CampaignShareDetail } from "@/components/campaign/CampaignShareDetail";
import { CampaignSupportDetail } from "@/components/campaign/CampaignSupportDetail";
import { CampaignGearDetail } from "@/components/campaign/CampaignGearDetail";

export function CampaignRecord(props: RecordProps) {
    switch (props.chapter) {
        case "give": return <CampaignGiveDetail {...props} />;
        case "story": return <CampaignStoryDetail {...props} />;
        case "plan": return <CampaignPlanDetail {...props} />;
        case "squads": return <CampaignAthletesDetail {...props} />;
        case "partners": return <CampaignPartnersDetail {...props} />;
        case "share": return <CampaignShareDetail {...props} />;
        case "support": return <CampaignSupportDetail {...props} />;
        case "gear": return <CampaignGearDetail {...props} />;
    }
}
