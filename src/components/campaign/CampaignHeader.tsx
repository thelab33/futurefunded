"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {givingState,type CheckoutMode} from "@/domain/campaigns/payment-presentation";
import type { Campaign } from "@/domain/campaigns/types";
import type { CampaignChapter } from "./campaign-types";
import type { campaignMedia } from "./campaign-media";
import styles from "./CampaignHeader.module.css";

type CampaignHeaderProps = {
  campaign: Campaign;
  identity: ReturnType<typeof campaignMedia>["identity"];
  onGive: () => void;
  onChapter: (chapter: CampaignChapter) => void;
  hydrated: boolean;
  checkoutReady: boolean;
  checkoutMode?:CheckoutMode;
};

export function CampaignHeader({ campaign, identity, onGive, onChapter, hydrated, checkoutReady, checkoutMode }: CampaignHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const header = headerRef.current;
    const shell = header?.parentElement;
    if (!header || !shell) return;
    const previous = shell.style.getPropertyValue("--campaign-header-offset");
    const update = () => {
      setScrolled(window.scrollY > 12);
      const offset = getComputedStyle(header).position === "sticky" ? header.getBoundingClientRect().height + 16 : 16;
      shell.style.setProperty("--campaign-header-offset", `${offset}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(header);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (previous) shell.style.setProperty("--campaign-header-offset", previous);
      else shell.style.removeProperty("--campaign-header-offset");
    };
  }, []);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (!document.querySelector("dialog[open]") && menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  const initials = campaign.organization.trim().split(/\s+/).slice(0, 2)
    .map(word => Array.from(word)[0] ?? "").join("").toUpperCase() || "FF";
  const state=givingState(checkoutMode,checkoutReady);
  const actionLabel = state==="live"?"Give to the season":state==="test"?"Test a gift":"Support the season";

  const navigation = (mobile: boolean) => (
    <nav className={`${styles.nav} ${mobile ? styles.mobileNav : styles.desktopNav}`} aria-label="Campaign navigation">
          <a href="#giving">Campaign</a>
          <button type="button" aria-haspopup="dialog" aria-controls="campaign-detail-dialog" disabled={!hydrated} onClick={() => onChapter("squads")}>Program</button>
          <button type="button" aria-haspopup="dialog" aria-controls="campaign-detail-dialog" disabled={!hydrated} onClick={() => onChapter("partners")}>Partners</button>
          {mobile && <button className={styles.supportLink} type="button" aria-haspopup="dialog" aria-controls="campaign-detail-dialog" disabled={!hydrated} onClick={() => onChapter("support")}>Support information</button>}
        </nav>
  );

  return <header ref={headerRef} className={styles.header} data-scrolled={scrolled}>
    <div className={styles.inner}>
      <a className={styles.identity} href={`/c/${campaign.slug}`} aria-label={`${campaign.organization} campaign home`}>
        <span className={styles.mark} aria-hidden="true">
          {identity?.src ? <Image unoptimized loading="eager" src={identity.src} alt="" width={44} height={44} /> : initials}
        </span>
        <span className={styles.identityCopy}>
          <span className={styles.platformCredit}>FutureFunded <span>/ Campaigns</span></span>
          <strong>{campaign.organization}</strong>
          <small><span aria-hidden="true" />{campaign.season}{/\bseason\b/i.test(campaign.season) ? "" : " season"} · {campaign.location}</small>
        </span>
      </a>
      <button type="button" className={styles.give} data-checkout-ready={checkoutReady ? "true" : "false"}
        aria-label={actionLabel} aria-haspopup="dialog" aria-controls="campaign-detail-dialog"
        disabled={!hydrated} onClick={onGive}>
        <span className={styles.fullLabel}>{actionLabel}</span>
        <span className={styles.shortLabel}>{state==="live"?"Give":state==="test"?"Test gift":"Support"}</span>
        <span className={styles.arrow} aria-hidden="true">→</span>
      </button>
      {navigation(false)}
      <details ref={menuRef} className={styles.menu} onKeyDown={event => {
        if (event.key === "Escape" && menuRef.current?.open && !document.querySelector("dialog[open]")) {
          event.preventDefault(); menuRef.current.open = false;
          menuRef.current.querySelector("summary")?.focus();
        }
      }} onBlur={event => {
        if (!document.querySelector("dialog[open]") && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}>
        <summary className={styles.menuToggle}>Menu <span aria-hidden="true">＋</span></summary>
        {navigation(true)}
      </details>
    </div>
  </header>;
}
