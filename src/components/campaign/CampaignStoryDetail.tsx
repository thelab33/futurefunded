import type { Campaign } from "@/domain/campaigns/types";
import Image from "next/image";
import styles from "@/components/campaign/Campaign.module.css";

export function CampaignStoryDetail({ campaign }: { campaign: Campaign }) {
  // Server-rendered CampaignPage passes only the approved public snapshot.
  const updates = campaign.community?.updates ?? [];
  const story = campaign.story;
  const photo = campaign.media?.story;

  return (
    <div className={styles.storyChapter} data-story-chapter="documentary-d11">
      <div className={styles.storyChapterFeature}>
        {photo && (
          <figure className={styles.storyChapterPhoto}>
            <Image
              unoptimized
              src={photo.src}
              alt={photo.alt}
              width={1200}
              height={1128}
              sizes="(max-width: 640px) 90vw, 380px"
            />
            {photo.credit && <figcaption>Photo: {photo.credit}</figcaption>}
          </figure>
        )}
        <div className={styles.storyChapterIntro}>
          {story?.lede && <p className={styles.storyChapterLede}>{story.lede}</p>}
          {story?.narrative && <p>{story.narrative}</p>}
          {Boolean(story?.facts.length) && (
            <dl className={styles.storyChapterFacts} aria-label="Program story facts">
              {story?.facts.map((fact) => (
                <div key={`${fact.label}:${fact.value}`}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {story?.priorities?.length ? (
        <section className={styles.storyChapterPriorities} aria-labelledby="story-priorities-title">
          <h3 id="story-priorities-title">A season built on reps, travel, and support.</h3>
          <dl>
            {story.priorities.map((priority) => (
              <div key={priority.label}>
                <dt>{priority.label}</dt>
                <dd>{priority.description}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {story?.coverage && (
        <aside className={styles.storyChapterCoverage} aria-label="Independent coverage">
          <p>{story.coverage.label}</p>
          <a href={story.coverage.articleUrl} target="_blank" rel="noreferrer">
            {story.coverage.publisher}: {story.coverage.headline}
            <span aria-hidden="true"> ↗</span>
          </a>
        </aside>
      )}

      {updates.length > 0 && (
        <section className={styles.storyChapterUpdates} aria-labelledby="record-updates-title">
          <h3 id="record-updates-title">Season updates</h3>
          <ol className={styles.chapterRecordList}>
            {updates.map((update) => (
              <li key={update.id}>
                <strong>{update.title}</strong>
                <p>{update.summary}</p>
                {update.publishedAt && (
                  <time dateTime={update.publishedAt}>
                    {new Date(update.publishedAt).toLocaleDateString("en-US", {
                      timeZone: "UTC", year: "numeric", month: "short", day: "numeric",
                    })}
                  </time>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
