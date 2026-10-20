import type { Campaign } from "@/domain/campaigns/types";
import type { CampaignChapter } from "@/components/campaign/campaign-types";
import styles from "@/components/campaign/Campaign.module.css";

type CampaignFooterProps = {
  campaign: Campaign;
  checkoutReady: boolean;
  onChapter: (chapter: CampaignChapter) => void;
};

/** Institutionally grounded footer; all destinations use the existing chapter owner. */
export function CampaignFooter({ campaign, checkoutReady, onChapter }: CampaignFooterProps) {
  const attributionMode = process.env.NEXT_PUBLIC_FF_ATTRIBUTION_MODE === "white-label"
    ? "white-label"
    : "co-branded";

  return (
    <footer className={styles.campaignFooter} aria-label="Campaign trust and record" data-orbit-footer="institutional-v6e-d2">
      <div className={styles.campaignFooterIdentity}>
        <span className={styles.campaignFooterBrand}>
          {campaign.organization}
        </span>
        <span className={styles.campaignFooterMeta}>{campaign.season} campaign · {campaign.location}</span>
        <span className={styles.campaignFooterMission}>{campaign.seasonMission?.rallyingCry ?? "Support the mission."}</span>
        {attributionMode === "co-branded" && (
          <div className={styles.campaignPlatformSignature}>
            <span>Powered by <strong>FutureFunded</strong></span>
            <span className={styles.campaignPlatformTagline}>Fundraising built for the next generation.</span>
          </div>
        )}
      </div>

      <div className={styles.campaignFooterTrust} role="group" aria-label="Campaign trust status">
        <span className={styles.campaignFooterLabel}>Organizer & giving</span>
        <button type="button" aria-haspopup="dialog" aria-controls="campaign-detail-dialog" onClick={() => onChapter("support")}>Organizer information</button>
        <span>{checkoutReady ? "Test checkout only" : "Checkout setup in progress"}</span>
        <span>Receipt available after completed gift</span>
      </div>

      <div className={styles.campaignFooterActions}>
        <span className={styles.campaignFooterLabel}>Campaign resources</span>
        <button type="button" aria-haspopup="dialog" aria-controls="campaign-detail-dialog" onClick={() => onChapter("support")}>Privacy & policies</button>
        <button type="button" aria-haspopup="dialog" aria-controls="campaign-detail-dialog" onClick={() => onChapter("support")}>Campaign record · Shared season fund</button>
        <button type="button" aria-label="Official collection status: in preparation" aria-haspopup="dialog" aria-controls="campaign-detail-dialog" onClick={() => onChapter("gear")}>
          Official collection · <span className={styles.collectionStatus}>In preparation{"\u00a0"}<span aria-hidden="true">→</span></span>
        </button>
      </div>
    </footer>
  );
}
