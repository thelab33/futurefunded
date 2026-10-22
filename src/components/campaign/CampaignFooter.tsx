import type { Campaign } from "@/domain/campaigns/types";
import type { CampaignChapter } from "@/components/campaign/campaign-types";
import styles from "@/components/campaign/CampaignFooter.module.css";
import finish from "./CampaignLowerFinish.module.css";

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
    <footer className={`${styles.campaignFooter} ${finish.footer}`} aria-label="Campaign trust and record" data-orbit-footer="editorial-v1-9">
      <div className={styles.campaignFooterIdentity}>
        <span className={`${styles.campaignFooterBrand} ${finish.brand}`}>
          {campaign.organization}
        </span>
        <span className={styles.campaignFooterMeta}>{campaign.season} campaign · {campaign.location}</span>
        <span className={styles.campaignFooterMission}>{campaign.seasonMission?.rallyingCry ?? "Support the mission."}</span>
        {attributionMode === "co-branded" && (
          <div className={`${styles.campaignPlatformSignature} ${finish.signature}`}>
            <span>Powered by <strong>FutureFunded</strong></span>
            <span className={styles.campaignPlatformTagline}>Fundraising built for the next generation.</span>
          </div>
        )}
      </div>

      <div className={styles.campaignFooterTrust} role="group" aria-label="Campaign trust status">
        <h2 className={`${styles.campaignFooterLabel} ${finish.label}`}>Organizer &amp; giving</h2>
        <button type="button" aria-haspopup="dialog" aria-controls="campaign-detail-dialog" onClick={() => onChapter("support")}>Organizer information</button>
        <div className={`${styles.givingStatus} ${finish.status}`}>
          <span>{checkoutReady ? "Test checkout only" : "Checkout setup in progress"}</span>
          <span>{checkoutReady ? "Test record only · No donation receipt" : "Giving is not open yet"}</span>
        </div>
      </div>

      <div className={styles.campaignFooterActions}>
        <h2 className={`${styles.campaignFooterLabel} ${finish.label}`}>Campaign resources</h2>
        <button type="button" aria-haspopup="dialog" aria-controls="campaign-detail-dialog" onClick={() => onChapter("support")}>Privacy & policies</button>
        <button type="button" aria-haspopup="dialog" aria-controls="campaign-detail-dialog" onClick={() => onChapter("support")}>Campaign record · Shared season fund</button>
        {campaign.capabilities.commerce && campaign.commerce?.storefrontUrl?.trim() && <button type="button" aria-label="Explore the official collection" aria-haspopup="dialog" aria-controls="campaign-detail-dialog" onClick={() => onChapter("gear")}>
          Official collection · <span className={styles.collectionStatus}>Explore{"\u00a0"}<span aria-hidden="true">→</span></span>
        </button>}
      </div>
    </footer>
  );
}
