"use client";

import { useState } from "react";
import Image from "next/image";
import type { Campaign } from "@/domain/campaigns/types";
import styles from "@/components/campaign/Campaign.module.css";
import type { campaignMedia } from "@/components/campaign/campaign-media";

type CampaignStoryProps = {
  campaign: Campaign;
  media: ReturnType<typeof campaignMedia>;
};

export function CampaignStory({ campaign, media }: CampaignStoryProps) {
  const storyImage = media.story;
  const [videoLoaded, setVideoLoaded] = useState(false);
  const hasKvueReport = campaign.slug === "connect-atx-elite"
    && campaign.story?.coverage?.publisher.toUpperCase() === "KVUE";
  const reportUrl = "https://www.kvue.com/embeds/video/responsive/269-beeecfc1-eb68-4cca-8ec5-417b66d8cbfa/iframe";

  return (
    <section
      className={styles.storyWing}
      aria-labelledby="bridge-title"
      data-orbit-story="documentary-v6c"
    >
      <div className={styles.storyCopy}>
        <div className={styles.storyMeta}>
          <p className={styles.storyEyebrow}>Program story</p>
        </div>

        <h2 id="bridge-title">
          Basketball{" "}
          <br />
          is the <em>bridge.</em>
        </h2>

        <p>{campaign.story?.summary ?? campaign.story?.lede}</p>
      </div>

      <div role="group" aria-label={hasKvueReport ? "KVUE program coverage" : "Program coverage"}>
      {(storyImage || hasKvueReport) && (
        <div className={styles.storyMedia}>
          <div className={styles.storyPhoto} data-story-media="documentary">
            {hasKvueReport && videoLoaded ? (
              <iframe
                className={styles.reportFrame}
                src={reportUrl}
                title="KVUE report: The Connect ATX youth basketball program"
                allow="fullscreen; picture-in-picture"
                tabIndex={0}
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <>
                {storyImage && (
                  <Image
                    unoptimized
                    src={storyImage.src}
                    alt={storyImage.alt}
                    fill
                    sizes="(max-width: 639px) calc(100vw - 28px), (max-width: 1023px) 48vw, 32vw"
                    style={storyImage.objectPosition
                      ? { objectPosition: storyImage.objectPosition }
                      : undefined}
                  />
                )}

              </>
            )}
            {hasKvueReport && !videoLoaded && (
              <button
                className={styles.reportTrigger}
                type="button"
                onClick={() => setVideoLoaded(true)}
                aria-describedby="story-video-disclosure"
              >
                <span className={styles.playIcon} aria-hidden="true">▶</span>
                <span>Watch the KVUE report</span>
              </button>
            )}
          </div>
          {hasKvueReport && (
            <p id="story-video-disclosure" className={styles.videoDisclosure}>
              Hosted by KVUE. Playing connects to its video service.
            </p>
          )}
        </div>
      )}

      {campaign.story?.coverage && (
        <a
          className={styles.coverage}
          href={campaign.story.coverage.articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Read ${campaign.story.coverage.publisher} feature: ${campaign.story.coverage.headline} (opens in a new tab)`}
        >
          {!hasKvueReport && <span className={styles.coverageMeta}>
            <b>{campaign.story.coverage.publisher}</b>
          </span>}
          <strong>{campaign.story.coverage.headline}</strong>
          <span className={styles.coverageAction}>
            Read the {campaign.story.coverage.publisher} feature <span aria-hidden="true">↗</span>
          </span>
        </a>
      )}
      </div>
    </section>
  );
}
