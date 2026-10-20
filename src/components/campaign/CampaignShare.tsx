"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Campaign } from "@/domain/campaigns/types";
import styles from "@/components/campaign/Campaign.module.css";

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

function isLocalPreview(url: string, canonicalUrl: string | null) {
  if (!url || canonicalUrl) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
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
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const preview = isLocalPreview(url, canonicalUrl);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Campaign link copied.");
    } catch {
      input.current?.focus();
      input.current?.select();
      setMessage("Link selected. Copy it manually.");
    }
  }

  return (
    <section className={styles.shareRail} aria-labelledby="campaign-share-title" data-orbit-share-rail="v9">
      <div className={styles.shareInner}>
        <div className={styles.shareIntro}>
          <div className={styles.shareIntroCopy}>
            <span className={styles.shareKicker}>Community relay</span>
            <h2 id="campaign-share-title">Help spread the word.</h2>
          </div>
          <div className={styles.shareQr}>
            {url ? <QRCodeSVG value={url} size={92} level="M" bgColor="#ffffff" fgColor="#1d211b" role="img" aria-label={preview ? `QR code for the local ${campaign.organization} campaign preview` : `QR code for the official ${campaign.organization} campaign`} /> : null}
            <span>Scan QR code</span>
          </div>
        </div>
        <div className={styles.shareTools}>
          <label htmlFor="campaign-share-rail-link">{preview ? "Local preview link" : "Official campaign link"}</label>
          {preview && <span className={styles.sharePreviewNote}>Local preview · This link and QR code open on this device only.</span>}
          <div className={styles.shareLinkLine}>
            <input id="campaign-share-rail-link" ref={input} readOnly value={url} placeholder="Loading campaign link…" onFocus={(event) => event.currentTarget.select()} />
            <div className={styles.shareActions}>
              <button type="button" className={styles.shareShare} onClick={onShare} aria-haspopup="dialog" aria-controls="campaign-detail-dialog">Share options <span aria-hidden="true">→</span></button>
              <button type="button" className={styles.shareCopy} onClick={copyLink} disabled={!url}>Copy link</button>
            </div>
          </div>
          <span className={styles.shareStatus} role="status">{message}</span>
          <div className={styles.relaySmsStatus}>
            <strong>Text to Give</strong>
            <span className={styles.relaySmsPending}>Not yet active</span>
          </div>
        </div>
        {campaign.engagement?.newsletter?.enabled ? (
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
