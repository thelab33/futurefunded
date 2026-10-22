"use client";
import { useEffect, useRef, type ReactNode } from "react";
import type { CampaignBranding } from "@/domain/campaigns/types";
import { resolveCampaignBranding } from "@/components/campaign/campaign-branding";
import styles from "@/components/campaign/Campaign.module.css";
import finish from "./CampaignPanelsFinish.module.css";

type Props = {
  branding?: CampaignBranding;
  header: ReactNode;
  hero: ReactNode;
  notice?: ReactNode;
  giving: ReactNode;
  story: ReactNode;
  program: ReactNode;
  momentum?: ReactNode;
  chapters: ReactNode;
  share: ReactNode;
  footer: ReactNode;
  dialog: ReactNode;
};

/** Accepted public campaign composition, isolated from Organizer Studio. */
export function CampaignLayout({branding,header,hero,notice,giving,story,program,momentum,chapters,share,footer,dialog}: Props) {
  const brand = resolveCampaignBranding(branding);
  const shellRef = useRef<HTMLDivElement>(null);
  const textProbeRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const shell = shellRef.current;
    const probe = textProbeRef.current;
    if (!shell || !probe) return;
    const update = () => {
      const em = probe.getBoundingClientRect().width;
      const ratio = em > 0 ? shell.clientWidth / em : Infinity;
      if (ratio <= 60) shell.dataset.textReflow = "true";
      else delete shell.dataset.textReflow;
    };
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    observer.observe(probe);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return <div ref={shellRef} style={brand.style} data-brand-surface={brand.surface} data-campaign-typography={branding?.typography ?? "editorial"} data-campaign-theme={brand.surface === "dark" ? "dark" : undefined} className={`${styles.root}`} data-cleanroom-layout="c2" data-orbit-shell="c2" data-campaign-shell="c2">
    <span ref={textProbeRef} className={styles.textScaleProbe} aria-hidden="true" />
    <a className="ff-skip-link" href="#campaign-main">Skip to campaign</a>
    {header}
    <main id="campaign-main" tabIndex={-1} className={styles.main}>
      {hero}
      {notice}
      <div className={`${styles.composition} ${finish.panels}`} data-cleanroom-composition="true" data-campaign-assembly="c2">
        <div className={styles.givingRail} data-orbit-region="giving">{giving}</div>
        <div className={styles.story} data-orbit-region="story">{story}</div>
        <div className={styles.program} data-orbit-region="program">{program}</div>
      </div>
      {momentum}{chapters}{share}
    </main>
    {footer}{dialog}
  </div>;
}
