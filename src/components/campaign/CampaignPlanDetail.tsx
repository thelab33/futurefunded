import type { Campaign } from "@/domain/campaigns/types";
import finish from "./CampaignDialogFinish.module.css";
import { formatCampaignMoney as money } from "@/components/campaign/campaign-format";

export function CampaignPlanDetail({ campaign }: { campaign: Campaign }) {
  const plan = campaign.seasonPlan;
  const remaining = Math.max(0, campaign.goal - campaign.raised);
  return <div className={finish.plan} data-campaign-plan="season-record">
    <p className={finish.lede}>One fund supports practice, competition, travel, meals, gear, and participation across the program.</p>
    <div className={finish.goal} aria-label="Season fund goal">
      <div><span>Season goal</span><strong>{money(campaign.goal)}</strong></div>
      {process.env.NODE_ENV !== "production" && <div><span>Remaining toward goal</span><strong>{money(remaining)}</strong></div>}
    </div>
    {plan ? <>
      <h3 id="season-allocation-title">Where your support goes</h3>
      <p className={finish.planStatus} id="season-allocation-note">{plan.status === "proposed"
        ? "Proposed allocation of the full season goal. These are planning priorities, not spending to date."
        : "Approved allocation of the full season goal. Actual expenses may change during the season."}</p>
      <table className={finish.budget} aria-labelledby="season-allocation-title" aria-describedby="season-allocation-note">
        <thead><tr><th scope="col">Season need</th><th scope="col">Share</th><th scope="col">Planned</th></tr></thead>
        <tbody>{plan.allocations.map((item) => <tr key={item.label}>
          <th scope="row"><span>{item.label}</span><span className={finish.track} aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(item.percent, 100))}%` }} /></span></th>
          <td>{item.percent}%</td>
          <td>{money(Math.round(campaign.goal * item.percent / 100))}</td>
        </tr>)}</tbody>
      </table>
      {plan.updatedAt && <p className={finish.planStatus}>Plan updated <time dateTime={plan.updatedAt}>{plan.updatedAt}</time></p>}
    </> : <p>Detailed allocations have not been published. Contributions support the shared season fund.</p>}
    <p className={finish.footnote}>All gifts support the shared season fund. These categories describe planned needs, rather than separate donation accounts.</p>
  </div>;
}
