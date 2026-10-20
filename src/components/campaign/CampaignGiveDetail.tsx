import type { RecordProps } from "@/components/campaign/campaign-types";
import { DonationForm } from "@/components/campaign/checkout/DonationForm";
import styles from "@/components/campaign/Campaign.module.css";

export function CampaignGiveDetail({
  campaign, amount, custom, purposes, checkoutReady, onBack,
}: Omit<RecordProps, "chapter" | "canonicalUrl">) {
  const selected = campaign.impact.find(option => option.amount === amount);
  const isCustom = Boolean(custom.trim());
  const amountCents = Math.round(amount * 100);
  const purposeId = isCustom ? "shared-season-fund"
    : purposes.find(purpose => purpose.amountCents === amountCents)?.id ?? "shared-season-fund";

  return <div data-campaign-gift-review="c3">
    {!isCustom && selected?.description && <p className={styles.recordLede}>{selected.description}</p>}
    <DonationForm
      campaignSlug={campaign.slug}
      amountCents={amountCents}
      purposeId={purposeId}
      configured={checkoutReady}
      frequency="one_time"
      impactLabel={isCustom ? "Shared season fund" : selected?.label ?? "Shared season fund"}
      onBack={onBack}
    />
  </div>;
}
