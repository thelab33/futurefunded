import type { Campaign, CampaignMediaAsset } from "@/domain/campaigns/types";

/**
 * Resolve the campaign's editorial media from tenant data.
 *
 * The logo can fall back to a team identity asset. Chapter photographs keep
 * their established ordering, so changing this module does not silently
 * change the images used by the existing campaign.
 */
export function campaignMedia(campaign: Campaign) {
  const hero = campaign.media?.hero;
  const story = campaign.media?.story;
  const community = campaign.media?.community;

  const identity =
    campaign.media?.logo ??
    campaign.teams.find(
      (team) => team.media?.presentation === "identity"
    )?.media;

  const photographs: CampaignMediaAsset[] = campaign.teams.flatMap((team) => {
    const image = team.media;
    return image && image.presentation !== "identity" ? [image] : [];
  });

  return {
    hero,
    story,
    identity,
    chapters: {
      story,
      plan: hero,
      squads: campaign.athleteGallery?.[0] ?? community,
      partners: campaign.athleteGallery?.[3] ?? photographs[0] ?? community,
      share: campaign.athleteGallery?.[1] ?? community ?? hero,
      support: campaign.athleteGallery?.[4] ?? story ?? community,
    },
  };
}
