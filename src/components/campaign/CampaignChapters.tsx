"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import type { Campaign } from "@/domain/campaigns/types";
import type { CampaignChapter } from "@/components/campaign/campaign-types";
import type { campaignMedia } from "@/components/campaign/campaign-media";
import { formatCampaignMoney as money } from "@/components/campaign/campaign-format";
import styles from "@/components/campaign/Campaign.module.css";
import finish from "./CampaignChaptersFinish.module.css";

const chapters = [
  { id: "story", title: "Our story", text: "Basketball is the bridge.", detail: "" },
  { id: "plan", title: "Season plan", text: "The $20,000 season plan.", detail: "Gym · Travel · Meals · Gear · Program needs" },
  { id: "squads", title: "The athletes", text: "One program. Shared opportunity.", detail: "One shared fund." },
  { id: "partners", title: "Partners", text: "Season Partner — $1,500", detail: "Community Partner — $750\nSupporting Sponsor — $300" },
  { id: "share", title: "Share the campaign", text: "Bring more people into the season.", detail: "Official link · QR code" },
  { id: "support", title: "Campaign support", text: "Shared fund · Confirmation", detail: "Tax status · Privacy · Sponsor help" },
] as const;

type CampaignChaptersProps = {
  campaign: Campaign;
  media: ReturnType<typeof campaignMedia>;
  onChapter: (chapter: CampaignChapter) => void;
};

export function CampaignChapters({
  campaign,
  media,
  onChapter,
}: CampaignChaptersProps) {
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function moveTo(index: number) {
    const next = Math.max(0, Math.min(chapters.length - 1, index));
    const container = rail.current;
    const target = container?.children.item(next) as HTMLElement | null;
    if (!container || !target) return;
    container.scrollTo({ left: target.offsetLeft - (container.firstElementChild as HTMLElement).offsetLeft, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setActive(next);
  }

  function trackPosition() {
    const container = rail.current;
    if (!container) return;
    const nodes = Array.from(container.children) as HTMLElement[];
    const nearest = nodes.reduce((best, node, index) => {
      const distance = Math.abs(node.offsetLeft - nodes[0].offsetLeft - container.scrollLeft);
      return distance < best.distance ? { index, distance } : best;
    }, { index: 0, distance: Number.POSITIVE_INFINITY });
    setActive(nearest.index);
  }

  return (
    <section
      className={`${styles.chapterExhibition} ${finish.gallery}`}
      aria-labelledby="exhibition-title"
      data-orbit-restoration="v6c3-framed-chapters"
    >
      <div className={styles.chapterExhibitionBar}>
        <div className={styles.chapterExhibitionHeading}>
          <h2 className={styles.chapterExhibitionTitle} id="exhibition-title">Explore the campaign</h2>
        </div>
        <div className={styles.chapterRailControls} role="group" aria-label="Campaign chapter navigation">
          <button type="button" onClick={() => moveTo(active - 1)} disabled={active === 0} aria-label="Previous campaign chapter" aria-controls="campaign-chapter-rail">←</button>
          <span className={styles.chapterRailCount} aria-live="polite" aria-atomic="true">{chapters[active].title}</span>
          <button type="button" onClick={() => moveTo(active + 1)} disabled={active === chapters.length - 1} aria-label="Next campaign chapter" aria-controls="campaign-chapter-rail">→</button>
        </div>
      </div>
      <p className={styles.chapterExhibitionHint} aria-hidden="true">Swipe to explore all chapters <span>→</span></p>
      <div className={styles.chapterExhibitRow} data-campaign-chapter-rail="true" data-orbit-exhibits="v6d" id="campaign-chapter-rail" ref={rail} onScroll={trackPosition}>
        {chapters.map((c) => {
          const chapterImage = media.chapters[c.id];

          return (
            <button
              type="button"
              className={styles.chapterExhibit}
              data-orbit-exhibit={c.id}
              key={c.id}
              onClick={() => onChapter(c.id)}
              aria-label={`Open ${c.title} chapter: ${c.text}`}
              aria-haspopup="dialog"
              aria-controls="campaign-detail-dialog"
            >
              <span className={styles.chapterFrame} data-campaign-chapter-frame="true">
                <span className={`${styles.chapterPhoto} ${finish.photo}`} aria-hidden="true">
                {chapterImage && (
                  <Image
                    unoptimized
                    src={chapterImage.src}
                    alt=""
                    fill
                    loading="eager"
                    sizes="(max-width: 640px) 78vw, (max-width: 1024px) 46vw, 18vw"
                    style={
                      chapterImage.objectPosition
                        ? { objectPosition: chapterImage.objectPosition }
                        : undefined
                    }
                  />
                )}
                </span>
                <span className={styles.chapterExhibitTop} data-campaign-chapter-title="true">
                  <strong>{c.title}</strong>
                </span>
                <span className={styles.chapterExhibitBottom} data-campaign-chapter-copy="true">
                  {c.id === "partners" ? (
                    <span className={styles.chapterPartnerLines}>
                      {campaign.sponsorship?.tiers.map((tier) => (
                        <span key={tier.slug}>
                          <span>{tier.name}</span>
                          <b>{money(tier.price)}</b>
                        </span>
                      ))}
                    </span>
                  ) : c.id === "support" ? (
                    <span className={styles.chapterSupportLines}>
                      {["Shared fund", "Confirmation", "Tax status", "Privacy", "Sponsor help"].map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </span>
                  ) : (
                    <>
                      <b>
                        {c.id === "plan"
                          ? `The ${money(campaign.goal)} season plan.`
                          : c.id === "squads"
                            ? c.text
                            : c.text}
                      </b>
                      {c.detail && <small>{c.detail}</small>}
                    </>
                  )}
                  {c.id === "partners" && (
                    <small className={styles.chapterPartnerAction}>Explore partnerships</small>
                  )}
                </span>
                <span className={`${styles.chapterArrow} ${finish.arrow}`} aria-hidden="true">
                  <span className={styles.chapterArrowGlyph}>→</span>
                </span>

              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
