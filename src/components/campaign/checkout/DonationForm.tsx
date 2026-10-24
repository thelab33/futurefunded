"use client";
import { useRef, useState, type FormEvent } from "react";
import styles from "@/components/campaign/checkout/DonationForm.module.css";

type GivingFrequency = "one_time" | "monthly";
type ErrorOwner = "customAmount" | "form" | null;

export function DonationForm({ campaignSlug, amountCents, purposeId, configured, frequency, impactLabel, impactDescription, onBack }: {
  campaignSlug: string;
  amountCents: number;
  purposeId: string;
  configured: boolean;
  frequency: GivingFrequency;
  impactLabel: string;
  impactDescription?: string;
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
  const overrideMatch = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(customAmount.trim());
  const overrideCents = overrideMatch ? Number(overrideMatch[1])*100+Number((overrideMatch[2]??"").padEnd(2,"0")) : 0;
  const visualDollars = overrideCents >= 100 && overrideCents <= 1000000 ? overrideCents/100 : selectedDollars;
  const displayAmount = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: visualDollars % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(visualDollars);

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
        if (["invalid_amount", "amount_below_minimum", "amount_above_maximum", "invalid_email", "invalid_name", "purpose_not_allowed", "frequency_not_allowed", "invalid_json", "checkout_disabled", "checkout_not_configured", "checkout_rate_limited", "invalid_request", "campaign_not_found"].includes(code)) retryLocked.current = false;
        throw new Error(body.error?.message ?? "Checkout could not be opened. Retry with the same details.");
      }
      if (typeof body.checkout?.returnUrl === "string") {
        const back = new URL(body.checkout.returnUrl, window.location.origin);
        const id = body.checkout.attemptId;
        if (back.origin !== window.location.origin || back.pathname !== `/c/${campaignSlug}/gift` ||
            typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id) || back.searchParams.get("attempt") !== id) {
          throw new Error("The test confirmation destination could not be verified.");
        }
        window.location.assign(back.href);
        return;
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
    <aside className={styles.summary} aria-label="Selected campaign gift">
      <div className={styles.selectionAmount}>
        <span>Selected gift · USD</span>
        <strong>{displayAmount}</strong>
        <small>{frequencyLabel}</small>
      </div>
      <div className={styles.selectionImpact}>
        <span className={styles.impactEyebrow}>The impact you support</span>
        <strong>{customAmount.trim() ? "Shared season fund" : impactLabel}</strong>
        {!customAmount.trim() && impactDescription && <p>{impactDescription}</p>}
      </div>
      <p className={styles.sharedFund}>{impactLabel === "Shared season fund" || customAmount.trim() ? "Contributions are pooled across the program." : "All gifts support the shared season fund. Amounts illustrate support, rather than a reserved purchase."}</p>
      <button type="button" className={styles.back} onClick={onBack}>Change amount <span aria-hidden="true">←</span></button>
    </aside>

    <div className={styles.details}>
      <header className={styles.topline}>
        <p className={styles.eyebrow}>{configured ? "Next · Stripe test checkout" : "Season fund preview"}</p>
        <h3 id="checkout-form-title">{configured ? "Review your test gift." : "Giving not open yet."}</h3>
        <p>{configured ? "Use Stripe test details. No real money is collected." : "You can review your support here. Payments are not being accepted yet."}</p>
      </header>

    {configured && <>
    <fieldset disabled={busy}>
      <legend>Gift amount</legend>
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
        <small id="checkout-custom-amount-help">Leave blank to keep your selection. $1–$10,000 USD; custom amounts support the shared season fund.</small>
      </label>
    </fieldset>
    <fieldset disabled={busy}>
      <legend>Your details</legend>
      <div className={styles.fields}>
        <label>Email <small>optional</small><input name="donorEmail" type="email" autoComplete="email" maxLength={254}/></label>
        <label>Name <small>optional</small><input name="donorName" autoComplete="name" maxLength={100}/></label>
      </div>
      <label className={styles.anonymous}><input name="anonymous" type="checkbox"/> Keep my name private on public supporter activity</label>
    </fieldset>
    </>}

    {frequency === "monthly" && <p className={styles.note}>The selected amount repeats every month until cancelled. Future payment management will remain separate from public campaign activity.</p>}
    {!configured && <div className={styles.readiness}>
      <span className={styles.readinessDot} aria-hidden="true" />
      <div>
        <strong>This is a gift preview</strong>
        <p>No payment or card details are collected. Return to the campaign to explore the season.</p>
      </div>
    </div>}
    {error && <p role={errorOwner === "form" ? "alert" : undefined} id={errorOwner === "customAmount" ? "checkout-custom-amount-error" : "checkout-error"} className={styles.error}>{error}</p>}
    <div className={styles.actions}>
      {configured ? <button className={styles.submit} type="submit" disabled={busy}>
        {busy ? "Opening test checkout…" : "Continue to Stripe test checkout"}
        {!busy && <span aria-hidden="true">→</span>}
      </button> : <button className={styles.returnButton} type="button" onClick={onBack}>
        Return to campaign <span aria-hidden="true">→</span>
      </button>}
      <span className={styles.fundContext}>Shared season fund · {frequencyLabel}</span>
    </div>
    {configured && <p className={styles.note}>Payment details are entered securely on Stripe.</p>}
    </div>
  </form>;
}
