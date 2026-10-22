"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Campaign } from "@/domain/campaigns/types";
import { relayLinkPresentation } from "./relay/relay-link-presentation";
import styles from "./CampaignShare.module.css";

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function currentCampaignUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function CampaignShare({ campaign, canonicalUrl, onShare, onNewsletter }: {
  campaign: Campaign;
  canonicalUrl: string | null;
  onShare: () => void;
  onNewsletter: () => void;
}) {
  const url = useSyncExternalStore(
    subscribeToLocation,
    () => canonicalUrl ?? currentCampaignUrl(),
    () => canonicalUrl ?? "",
  );
  const [feedback, setFeedback] = useState({ url: "", message: "" });
  const input = useRef<HTMLInputElement>(null);
  const link = relayLinkPresentation(url, canonicalUrl);
  const available = Boolean(url) && link.kind !== "loading";
  const message = feedback.url === url ? feedback.message : "";
  const updatesEnabled = Boolean(campaign.engagement?.newsletter?.enabled);
  const textNumberPublished = Boolean(campaign.engagement?.textToGive?.publicNumber);
  const qrCaption = link.kind === "local" ? "Preview QR" : link.kind === "loading" ? "Preparing QR" : "Scan to open";

  async function copyLink() {
    if (!available) return;
    try {
      await navigator.clipboard.writeText(url);
      setFeedback({ url, message: `${link.copied}.` });
    } catch {
      input.current?.focus();
      input.current?.select();
      setFeedback({ url, message: "Link selected. Copy it manually." });
    }
  }

  return (
    <section className={styles.shareRail} aria-labelledby="campaign-share-title" data-orbit-share-rail="v9" data-community-relay="v1-8">
      <div className={styles.shareInner} data-updates={updatesEnabled ? "true" : "false"}>
        <div className={styles.shareIntro}>
          <div className={styles.shareIntroCopy}>
            <span className={styles.shareKicker}>Community relay</span>
            <h2 id="campaign-share-title">Help spread the word.</h2>
          </div>
          <div className={styles.shareQr}>
            {available ? <QRCodeSVG value={url} size={92} level="M" bgColor="#ffffff" fgColor="#1d211b" role="img" aria-label={`QR code: ${link.qrTitle} for ${campaign.organization}`} /> : <span className={styles.qrPlaceholder} aria-hidden="true" />}
            <span>{qrCaption}</span>
          </div>
        </div>
        <div className={styles.shareTools}>
          <label htmlFor="campaign-share-rail-link">{link.label}</label>
          {link.note && <span className={styles.sharePreviewNote} id="campaign-relay-link-note">{link.note}</span>}
          <div className={styles.shareLinkLine}>
            <input id="campaign-share-rail-link" ref={input} readOnly aria-describedby={link.note ? "campaign-relay-link-note" : undefined} value={url} placeholder="Loading campaign link…" onFocus={(event) => event.currentTarget.select()} />
            <button type="button" className={styles.shareCopy} onClick={copyLink} disabled={!available}>Copy link</button>
          </div>
          <div className={styles.toolFooter}>
            <button type="button" className={styles.shareShare} onClick={onShare} aria-haspopup="dialog" aria-controls="campaign-detail-dialog">Share options <span aria-hidden="true">→</span></button>
            <div className={styles.relaySmsStatus}>
              <strong>Text to Give</strong>
              <span className={styles.relaySmsPending}>{textNumberPublished ? "Number published" : "Not yet active"}</span>
            </div>
          </div>
          <span className={styles.shareStatus} role="status">{message}</span>
        </div>
        {updatesEnabled ? (
          <div className={styles.seasonUpdatesInvite}>
            <div>
              <strong>Stay close to the season.</strong>
              <p>Milestones, tournament news, and ways to help.</p>
            </div>
            <button type="button" onClick={onNewsletter} aria-haspopup="dialog" aria-controls="newsletter-updates-dialog">Get season updates <span aria-hidden="true">→</span></button>
          </div>
        ) : null}

      </div>
    </section>
  );
}
