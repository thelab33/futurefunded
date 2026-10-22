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

  const heroFrames = [
    hero && { ...hero, label: "The connection", objectPosition: hero.objectPosition ?? "center 38%", mobileObjectPosition: "center 40%" },
    campaign.athleteGallery?.[0] && { ...campaign.athleteGallery[0], label: "The achievement", objectPosition: campaign.athleteGallery[0].objectPosition ?? "center 32%", mobileObjectPosition: "center 35%" },
    community && { ...community, label: "The community", objectPosition: community.objectPosition ?? "center 28%", mobileObjectPosition: "center 32%" },
  ].filter((photo): photo is NonNullable<typeof photo> => Boolean(photo));
  const uniqueHeroFrames = heroFrames.filter((photo, index) => heroFrames.findIndex(item => item.src === photo.src) === index);

  return {
    heroFrames: uniqueHeroFrames,
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
