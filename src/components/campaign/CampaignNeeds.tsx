import Image from "next/image";
import type { Campaign } from "@/domain/campaigns/types";
import styles from "@/components/campaign/Campaign.module.css";

/** Three visible needs; the remaining priorities are available on request. */
export function CampaignNeeds({ campaign, onGive }: {
  campaign: Campaign;
  onGive: () => void;
}) {
  const mission = campaign.seasonMission;
  const primary = mission?.priorities.slice(0, 3) ?? [];
  const supporting = mission?.priorities.slice(3) ?? [];
  return (
    <section className={styles.programWing} aria-labelledby="program-title" data-orbit-program="season-mission">
      <div className={styles.programCopy}>
        <p className={styles.needsEyebrow}>What keeps the season possible</p>
        <h2 id="program-title">{mission?.title ?? "What your support makes possible"}</h2>
        <p>{mission?.summary ?? campaign.story?.programSummary ?? campaign.story?.narrative}</p>
      </div>
      {primary.length > 0 && (
        <div className={styles.priorities} role="group" aria-label="Primary season needs">
          {primary.map((priority) => (
            <details key={priority.id} className={styles.priority} data-season-priority={priority.id} data-season-priority-tier="primary">
              <summary>
                {priority.image && <span className={styles.photo}>
                  <Image unoptimized loading="eager" src={priority.image.src} alt="" fill sizes="(min-width: 768px) and (max-width: 1215px) 30vw, (max-width: 767px) 28vw, 120px" style={priority.image.objectPosition ? { objectPosition: priority.image.objectPosition } : undefined} />
                </span>}
                <span className={styles.label}>
                  <strong>{priority.title}</strong>
                </span>
                <span className={styles.toggle} aria-hidden="true"><span className={styles.togglePlus}>+</span><span className={styles.toggleMinus}>−</span></span>
              </summary>
              <div className={styles.detail}>
                <p className={styles.needSummary}>{priority.summary}</p>
                <p>{priority.detail}</p>
                <button type="button" className={styles.supportPriority} onClick={onGive} aria-haspopup="dialog" aria-controls="campaign-detail-dialog">Support the shared season <span aria-hidden="true">→</span></button>
                <p className={styles.fundNote}>Exploring a priority does not restrict your donation. Gifts support the entire program, not a restricted line item.</p>
              </div>
            </details>
          ))}
        </div>
      )}
      {supporting.length > 0 && (
        <details className={styles.supporting}>
          <summary>Also supports uniforms, equipment, meals, and participation assistance <span aria-hidden="true">+</span></summary>
          <div className={styles.supportingList}>
            {supporting.map((priority) => (
              <div key={priority.id} data-season-priority={priority.id} data-season-priority-tier="supporting">
                <strong>{priority.title}</strong>
                <p>{priority.summary} {priority.detail}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
