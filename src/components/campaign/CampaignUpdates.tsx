import type { Campaign } from "@/domain/campaigns/types";
import styles from "@/components/campaign/Campaign.module.css";

type Props = { campaign: Campaign; onShare: () => void };

/** The public campaign receives a server-filtered projection with drafts removed. */
export function CampaignUpdates({ campaign, onShare }: Props) {
  const updates = campaign.community?.updates ?? [];
  if (updates.length === 0) return null;
  const [latest, ...older] = updates;
  return (
    <section className={styles.updatesSection} aria-labelledby="season-journal-title" data-season-journal="published">
      <div className={styles.updatesHeading}>
        <p>From the court</p>
        <h2 id="season-journal-title">The season journal.</h2>
      </div>
      <article className={styles.updatesFeature} data-dispatch-id={latest.id}>
        <time dateTime={latest.publishedAt}>{new Date(latest.publishedAt!).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</time>
        <h3>{latest.title}</h3>
        <p>{latest.summary}</p>
      </article>
      {older.length > 0 && (
        <details className={styles.updatesOlder}>
          <summary>Read {older.length} earlier {older.length === 1 ? "update" : "updates"}</summary>
          <ol>{older.map((update) => <li key={update.id} data-dispatch-id={update.id}><time dateTime={update.publishedAt}>{new Date(update.publishedAt!).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</time><strong>{update.title}</strong><p>{update.summary}</p></li>)}</ol>
        </details>
      )}
      <button type="button" onClick={onShare} aria-haspopup="dialog" aria-controls="campaign-detail-dialog" className={styles.updatesShare}>Share this campaign <span aria-hidden="true">↗</span></button>
    </section>
  );
}
