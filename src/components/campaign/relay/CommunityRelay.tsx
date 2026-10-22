"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { relayLinkPresentation } from "./relay-link-presentation";
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
  const [feedback, setFeedback] = useState({ url: "", message: "" });
  const linkInput = useRef<HTMLInputElement>(null);
  const textToGive = campaign.engagement?.textToGive;
  const link = relayLinkPresentation(runtimeUrl, canonicalUrl);
  const shareText = link.kind === "published"
    ? `${campaign.headline} Support ${campaign.organization}'s ${campaign.season}.`
    : `${campaign.organization} campaign ${link.kind === "local" ? "preview" : "page"}.`;
  const available = Boolean(runtimeUrl) && link.kind !== "loading";
  const status = feedback.url === runtimeUrl && feedback.message ? feedback.message : link.status;
  const setStatus = (message: string) => setFeedback({ url: runtimeUrl, message });

  async function copyLink() {
    if (!available) return;
    try {
      await navigator.clipboard.writeText(runtimeUrl);
      setStatus(link.copied);
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setStatus("Automatic copy unavailable. The link is selected; copy it manually.");
    }
  }

  async function shareCampaign() {
    if (!available) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: campaign.organization, text: shareText, url: runtimeUrl });
        setStatus("Sharing completed or handed off to your chosen app.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setStatus("Sharing cancelled. The link is still available below.");
          return;
        }
      }
    }
    await copyLink();
  }

  return (
    <section id="relay" data-ff-relay="vr9-c9" aria-label="Campaign sharing tools" className={styles.relay}>
      <div className={`${styles.inner} ff-container`}>
        <div className={styles.copy}>
          <p className={styles.intro}>{link.intro}</p>
          <div className={styles.truthRail}>
            <span>{link.truth}</span>
            <span>{campaign.organization}</span>
            <span>{campaign.location}</span>
          </div>
        </div>

        <div className={styles.shareKit} data-motion-share-kit>
          <div className={styles.shareTopline}>
            <div>
              <strong role="status">{status}</strong>
            </div>
            <span className={styles.shareState}>{link.badge}</span>
          </div>

          <div className={styles.urlField}>
            <label htmlFor="ff-share-campaign-link">{link.label}</label>
            {link.note && <p className={styles.previewNote}>{link.note}</p>}
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
            <button type="button" className={styles.primary} onClick={shareCampaign} disabled={!available}>{link.share}</button>
            <button type="button" onClick={copyLink} disabled={!available}>Copy link</button>
          </div>

          <div className={styles.giveTools}>
            <div id="campaign-qr" className={styles.qrPanel}>
              <div className={styles.qrFrame}>
                {available ? <QRCodeSVG aria-label={`QR code: ${link.qrTitle} for ${campaign.organization}`} value={runtimeUrl} size={164} level="M" bgColor="#ffffff" fgColor="#111315" /> : null}
              </div>
              <div>
                <span className={styles.toolKicker}>{link.qrKicker}</span>
                <strong>{link.qrTitle}</strong>
                <p>{link.qrCopy}</p>
              </div>
            </div>

            {textToGive?.publicNumber?.trim() && <div className={styles.textPanel}>
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
            </div>}
          </div>
        </div>
      </div>
    </section>
  );
}
