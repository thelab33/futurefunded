import Image from "next/image";
import { CampaignImpactPhoto } from "./CampaignImpactPhoto";
import type { ReactNode, RefObject } from "react";
import type { Campaign } from "@/domain/campaigns/types";
import styles from "@/components/campaign/Campaign.module.css";
import { formatCampaignMoney as money } from "@/components/campaign/campaign-format";

export type CampaignImpactChooserProps = {
  campaign: Campaign;
  amount: number;
  custom: string;
  error: string;
  customInput: RefObject<HTMLInputElement | null>;
  onPreset: (amount: number) => void;
  onCustom: (value: string) => void;
  onGive: () => void;
  availabilityDescriptionId?: string;
  checkoutReady: boolean;
  status?: ReactNode;
  disabled?: boolean;
};

export function CampaignImpactChooser({
  campaign,
  amount,
  custom,
  error,
  customInput,
  onPreset,
  onCustom,
  onGive,
  availabilityDescriptionId,
  checkoutReady,
  status,
  disabled = false,
}: CampaignImpactChooserProps) {
  const customAmount = custom.trim();
  const selectedImpact = campaign.impact.find((item) => item.amount === amount);
  const recommendedImpact = campaign.impact.find((item) => item.recommended);
  // Custom text remains an editable draft until the state owner validates it.
  // Do not present unvalidated input as a confirmed currency amount.
  const actionLabel = customAmount
    ? checkoutReady
      ? "Continue with custom gift"
      : "Preview custom gift"
    : checkoutReady
      ? `Continue with ${money(amount)}`
      : `Preview a ${money(amount)} gift`;

  return (
    <div
      className={styles.givingAction}
      data-console-zone="workspace"
      data-custom-active={customAmount ? "true" : "false"}
    >
      {status}
      <fieldset
        className={styles.amounts}
        aria-describedby={["impact-fund-note", availabilityDescriptionId]
          .filter(Boolean)
          .join(" ")}
      >
        <legend>
          <span>Choose your support</span>
          {recommendedImpact && (
            <span
              className={styles.amountRecommendation}
              id="campaign-recommended-amount"
            >
              {campaign.branding?.recommendedLabel ?? "Recommended"}:{" "}
              {money(recommendedImpact.amount)}
            </span>
          )}
        </legend>

        <div>
          {campaign.impact.map((i) => (
            <button
              key={i.amount}
              type="button"
              disabled={disabled}
              aria-label={`${money(i.amount)} ${i.label}`}
              aria-pressed={!customAmount && amount === i.amount}
              data-impact-selected={
                !customAmount && amount === i.amount ? "true" : "false"
              }
              onClick={() => onPreset(i.amount)}
            >
              {i.category && (
                <span className={styles.impactCategory}>{i.category}</span>
              )}
              <b>{money(i.amount)}</b>
              <span>{i.label}</span>
              {!customAmount && amount === i.amount && (
                <span className={styles.selectedMark} aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      </fieldset>

      <p className={styles.amountFootnote} id="impact-fund-note">
        Every amount supports the shared season fund.
      </p>

      <div
        className={styles.impactStory}
        data-impact-story="c4c52"
        aria-live="polite"
        aria-atomic="true"
      >
        <CampaignImpactPhoto
          campaign={campaign}
          category={selectedImpact?.category}
          custom={Boolean(customAmount)}
        />
        <div className={styles.impactStoryHeading}>
          <strong>
            {customAmount
              ? "Flexible support"
              : (selectedImpact?.label ?? "Back every athlete")}
          </strong>
          <span className={styles.impactStoryEyebrow}>Shared season fund</span>
        </div>
        <p>
          {customAmount
            ? "Your custom amount helps cover gym time, competition, and travel across the program."
            : (selectedImpact?.description ??
              "Your gift supports the program’s shared season fund.")}
        </p>
      </div>

      <label className={styles.custom}>
        Custom amount
        <span>
          <b aria-hidden="true">$</b>
          <input
            ref={customInput}
            id="campaign-custom-amount"
            aria-label="Custom gift amount in dollars"
            name="customAmount"
            disabled={disabled}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-errormessage={error ? "amount-error" : undefined}
            aria-describedby={
              error
                ? "custom-amount-guidance amount-error"
                : "custom-amount-guidance"
            }
            value={custom}
            onChange={(event) => onCustom(event.target.value)}
            placeholder="Enter amount"
            maxLength={9}
          />
        </span>
      </label>

      <p className={styles.customGuidance} id="custom-amount-guidance">
        {checkoutReady
          ? "$1–$10,000 test limit · Up to two decimal places."
          : "$1 minimum · Up to two decimal places."}
      </p>

      {error && (
        <p id="amount-error" className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className={styles.continue}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-controls="campaign-detail-dialog"
        aria-describedby={availabilityDescriptionId}
        onClick={onGive}
      >
        <span>{actionLabel}</span>
        <Image
          unoptimized
          className={styles.arrowIcon}
          src="/media/futurefunded/arrow-right.svg"
          alt=""
          width={20}
          height={20}
        />
      </button>
    </div>
  );
}
