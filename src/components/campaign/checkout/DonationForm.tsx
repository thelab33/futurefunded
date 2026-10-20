"use client";
import { useRef, useState, type FormEvent } from "react";
import styles from "@/components/campaign/checkout/DonationForm.module.css";

type GivingFrequency = "one_time" | "monthly";
type ErrorOwner = "customAmount" | "form" | null;

export function DonationForm({ campaignSlug, amountCents, purposeId, configured, frequency, impactLabel, onBack }: {
  campaignSlug: string;
  amountCents: number;
  purposeId: string;
  configured: boolean;
  frequency: GivingFrequency;
  impactLabel: string;
  onBack: () => void;
}) {
  const [customAmount, setCustomAmount] = useState("");
  const [error, setError] = useState("");
  const [errorOwner, setErrorOwner] = useState<ErrorOwner>(null);
  const [busy, setBusy] = useState(false);
  const customAmountInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const attempt = useRef<{ details: string; token: string } | null>(null);
  const retryLocked = useRef(false);
  const selectedDollars = amountCents / 100;
  const frequencyLabel = frequency === "monthly" ? "Monthly support" : "One-time gift";
  const displayAmount = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: selectedDollars % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(selectedDollars);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !configured) return;
    const form = new FormData(event.currentTarget);
    let chosenCents = amountCents;
    if (customAmount.trim()) {
      const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(customAmount.trim());
      if (!match) {
        setError("Enter at least $1, with up to two decimal places.");
        setErrorOwner("customAmount");
        window.requestAnimationFrame(() => customAmountInput.current?.focus());
        return;
      }
      chosenCents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
      if (chosenCents < 100) {
        setError("Enter at least $1, with up to two decimal places.");
        setErrorOwner("customAmount");
        window.requestAnimationFrame(() => customAmountInput.current?.focus());
        return;
      }
    }
    const query = new URLSearchParams(window.location.search);
    const details = { campaignSlug, amountCents: chosenCents, purposeId: customAmount.trim() ? "shared-season-fund" : purposeId,
      frequency, donorName: String(form.get("donorName") ?? ""), donorEmail: String(form.get("donorEmail") ?? ""),
      anonymous: form.get("anonymous") === "on", sourceRef: query.get("sourceRef") ?? "campaign", sourceChannel: query.get("sourceChannel") ?? "web" };
    const serialized = JSON.stringify(details);
    if (retryLocked.current && attempt.current?.details !== serialized) {
      setError("The previous checkout request may still be processing. Restore its details before retrying, or contact the organizer.");
      setErrorOwner("form");
      return;
    }
    if (!attempt.current || attempt.current.details !== serialized) attempt.current = { details: serialized, token: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setError(""); setErrorOwner(null);
    retryLocked.current = true;
    try {
      const response = await fetch("/api/donations/checkout", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...details, requestToken: attempt.current.token }) });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        const code = body.error?.code;
        if (["invalid_amount", "amount_below_minimum", "amount_above_maximum", "invalid_email", "invalid_name", "purpose_not_allowed", "frequency_not_allowed", "invalid_json", "checkout_disabled", "checkout_not_configured", "checkout_rate_limited"].includes(code)) retryLocked.current = false;
        throw new Error(body.error?.message ?? "Checkout could not be opened. Retry with the same details.");
      }
      const url = new URL(body.checkout.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password || url.port) throw new Error("Checkout could not be verified. Contact the organizer.");
      window.location.assign(url.href);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Checkout could not be opened. Retry with the same details.");
      setErrorOwner("form");
    }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <form
    className={styles.form}
    onSubmit={submit}
    aria-labelledby="checkout-form-title"
    aria-describedby={errorOwner === "form" ? "checkout-error" : undefined}
  >
    <div className={styles.topline}>
      <header>
        <p className={styles.eyebrow}>{configured ? "Secure checkout details" : "Season fund review"}</p>
        <h3 id="checkout-form-title">{configured ? "Finish your gift." : "Your gift at a glance."}</h3>
        <p>{configured ? "Add the donor details you want associated with your gift." : "Review your selected amount and how it supports the shared season fund."}</p>
      </header>
    </div>

    <div className={styles.summary}>
      <div className={styles.selectionAmount}>
        <span>Selected gift</span>
        <strong>{displayAmount}</strong>
      </div>
      <div className={styles.selectionImpact}>
        <strong>{impactLabel}</strong>
        <span>{frequencyLabel}</span>
      </div>
      <button type="button" className={styles.back} onClick={onBack}>Change amount</button>
    </div>

    {configured && <fieldset disabled={busy}>
      <legend>Donor details</legend>
      <label className={styles.override}>
        <span>Other amount <small>optional</small></span>
        <input
          ref={customAmountInput}
          id="checkout-custom-amount"
          name="customAmount"
          type="text"
          inputMode="decimal"
          value={customAmount}
          onChange={(event) => {
            setCustomAmount(event.target.value);
            if (errorOwner === "customAmount") {
              setError("");
              setErrorOwner(null);
            }
          }}
          placeholder={`$${selectedDollars.toFixed(2)} selected`}
          maxLength={9}
          aria-invalid={errorOwner === "customAmount"}
          aria-errormessage={errorOwner === "customAmount" ? "checkout-custom-amount-error" : undefined}
          aria-describedby="checkout-custom-amount-help"
        />
        <small id="checkout-custom-amount-help">Leave blank to keep the selected impact amount. Enter at least $1; a custom amount supports the shared season fund.</small>
      </label>
      <div className={styles.fields}>
        <label>Email <small>optional</small><input name="donorEmail" type="email" autoComplete="email" maxLength={254}/></label>
        <label>Name <small>optional</small><input name="donorName" autoComplete="name" maxLength={100}/></label>
      </div>
      <label className={styles.anonymous}><input name="anonymous" type="checkbox"/> Keep my name private on public supporter activity</label>
    </fieldset>}

    {frequency === "monthly" && <p className={styles.note}>The selected amount repeats every month until cancelled. Future payment management will remain separate from public campaign activity.</p>}
    {!configured && <div className={styles.readiness}>
      <span className={styles.readinessDot} aria-hidden="true" />
      <div>
        <strong>Giving opens soon</strong>
        <p>Payments are not being accepted. You can explore a different amount or return to the campaign.</p>
      </div>
    </div>}
    {error && <p role={errorOwner === "form" ? "alert" : undefined} id={errorOwner === "customAmount" ? "checkout-custom-amount-error" : "checkout-error"} className={styles.error}>{error}</p>}
    <div className={styles.actions}>
      {configured ? <button className={styles.submit} type="submit" disabled={busy}>
        {busy ? "Opening secure checkout…" : "Continue to secure checkout"}
        {!busy && <span aria-hidden="true">→</span>}
      </button> : <button className={styles.returnButton} type="button" onClick={onBack}>
        Return to campaign <span aria-hidden="true">→</span>
      </button>}
      <span className={styles.fundContext}>Shared season fund · {frequencyLabel}</span>
    </div>
    {configured && <p className={styles.note}>You’ll continue on Stripe. A return to this page does not confirm a payment.</p>}
  </form>;
}
