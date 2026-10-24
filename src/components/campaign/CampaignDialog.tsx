import type { RefObject } from "react";
import type { RecordProps } from "@/components/campaign/campaign-types";
import { CampaignRecord } from "@/components/campaign/CampaignRecord";
import styles from "@/components/campaign/Campaign.module.css";
import finish from "./CampaignDialogFinish.module.css";
import giftStyles from "@/components/campaign/checkout/CampaignCheckout.module.css";

type Props = RecordProps & {
  title: string;
  dialogRef: RefObject<HTMLDialogElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
};

export function CampaignDialog({
  campaign,
  chapter,
  title,
  dialogRef,
  returnFocus: returnFocusRef,
  onBack,
  amount,
  custom,
  purposes,
  checkoutReady,
  canonicalUrl,
}: Props) {
  function restoreFocus() {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) target.focus();
  }

  return (
    <dialog
      id="campaign-detail-dialog"
      ref={dialogRef}
      className={`${styles.campaignDialog} ${finish.dialog}${chapter === "give" ? ` ${giftStyles.dialog}` : ""}`}
      aria-labelledby="chapter-title"
      onClose={restoreFocus}
      onKeyDown={(event) => {
        if (event.key !== "Tab" || !dialogRef.current?.open) return;

        const dialog = dialogRef.current;
        const candidates = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        );

        const tabbable = candidates.filter((element) => {
          const style = window.getComputedStyle(element);
          return !element.matches(":disabled") &&
            !element.closest("[inert]") &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            element.getClientRects().length > 0 &&
            element.tabIndex >= 0;
        });

        if (!tabbable.length) {
          event.preventDefault();
          dialog.querySelector<HTMLElement>("[data-dialog-title]")?.focus();
          return;
        }

        const first = tabbable[0];
        const last = tabbable[tabbable.length - 1];
        const active = document.activeElement;

        if (!event.shiftKey &&
            (active === dialog ||
             active?.matches("[data-dialog-title]") ||
             !dialog.contains(active) ||
             active === last)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey &&
            (active === dialog ||
             active?.matches("[data-dialog-title]") ||
             !dialog.contains(active) ||
             active === first)) {
          event.preventDefault();
          last.focus();
        }
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onBack();
      }}
    >
      <div className={`${styles.campaignDialogHeader} ${finish.header}`}>
        <span>{campaign.organization} · {campaign.season}</span>
        <button type="button" onClick={onBack} aria-label="Close campaign detail">
          <span className={styles.campaignDialogCloseLabel}>Close</span>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className={`${styles.campaignDialogBody} ${finish.body}${chapter === "give" ? ` ${giftStyles.body}` : ""}`}>
        <p className={`${styles.campaignDialogEyebrow} ${finish.eyebrow}`}>
          {chapter === "give" ? "Contribution" : "Campaign record"}
        </p>
        <h2 id="chapter-title" data-dialog-title tabIndex={-1}>{title}</h2>
        <CampaignRecord
          chapter={chapter}
          campaign={campaign}
          amount={amount}
          custom={custom}
          purposes={purposes}
          checkoutReady={checkoutReady}
          canonicalUrl={canonicalUrl}
          onBack={onBack}
        />
      </div>
    </dialog>
  );
}
