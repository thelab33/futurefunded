"use client";
import { useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import styles from "./OrganizerStudio.module.css";

const authClient = createAuthClient({ plugins: [magicLinkClient()] });
export function OrganizerSignIn({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      // Never show whether an email belongs to an organizer.
      await authClient.signIn.magicLink({ email, callbackURL: `/organizer/${encodeURIComponent(slug)}` });
      setMessage("If this address has organizer access, a sign-in link will arrive shortly. Check your inbox.");
    } catch { setMessage("If this address has organizer access, a sign-in link will arrive shortly. Check your inbox."); }
    finally { setPending(false); }
  }
  return <section className={styles.intro}>
    <p className={styles.eyebrow}>Private organizer access</p>
    <h1>Keep the season moving.</h1>
    <p>Manage accurate updates for families, donors, and community supporters. Organizer access is granted privately by the program.</p>
    <form onSubmit={submit} className={styles.loginForm}>
      <label htmlFor="ff-organizer-email">Organizer email address</label>
      <input id="ff-organizer-email" type="email" autoComplete="email" required maxLength={254}
        placeholder="you@organization.org" value={email} onChange={event => setEmail(event.target.value)} />
      <button disabled={pending} type="submit">{pending ? "Sending…" : "Email me a secure sign-in link"}</button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  </section>;
}
