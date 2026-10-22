"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Campaign } from "@/domain/campaigns/types";
import styles from "@/components/campaign/newsletter/NewsletterPopup.module.css";

const STORAGE_KEY = "ff-newsletter-dismissed";

export function NewsletterPopup({
  campaign,
  configured,
  openRequest,
}: {
  campaign: Campaign;
  configured: boolean;
  openRequest: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const [status, setStatus] =
    useState<"idle" | "sending" | "success" | "error">("idle");

  const [message, setMessage] = useState("");

  const newsletter = campaign.engagement?.newsletter;

  // Only an explicit Community Relay action opens this dialog.
  // Never interrupt giving, checkout or a campaign chapter after a timer.
  useEffect(() => {
    if (!newsletter?.enabled || openRequest < 1) return;
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (document.querySelector("dialog[open]")) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialog.showModal();
    headingRef.current?.focus();
  }, [newsletter?.enabled, openRequest]);

  if (!newsletter?.enabled) return null;

  function rememberDismissal() {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleClose() {
    rememberDismissal();
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) target.focus();
  }

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    /*
     * UI and server both enforce provider readiness.
     * This guard protects against programmatic form submission.
     */
    if (!configured || status === "sending") return;
    if (new FormData(event.currentTarget).get("consent") !== "yes") return;

    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: String(data.get("email") ?? ""),
          campaignSlug: campaign.slug,
          consent: data.get("consent") === "yes",
          company: String(data.get("company") ?? ""),
        }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "Unable to subscribe right now.",
        );
      }

      setStatus("success");
      setMessage(result.message || "Check your inbox to confirm season updates.");
      rememberDismissal();
      form.reset();
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to subscribe right now.",
      );
    }
  }

  return (
    <dialog
      ref={dialogRef}
      id="newsletter-updates-dialog"
      className={styles.dialog}
      onClose={handleClose}
      aria-labelledby="newsletter-title"
      data-newsletter-configured={configured ? "true" : "false"}
    >
      <button
        className={styles.close}
        type="button"
        onClick={closeDialog}
        aria-label="Close campaign updates signup"
      >
        ×
      </button>

      <div className={styles.content}>
        <p className="ff-kicker ff-kicker--ember">
          {newsletter.eyebrow}
        </p>

        <h2 id="newsletter-title" ref={headingRef} tabIndex={-1}>
          {newsletter.heading}
        </h2>

        <p>{newsletter.description}</p>

        {!configured ? (
          <div className={styles.readiness} role="status">
            <span className={styles.readinessKicker}>Registration pending</span>
            <strong>Season updates are coming.</strong>
            <p>Email signup is not open yet. You can still explore the campaign and share the season with your community.</p>
            <div className={styles.readinessFooter}>No email address or consent is collected while signup is unavailable.</div>
            <button className={styles.back} type="button" onClick={closeDialog}>
              Back to campaign <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : status === "success" ? (
          <div className={styles.success} role="status">
            <strong>Check your inbox.</strong>
            <p>{message}</p>

            <button type="button" onClick={closeDialog}>
              Done
            </button>
          </div>
        ) : (
          <form
            onSubmit={subscribe}
            className={styles.form}
            aria-label="Campaign updates signup"
            aria-describedby={status === "error" ? "newsletter-signup-error" : undefined}
          >
            <label>
              <span>Email address</span>

              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                disabled={!configured || status === "sending"}
              />
            </label>

            <input
              className={styles.honeypot}
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            <label className={styles.consent}>
              <input name="consent" type="checkbox" value="yes" required disabled={!configured || status === "sending"} />
              <span>I agree to receive occasional campaign updates from {campaign.organization}. I can unsubscribe anytime.</span>
            </label>

            <button
              type="submit"
              disabled={!configured || status === "sending"}
            >
              {configured
                ? status === "sending"
                  ? "Joining…"
                  : "Send confirmation email"
                : "Email connection pending"}
            </button>

            {status === "error" ? (
              <p id="newsletter-signup-error" className={styles.error} role="alert">
                {message}
              </p>
            ) : null}

          </form>
        )}
      </div>
    </dialog>
  );
}
