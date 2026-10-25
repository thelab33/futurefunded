"use client";
import {requestSignIn,signInIssueMessage,type SignInIssue} from "@/domain/organizer/sign-in-feedback";
import { useRef, useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import styles from "./OrganizerStudio.module.css";

const authClient = createAuthClient({ plugins: [magicLinkClient()] });
export function OrganizerSignIn({ slug, initialIssue=null }: { slug: string;initialIssue?:SignInIssue }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(signInIssueMessage(initialIssue));
  const lock=useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(lock.current)return;lock.current=true;setPending(true);setMessage("");
    try {
      const feedback=await requestSignIn(()=>authClient.signIn.magicLink({
        email:email.trim().toLowerCase(),callbackURL:`/organizer/${encodeURIComponent(slug)}`,
        errorCallbackURL:`/organizer/${encodeURIComponent(slug)}`,
        fetchOptions:{signal:AbortSignal.timeout(10000)},
      }));
      setMessage(feedback.message);
    }finally{lock.current=false;setPending(false);}
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
