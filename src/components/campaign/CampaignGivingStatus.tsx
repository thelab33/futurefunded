import {givingState,type CheckoutMode} from "@/domain/campaigns/payment-presentation";
import styles from "@/components/campaign/Campaign.module.css";

/** Payment readiness is server-derived; it does not imply settled payouts. */
export function CampaignGivingStatus({
  checkoutReady, checkoutMode,
}: {
  checkoutReady: boolean; checkoutMode?:CheckoutMode;
}) {
  const state=givingState(checkoutMode,checkoutReady);
  return (
    <div
      className={styles.givingStatus}
      id="checkout-availability"
      data-giving-state={state}
    >
      <span className={styles.givingStatusDot} aria-hidden="true" />
      <div>
        <strong>
          {state==="live"?"Giving is open":state==="test"?"Test mode":"Giving not open yet"}
        </strong>
        <p>
          {state==="live"?"One-time gifts through Stripe.":state==="test"
            ? "· No real money is collected."
            : "Payments are not being accepted."}
        </p>
      </div>
    </div>
  );
}
