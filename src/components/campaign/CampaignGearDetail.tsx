import type { Campaign } from "@/domain/campaigns/types";
import styles from "@/components/campaign/Campaign.module.css";

export function CampaignGearDetail({ campaign }: { campaign: Campaign }) {
    return <>
      <p>The official gear collection is in preparation.</p>
      <p>{campaign.commerce?.fulfillmentNote}</p>
      <ul className={styles.recordList}>{campaign.gear.map((item) => <li key={item.slug}>
        <strong>{item.name}</strong><p>{item.description}</p>
      </li>)}</ul>
      {campaign.commerce?.storefrontUrl && campaign.capabilities.commerce
                ? <a href={campaign.commerce.storefrontUrl}>Open the official collection <span aria-hidden="true">↗</span></a>
                : <p className={styles.serviceNote}>Purchasing is unavailable until the official store and fulfillment are connected.</p>}
    </>;
}
