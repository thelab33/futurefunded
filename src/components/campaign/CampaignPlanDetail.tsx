import type { Campaign } from "@/domain/campaigns/types";
import styles from "@/components/campaign/Campaign.module.css";
import { formatCampaignMoney as money } from "@/components/campaign/campaign-format";

export function CampaignPlanDetail({ campaign }: { campaign: Campaign }) {
  const plan = campaign.seasonPlan;
  const remaining = Math.max(0, campaign.goal - campaign.raised);

  return <div className={styles.recordPlan} data-campaign-plan="season-record">
    <p className={styles.recordLede}>One shared fund keeps practices, competition, travel, meals, gear, and participation support within reach.</p>
    <div className={styles.recordPlanSnapshot} aria-label="Season fund goal">
      <div><span>Season goal</span><strong>{money(campaign.goal)}</strong></div>
      {process.env.NODE_ENV !== "production" && <div><span>Remaining toward goal</span><strong>{money(remaining)}</strong></div>}
    </div>
    {plan ? <>
      <h3>Where the season fund is planned to go</h3>
      <p className={styles.recordPlanStatus}>{plan.status === "proposed"
        ? "Proposed allocations · Planning priorities, not spending to date. Amounts below are based on the full season goal."
        : "Approved allocations · Amounts below are based on the full season goal. Actual expenses may change as the season unfolds."}</p>
      <dl className={styles.recordPlanRows} aria-label="Season planning allocations">{plan.allocations.map((item) => <div key={item.label}>
        <dt>{item.label}</dt>
        <dd><strong>{item.percent}%</strong><span>{money(Math.round(campaign.goal * item.percent / 100))} planned</span></dd>
        <span className={styles.recordPlanTrack} aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(item.percent, 100))}%` }} /></span>
      </div>)}</dl>
      {plan.updatedAt && <p className={styles.recordPlanUpdated}>Plan updated <time dateTime={plan.updatedAt}>{plan.updatedAt}</time></p>}
    </> : <p>Detailed allocations have not been published. Contributions still support the shared season fund.</p>}
    <p className={styles.recordPlanFoot}>Contributions support the entire program through the shared season fund; categories are planning priorities, not restricted donation accounts.</p>
  </div>;
}
