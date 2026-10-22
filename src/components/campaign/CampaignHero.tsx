"use client";
import { useRef } from "react";
import type { Campaign } from "@/domain/campaigns/types";
import type { campaignMedia } from "./campaign-media";
import { CampaignPhotoLayers } from "./CampaignPhotoLayers";
import { useCampaignPhotoRotation } from "./useCampaignPhotoRotation";
import styles from "./Campaign.module.css";
import finish from "./CampaignHeroFinish.module.css";

type CampaignHeroProps = { campaign: Campaign; media: ReturnType<typeof campaignMedia> };
const FLAGSHIP_HEADLINE = "Fund the season. Back every athlete.";

export function CampaignHero({ campaign, media }: CampaignHeroProps) {
  const frames = media.heroFrames;
  const heroRef = useRef<HTMLElement>(null);
  const rotation = useCampaignPhotoRotation(frames.length, heroRef);
  const active = Math.min(rotation.active, Math.max(0, frames.length - 1));
  return (
    <section ref={heroRef} className={`${styles.hero} ${finish.stage}`} aria-labelledby="campaign-title"
      aria-roledescription={frames.length > 1 ? "carousel" : undefined}
      onMouseEnter={rotation.onMouseEnter} onMouseLeave={rotation.onMouseLeave}
      onFocusCapture={rotation.onFocusCapture}
      data-hero-rotation={rotation.running ? "running" : "paused"} data-hero-active={active}>
      {frames.length > 0 && <div className={styles.heroScene} id="campaign-hero-photos">
        <CampaignPhotoLayers photos={frames} active={active} priority sizes="100vw"
          onLoad={rotation.onLoad} onError={rotation.onError} />
      </div>}
      <div className={`${styles.headline} ${finish.copy}`}>
        <div className={styles.eyebrow} aria-hidden="true"><span className={styles.eyebrowLine} /> {campaign.season} <span className={styles.eyebrowDot}>/</span> {campaign.location}</div>
        <h1 id="campaign-title">
          {campaign.headline === FLAGSHIP_HEADLINE ? <>
            Fund the season.{" "}<br /><em>Back every athlete.</em>
          </> : campaign.headline}
        </h1>
        <p>{campaign.subhead}</p>
        <a className={`${styles.missionCallout} ${finish.action}`} href="#giving">Explore ways to give <span aria-hidden="true">→</span></a>
      </div>
      {frames.length > 1 && (
        <div className={`${styles.heroControlDock} ${finish.controls}`} role="group" aria-label="Campaign photograph controls">
          <button className={styles.heroRotationButton} type="button"
            disabled={!rotation.hydrated || rotation.reduced || rotation.readyCount < 2}
            onPointerDown={rotation.onRotationPointerDown}
            onClick={event => rotation.toggleRotation(event.detail > 0)}
            aria-controls="campaign-hero-photos"
            aria-label={rotation.reduced ? "Automatic photographs off: reduced motion preference" : rotation.requested ? "Pause automatic photographs" : "Start automatic photographs"}>
            {rotation.reduced ? "Auto off" : rotation.requested ? "Pause" : "Play"}
          </button>
          <span className={`${styles.heroFrameLabel} ${finish.caption}`} aria-live={rotation.running ? "off" : "polite"} aria-atomic="true">
            <span>{String(active + 1).padStart(2, "0")} / {String(frames.length).padStart(2, "0")}</span>
            {frames[active]?.label}
          </span>
          <div className={styles.heroStepControls}>
            <button type="button" aria-label="Previous campaign photograph" aria-controls="campaign-hero-photos"
              disabled={!rotation.hydrated || rotation.readyCount < 2} onClick={() => rotation.step(-1)}>←</button>
            <button type="button" aria-label="Next campaign photograph" aria-controls="campaign-hero-photos"
              disabled={!rotation.hydrated || rotation.readyCount < 2} onClick={() => rotation.step(1)}>→</button>
          </div>
        </div>
      )}
    </section>
  );
}
