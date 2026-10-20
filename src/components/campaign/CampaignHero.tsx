import Image from "next/image";
import type { Campaign } from "@/domain/campaigns/types";
import type { campaignMedia } from "@/components/campaign/campaign-media";
import styles from "@/components/campaign/Campaign.module.css";

type CampaignHeroProps = {
  campaign: Campaign;
  media: ReturnType<typeof campaignMedia>;
};

const FLAGSHIP_HEADLINE = "Fund the season. Back every athlete.";

export function CampaignHero({
  campaign,
  media,
}: CampaignHeroProps) {
  const hero = media.hero;

  return (
    <section className={styles.hero} aria-labelledby="campaign-title">
      {hero && (
        <Image
          unoptimized
          className={styles.heroPhoto}
          src={hero.src}
          alt={hero.alt}
          fill
          preload
          sizes="100vw"
          style={
            hero.objectPosition
              ? { objectPosition: hero.objectPosition }
              : undefined
          }
        />
      )}

      <div className={styles.headline}>
        <div className={styles.eyebrow} aria-hidden="true"><span className={styles.eyebrowLine} /> {campaign.season} <span className={styles.eyebrowDot}>/</span> {campaign.location}</div>
        <h1 id="campaign-title">
          {campaign.headline === FLAGSHIP_HEADLINE ? (
            <>
              Fund the season.{" "}
              <br />
              <em>Back every athlete.</em>
            </>
          ) : (
            campaign.headline
          )}
        </h1>
        <p>{campaign.subhead}</p>
        <a className={styles.missionCallout} href="#giving">Explore ways to give <span aria-hidden="true">→</span></a>
      </div>
    </section>
  );
}
