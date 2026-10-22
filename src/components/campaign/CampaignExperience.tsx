"use client";
import { CampaignFooter } from "@/components/campaign/CampaignFooter";
import { CampaignChapters } from "@/components/campaign/CampaignChapters";
import { CampaignUpdates } from "@/components/campaign/CampaignUpdates";
import { CampaignNeeds } from "@/components/campaign/CampaignNeeds";
import { CampaignGiving } from "@/components/campaign/CampaignGiving";
import { CampaignStory } from "@/components/campaign/CampaignStory";
import { useRef, useState, useSyncExternalStore } from "react";
import type { Campaign } from "@/domain/campaigns/types";
import type { CampaignPresentationV1 } from "@/domain/campaigns/presentation-contract";
import type { CampaignChapter } from "@/components/campaign/campaign-types";
import { CampaignDialog } from "@/components/campaign/CampaignDialog";
import styles from "@/components/campaign/Campaign.module.css";
import { campaignMedia } from "@/components/campaign/campaign-media";
import { CampaignHero } from "@/components/campaign/CampaignHero";
import { CampaignHeader } from "@/components/campaign/CampaignHeader";
import { CampaignLayout } from "@/components/campaign/CampaignLayout";
import { CampaignShare } from "@/components/campaign/CampaignShare";
import { NewsletterPopup } from "@/components/campaign/newsletter/NewsletterPopup";
// Stable server/client snapshots: controls remain disabled in SSR markup and
// during hydration, then become enabled after React takes control.
const subscribeHydration = () => () => {};
const getClientHydration = () => true;
const getServerHydration = () => false;
type Chapter = CampaignChapter;
export function CampaignExperience({ campaign, presentation, returned, cancelled, newsletterConfigured }: {
    campaign: Campaign;
    presentation: CampaignPresentationV1;
    returned: boolean;
    cancelled: boolean;
    newsletterConfigured: boolean;
}) {
    const media = campaignMedia(campaign);
    const { checkoutReady, purposes } = presentation.giving;
    const canonicalUrl = presentation.publicUrl;
    const [amount, setAmount] = useState(presentation.giving.impact.find(i => i.recommended)?.amount ?? 150);
    const [custom, setCustom] = useState("");
    const [error, setError] = useState("");
    const [chapter, setChapter] = useState<Chapter>("story");
    const [newsletterRequest, requestNewsletter] = useState(0);
    const hydrated = useSyncExternalStore(subscribeHydration, getClientHydration, getServerHydration);
    const dialog = useRef<HTMLDialogElement>(null);
    const customInput = useRef<HTMLInputElement>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    function open(id: Chapter) {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setChapter(id);
        window.requestAnimationFrame(() => {
            const campaignDialog = dialog.current;
            if (!campaignDialog || campaignDialog.open) return;
            campaignDialog.showModal();
            campaignDialog.scrollTop = 0;
            campaignDialog.querySelector<HTMLElement>("[data-dialog-title]")?.focus({ preventScroll: true });
        });
    }
    function close() { dialog.current?.close(); }
    function selectPreset(value: number) { setAmount(value); setCustom(""); setError(""); }
    function changeCustom(value: string) { setCustom(value); setError(""); }
    function continueGift() {
        if (custom.trim()) {
            if (!/^\d{1,6}(\.\d{1,2})?$/.test(custom.trim()) || Number(custom) < 1) {
                setError("Enter a gift of at least $1, with up to two decimal places.");
                customInput.current?.focus();
                return;
            }
            setAmount(Number(custom));
        }
        setError("");
        open("give");
    }
    const titles: Record<Chapter, string> = { story: "Basketball is the bridge.", plan: "The $20,000 season plan", squads: "The athletes. The opportunity.", partners: "Partner with the season", share: "Share the campaign", support: "Campaign support", give: "Your gift. Their season.", gear: "Official gear" };
    return (
      <CampaignLayout
        branding={campaign.branding}
        header={
          <CampaignHeader
            campaign={campaign}
            identity={media.identity}
            onGive={continueGift}
            onChapter={open}
            hydrated={hydrated}
            checkoutReady={checkoutReady}
          />
        }
        hero={<CampaignHero campaign={campaign} media={media} />}
        notice={
          (returned || cancelled) ? (
            <p role="status" className={styles.returnNotice}>
              {returned
                ? "You returned from checkout. Payment confirmation is pending; this page does not prove payment."
                : "You left checkout. No payment status is confirmed here."}
            </p>
          ) : undefined
        }
        giving={
          <CampaignGiving
            campaign={campaign}
            checkoutReady={checkoutReady}
            amount={amount}
            custom={custom}
            error={error}
            customInput={customInput}
            onPreset={selectPreset}
            onCustom={changeCustom}
            onGive={continueGift}
          />
        }
        story={<CampaignStory campaign={campaign} media={media} />}
        program={<CampaignNeeds campaign={campaign} onGive={continueGift} />}
        momentum={<CampaignUpdates campaign={campaign} onShare={() => open("share")} />}
        chapters={<CampaignChapters campaign={campaign} media={media} onChapter={open} />}
        share={<CampaignShare campaign={campaign} canonicalUrl={canonicalUrl} onShare={() => open("share")} onNewsletter={() => requestNewsletter(n => n + 1)} />}
        footer={
          <CampaignFooter
            campaign={campaign}
            checkoutReady={checkoutReady}
            onChapter={open}
          />
        }
        dialog={
          <>
          <CampaignDialog
            campaign={campaign}
            chapter={chapter}
            title={titles[chapter]}
            dialogRef={dialog}
            returnFocus={returnFocus}
            onBack={close}
            amount={amount}
            custom={custom}
            purposes={purposes.map(p => ({ id: p.id, amountCents: p.amountCents }))}
            checkoutReady={checkoutReady}
            canonicalUrl={canonicalUrl}
          />
          <NewsletterPopup campaign={campaign} configured={newsletterConfigured} openRequest={newsletterRequest} />
          </>
        }
      />
    );
}
