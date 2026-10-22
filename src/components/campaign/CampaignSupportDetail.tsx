import type { Campaign, SupporterDeskItem } from "@/domain/campaigns/types";
import styles from "@/components/campaign/CampaignSupportDetail.module.css";

const groups: ReadonlyArray<{ category: SupporterDeskItem["category"]; heading: string; description: string }> = [
  { category: "giving", heading: "Giving & the shared fund", description: "Where contributions go and how impact amounts work." },
  { category: "trust", heading: "Confirmation & privacy", description: "Transaction records, tax status, and supporter information." },
  { category: "help", heading: "More ways to help", description: "Sponsorship, sharing, and campaign questions." },
];

export function CampaignSupportDetail({ campaign }: { campaign: Campaign }) {
  return (
    <div className={styles.supportDetail} data-wave6-support="true">
      <p className={styles.serviceNote}>
        Campaign totals are a snapshot, not confirmation of a live payment. Contributions support one shared season fund.
      </p>
      <p className={styles.supportIntro}>
        Answers for supporters of {campaign.organization}. Select any question to read its full answer.
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
        <strong>Support and policy availability</strong>
        <p>Organizer contact, privacy policy, and campaign terms are awaiting published links. No direct contact or policy link is available here yet.</p>
        <p>For your security, do not send card or bank details through messages or social posts.</p>
      </aside>
    </div>
  );
}
