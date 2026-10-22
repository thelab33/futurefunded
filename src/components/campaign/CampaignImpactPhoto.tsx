import type { Campaign } from "@/domain/campaigns/types";
import { CampaignPhotoLayers } from "./CampaignPhotoLayers";
import type { CampaignPhoto } from "./campaign-photo-policy";
import styles from "./Campaign.module.css";

/** Documentary context only: photographs never imply an exact item purchase. */
export function CampaignImpactPhoto({ campaign, category, custom }: { campaign: Campaign; category?: string; custom: boolean }) {
  const { hero, community, story } = campaign.media ?? {};
  const photos = [hero, community, story].filter((photo): photo is CampaignPhoto => Boolean(photo))
    .filter((photo, index, all) => all.findIndex(item => item.src === photo.src) === index);
  if (!photos.length) return null;
  const normalized = category?.toLowerCase() ?? "";
  const desired = custom ? community : /practice|gym|training/.test(normalized) ? hero
    : /equipment|gear/.test(normalized) ? story : community;
  const index = Math.max(0, photos.findIndex(photo => photo.src === desired?.src));
  return <div className={styles.impactPhoto} aria-hidden="true">
    <CampaignPhotoLayers photos={photos} active={index} decorative sizes="72px" />
  </div>;
}
