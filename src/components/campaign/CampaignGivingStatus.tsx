import styles from "@/components/campaign/Campaign.module.css";

/** Current processor is test-only; readiness never implies live settlement. */
export function CampaignGivingStatus({ checkoutReady }: { checkoutReady: boolean }) {
  return <div className={styles.givingStatus} id="checkout-availability"
    data-giving-state={checkoutReady ? "test" : "preview"}>
    <span className={styles.givingStatusDot} aria-hidden="true" />
    <div>
      <strong>{checkoutReady ? "Test checkout available" : "Giving opens soon"}</strong>
      <p>{checkoutReady ? "Test mode only. No real payment is accepted."
        : "Explore your gift. Payments are not being accepted."}</p>
    </div>
  </div>;
}
