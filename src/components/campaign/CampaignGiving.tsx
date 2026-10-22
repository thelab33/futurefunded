import Image from "next/image";
import { CampaignGivingStatus } from "@/components/campaign/CampaignGivingStatus";
import styles from "@/components/campaign/Campaign.module.css";
import {
  CampaignImpactChooser,
  type CampaignImpactChooserProps,
} from "@/components/campaign/CampaignImpactChooser";
import { formatCampaignMoney as money } from "@/components/campaign/campaign-format";

type CampaignGivingProps = CampaignImpactChooserProps & {
  checkoutReady: boolean;
};

export function CampaignGiving({
  campaign,
  checkoutReady,
  ...chooser
}: CampaignGivingProps) {
  const goal = Math.max(0, campaign.goal);
  const raised = Math.max(0, campaign.raised);
  const fundedPercent =
    goal > 0 ? Math.max(0, (raised / goal) * 100) : 0;
  const fundedLabel = fundedPercent > 0 && fundedPercent < 0.1
    ? "<0.1"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(fundedPercent);
  const fundingLabel = checkoutReady ? "Test campaign funding" : "Demonstration campaign funding";
  const progressMax = Math.max(1, goal);
  const progressValue = Math.min(raised, progressMax);
  const remaining = Math.max(0, goal - raised);

  return (
    <section
      className={styles.giving}
      id="giving"
      aria-labelledby="fund-title"
      data-orbit-giving="v6b"
      data-fund-purpose="season-mission"
      data-campaign-donation-rail="c3"
      data-checkout-ready={checkoutReady ? "true" : "false"}
      data-orbit-design="fund-console-v8c2"
      data-orbit-revision="fund-console-v9ab"
    >
      <div className={styles.fundMeta} data-console-zone="masthead">
        <h2 className={styles.fundEyebrow} id="fund-title">
          {campaign.season} fund
        </h2>
        <div className={styles.fundOrganizer}>
          {campaign.media?.logo && <Image unoptimized src={campaign.media.logo.src} alt="" width={28} height={28} className={styles.fundLogo} />}
          <span>{campaign.organization}</span>
        </div>
      </div>

      <div className={styles.fundSnapshot} data-console-zone="performance">
        <div className={styles.fundPrimary}>
          <div>
            <span className={styles.metricLabel}>{checkoutReady ? "Test recorded · before fees" : "Demo raised"}</span>
            <strong className={styles.total} data-money>
              {money(campaign.raised)}
            </strong>
          </div>

          <div className={styles.goalBlock}>
            <span>Goal</span>
            <strong>{money(campaign.goal)}</strong>
          </div>
        </div>

        <p className={styles.fundProgressCaption}>Season fundraising progress</p>
        <progress
          max={progressMax}
          value={progressValue}
          aria-label={`${fundingLabel} progress: ${fundedLabel === "<0.1" ? "less than 0.1" : fundedLabel}% funded`}
        />

        <dl className={styles.fundStats} aria-label={`${fundingLabel} snapshot`}>
          <div>
            <dt>funded</dt>
            <dd>{fundedLabel}%</dd>
          </div>
          <div>
            <dt>{campaign.branding?.supporterLabel ?? "supporters"}</dt>
            <dd>{campaign.supporters}</dd>
          </div>
          <div>
            <dt>remaining</dt>
            <dd>{money(remaining)}</dd>
          </div>
        </dl>
      </div>

      {checkoutReady && <p className={styles.shared}>Test mode · No real money collected.</p>}
      <CampaignImpactChooser
         campaign={campaign}
         {...chooser}
         checkoutReady={checkoutReady}
         availabilityDescriptionId="checkout-availability"
         status={<CampaignGivingStatus checkoutReady={checkoutReady} />}
       />

      <details className={styles.givingDisclosure}>
        <summary>Giving details</summary>
        <div className={styles.givingAssurance} aria-label="Giving assurances">
        <span>{checkoutReady ? "Test checkout only" : "Checkout setup in progress"}</span>
        <span>{checkoutReady ? "Test record only · No donation receipt" : "Giving is not open yet"}</span>
      </div>

        <p className={styles.shared}>One-time gift · Shared season fund</p>
        {checkoutReady && <p className={styles.shared}>Recorded totals exclude refunded and open or lost dispute amounts and are before fees. They do not represent Stripe payouts.</p>}
        {!checkoutReady && <p className={styles.shared}>Campaign preview · Giving is not open yet. Explore an amount now; payments are not being accepted.</p>}
      </details>
    </section>
  );
}
