import { connectAtxElite } from "@/data/campaigns/connect-atx-elite";

const campaignList = [connectAtxElite];
const campaigns = new Map(campaignList.map((campaign) => [campaign.slug, campaign]));

export function getCampaign(slug: string) {
  return campaigns.get(slug) ?? null;
}

export function getCampaignByTextKeyword(keyword: string) {
  const normalized = keyword.trim().toUpperCase();
  return campaignList.find(
    (campaign) => campaign.engagement?.textToGive?.keyword.toUpperCase() === normalized,
  ) ?? null;
}
