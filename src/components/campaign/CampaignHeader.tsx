"use client";

import Image from "next/image";
import type { Campaign } from "@/domain/campaigns/types";
import type { CampaignChapter } from "@/components/campaign/campaign-types";
import type { campaignMedia } from "@/components/campaign/campaign-media";
import styles from "@/components/campaign/Campaign.module.css";

type CampaignHeaderProps = {
  campaign: Campaign;
  identity: ReturnType<typeof campaignMedia>["identity"];
  onGive: () => void;
  onChapter: (chapter: CampaignChapter) => void;
  hydrated: boolean;
  checkoutReady: boolean;
};

export function CampaignHeader({
  campaign,
  identity,
  onGive,
  onChapter,
  hydrated,
  checkoutReady,
}: CampaignHeaderProps) {
  const initials =
    campaign.organization
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? "")
      .join("")
      .toUpperCase() || "FF";

  const hasIdentityImage = Boolean(identity?.src);

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
      <a
        className={styles.identity}
        href={`/c/${campaign.slug}`}
        aria-label={`${campaign.organization} campaign home`}
      >
        <span
          className={hasIdentityImage ? styles.brandMark : styles.monogram}
          aria-hidden="true"
        >
          {hasIdentityImage && identity ? (
            <Image
              unoptimized
              src={identity.src}
              alt=""
              width={52}
              height={52}
            />
          ) : (
            initials
          )}
        </span>

        <span className={styles.identityCopy}>
          <strong>{campaign.organization}</strong>
          <small>
            {campaign.season} · {campaign.location}
          </small>
        </span>
      </a>

      <nav className={styles.nav} aria-label="Campaign navigation">
        <a href="#giving">Campaign</a>

        <button
          type="button"
          aria-haspopup="dialog"
          aria-controls="campaign-detail-dialog"
          disabled={!hydrated}
          onClick={() => onChapter("squads")}
        >
          Program
        </button>

        <button
          type="button"
          aria-haspopup="dialog"
          aria-controls="campaign-detail-dialog"
          disabled={!hydrated}
          onClick={() => onChapter("partners")}
        >
          Partners
        </button>

        <button
          type="button"
          aria-haspopup="dialog"
          aria-controls="campaign-detail-dialog"
          disabled={!hydrated}
          onClick={() => onChapter("support")}
        >
          Support
        </button>
      </nav>

      <button
        type="button"
        className={styles.headerGive}
        data-checkout-ready={checkoutReady ? "true" : "false"}
        aria-haspopup="dialog"
        aria-controls="campaign-detail-dialog"
        disabled={!hydrated}
        onClick={onGive}
      >
        <span className={styles.giveLabel}>{checkoutReady ? "Give securely" : "Support the season"}</span>
        <Image
          unoptimized
          src="/media/futurefunded/arrow-right.svg"
          alt=""
          width={20}
          height={20}
          aria-hidden="true"
        />
      </button>
      </div>
    </header>
  );
}
