import type {PublicGivingDetails} from "@/domain/campaigns/payment-presentation";
import type { Campaign, SupporterDeskItem } from "@/domain/campaigns/types";
import styles from "@/components/campaign/CampaignSupportDetail.module.css";

const groups: ReadonlyArray<{ category: SupporterDeskItem["category"]; heading: string; description: string }> = [
  { category: "giving", heading: "Giving & the shared fund", description: "How gifts support the season." },
  { category: "trust", heading: "Confirmation & privacy", description: "Transaction records, tax status, and supporter information." },
  { category: "help", heading: "More ways to help", description: "Sponsorship, sharing, and campaign questions." },
];

export function CampaignSupportDetail({ campaign, givingDetails }: { campaign: Campaign;givingDetails?:PublicGivingDetails|null }) {
  return (
    <div className={styles.supportDetail} data-wave6-support="true">
      <p className={styles.serviceNote}>
        One season fund supports the program’s shared needs.
      </p>
      <p className={styles.supportIntro}>
        Questions about supporting {campaign.organization}? Start here.
      </p>
      {groups.map(({ category, heading, description }) => {
        const items = campaign.supporterDesk.filter((item) => item.category === category);
        if (items.length === 0) return null;
        const headingId = `campaign-support-${category}-title`;
        return (
          <section key={category} className={styles.supportGroup} aria-labelledby={headingId}>
            <div className={styles.supportGroupHeader}>
              <h3 id={headingId}>{heading}</h3>
              <p>{description}</p>
            </div>
            <div className={styles.answers}>
              {items.map((item) => (
                <details key={item.slug}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        );
      })}
      <aside className={styles.supportAvailability} aria-label="Published support availability">
        <strong>Contact & policies</strong>
        {!givingDetails && campaign.slug === "connect-atx-elite" && (
          <p>Campaign prepared by Angel · Ninth-grade coach.</p>
        )}
        {givingDetails?<><p>Recipient: {givingDetails.recipientName}</p><p><a href={`mailto:${givingDetails.supportEmail}`}>Contact the organizer</a></p><p><a href={givingDetails.privacyUrl}>Privacy policy</a>{" · "}<a href={givingDetails.termsUrl}>Campaign terms</a></p></>:<p>Organizer contact details, the privacy policy, and campaign terms have not been published here yet.</p>}
        <p>Keep card and bank details out of messages and social posts.</p>
      </aside>
    </div>
  );
}
