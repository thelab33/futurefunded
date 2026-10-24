import type { Campaign } from "@/domain/campaigns/types";
import styles from "@/components/campaign/Campaign.module.css";
import { formatCampaignMoney as money } from "@/components/campaign/campaign-format";

import layout from "./CampaignPartnersDetail.module.css";

export function CampaignPartnersDetail({ campaign }: { campaign: Campaign }) {
  const sponsorship = campaign.sponsorship;

  return <div className={styles.recordPartners} data-partner-record="true">
    <p className={styles.recordLede}>Help keep the season within reach. Compare partnership levels below; recognition and availability are confirmed with the organizer.</p>
    {Boolean(sponsorship?.tiers.length) && <ul className={`${styles.recordTiers} ${layout.tiers}`} aria-label="Partnership levels">
      {sponsorship?.tiers.map((tier) => <li key={tier.slug} data-featured={tier.featured ? "true" : undefined} className={`${layout.tier} ${tier.featured ? styles.recordFeatured : ""}`}>
        <span className={`${styles.recordTierKicker} ${layout.kicker}`}>{tier.featured ? "Lead partnership" : "Program partnership"}</span>
        <div className={`${styles.recordTierHeading} ${layout.heading}`}><h3>{tier.name}</h3><strong>{money(tier.price)}</strong></div>
        <p className={`${styles.recordTierFocus} ${layout.focus}`}>{tier.focus}</p>
        <p className={`${styles.recordTierSummary} ${layout.summary}`}>{tier.summary}</p>
      </li>)}
    </ul>}
    <div className={styles.recordPartnerNext}>
      <strong>Build the season together.</strong>
      {sponsorship?.inquiryUrl ? <a href={sponsorship.inquiryUrl}>Start a partnership conversation <span aria-hidden="true">↗</span></a>
        : <p>Sponsor inquiries are not available here yet. These levels describe opportunities; no sponsorship is reserved or confirmed on this page.</p>}
      {sponsorship?.recognitionNote && <p>{sponsorship.recognitionNote}</p>}
    </div>
    {Boolean(sponsorship?.recognizedSponsors.length) && <ul className={styles.recordConfirmedSponsors} aria-label="Confirmed community partners">
      {sponsorship?.recognizedSponsors.map((sponsor) => <li key={sponsor.slug}>{sponsor.url
        ? <a href={sponsor.url} target="_blank" rel="noreferrer" aria-label={`${sponsor.name} (opens in a new tab)`}>{sponsor.name} <span aria-hidden="true">↗</span></a>
        : sponsor.name}</li>)}
    </ul>}
  </div>;
}
