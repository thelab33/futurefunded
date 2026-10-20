"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Campaign } from "@/domain/campaigns/types";
import styles from "@/components/campaign/relay/CommunityRelay.module.css";

function subscribeToLocation(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener("hashchange", onStoreChange);

  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener("hashchange", onStoreChange);
  };
}

function currentCampaignUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
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

function smsHref(number: string, keyword: string) {
  const normalized = number.replace(/[^+\d]/g, "");
  return `sms:${normalized}?&body=${encodeURIComponent(keyword)}`;
}

export function CommunityRelay({ campaign, canonicalUrl }: { campaign: Campaign; canonicalUrl: string | null }) {
  const runtimeUrl = useSyncExternalStore(
    subscribeToLocation,
    () => canonicalUrl ?? currentCampaignUrl(),
    () => canonicalUrl ?? "",
  );
  const [status, setStatus] = useState("Ready to share");
  const linkInput = useRef<HTMLInputElement>(null);
  const textToGive = campaign.engagement?.textToGive;
  const shareText = `${campaign.headline} Support ${campaign.organization}'s ${campaign.season}.`;
  const preview = isLocalPreview(runtimeUrl, canonicalUrl);

  async function copyLink() {
    if (!runtimeUrl) return;
    try {
      await navigator.clipboard.writeText(runtimeUrl);
      setStatus("Campaign link copied");
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setStatus("Automatic copy unavailable. The campaign link is selected; copy it manually.");
    }
  }

  async function shareCampaign() {
    if (!runtimeUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: campaign.organization, text: shareText, url: runtimeUrl });
        setStatus("Sharing completed or handed off to your chosen app.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setStatus("Sharing cancelled. The campaign link is still available below.");
          return;
        }
      }
    }
    await copyLink();
  }

  return (
    <section id="relay" data-ff-relay="vr9-c9" aria-labelledby="relay-title" className={styles.relay}>
      <div className={`${styles.inner} ff-container`}>
        <div className={styles.copy}>
          <p className="ff-kicker ff-kicker--ember">Community relay</p>
          <h2 id="relay-title">Put the season in the right hands.</h2>
          <p>Share the official campaign with people who can give, sponsor, or open the right door.</p>
          <div className={styles.truthRail}>
            <span>Official campaign</span>
            <span>{campaign.organization}</span>
            <span>{campaign.location}</span>
          </div>
        </div>

        <div className={styles.shareKit} data-motion-share-kit>
          <div className={styles.shareTopline}>
            <div>
              <span>Campaign link</span>
              <strong role="status">{status}</strong>
            </div>
            <span className={styles.shareState}>{preview ? "Local preview" : canonicalUrl ? "Canonical" : "Current page"}</span>
          </div>

          <div className={styles.urlField}>
            <label htmlFor="ff-share-campaign-link">{preview ? "Local preview link" : "Official campaign link"}</label>
            {preview && <p className={styles.previewNote}>Local-only preview. This link and QR code work on this device; share a public link after publishing.</p>}
            <input
              id="ff-share-campaign-link"
              ref={linkInput}
              type="text"
              readOnly
              value={runtimeUrl}
              placeholder="Loading campaign link…"
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={shareCampaign} disabled={!runtimeUrl}>Share the season</button>
            <button type="button" onClick={copyLink} disabled={!runtimeUrl}>Copy link</button>
          </div>

          <div className={styles.giveTools}>
            <div id="campaign-qr" className={styles.qrPanel}>
              <div className={styles.qrFrame}>
                {runtimeUrl ? <QRCodeSVG aria-label={preview ? `QR code: open the local ${campaign.organization} campaign preview` : `QR code: open the official ${campaign.organization} campaign`} value={runtimeUrl} size={164} level="M" bgColor="#ffffff" fgColor="#111315" /> : null}
              </div>
              <div>
                <span className={styles.toolKicker}>{preview ? "Preview QR" : "Scan to give"}</span>
                <strong>{preview ? "Open this local preview" : "Open the official campaign"}</strong>
                <p>{preview ? "Scan to open the link above on this device." : "This QR code always resolves to the same public campaign link shown above."}</p>
              </div>
            </div>

            <div className={styles.textPanel}>
              <span className={styles.toolKicker}>Text to give</span>
              {textToGive?.publicNumber ? (
                <>
                  <strong>Text {textToGive.keyword} to {textToGive.publicNumber}</strong>
                  <p>{textToGive.replyCopy} This action starts a one-to-one response; it does not enroll the supporter in recurring texts.</p>
                  <a className={styles.textAction} href={smsHref(textToGive.publicNumber, textToGive.keyword)}>Open messages</a>
                </>
              ) : (
                <p className={styles.pending}>Messaging connection pending. Text-to-give will be available after the program number is verified.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
