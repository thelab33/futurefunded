"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./OrganizerStudio.module.css";

type Role = "owner" | "publisher" | "editor";
type Member = {
  label: string; email: string | null; role: Role;
  isCurrentUser: boolean; access: "active"; manageable: boolean;
};
type Directory = { members: Member[]; currentRole: Role };
const roles: Role[] = ["owner", "publisher", "editor"];
function validDirectory(data: unknown): data is Directory {
  if (!data || typeof data !== "object") return false;
  const value = data as Partial<Directory>;
  return roles.includes(value.currentRole as Role) && Array.isArray(value.members) &&
    value.members.every((m) => m && typeof m.label === "string" &&
      (m.email === null || typeof m.email === "string") && roles.includes(m.role) &&
      typeof m.isCurrentUser === "boolean" && typeof m.manageable === "boolean" && m.access === "active");
}

export function PeoplePermissions({ slug, role, previewMode }: {
  slug: string; role: Role; previewMode: boolean;
}) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [revision, setRevision] = useState(0);
  const [email, setEmail] = useState("");
  const [grantRole, setGrantRole] = useState<Role>("editor");
  const [chosenRoles, setChosenRoles] = useState<Record<string, Role>>({});
  const [pending, setPending] = useState(false);
  const mutationInFlight = useRef(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const directoryHeading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<{action: "remove" | "change_role"; email: string; role?: Role} | null>(null);
  const base = `/api/organizer/${encodeURIComponent(slug)}/members`;
  const writable = !previewMode && role === "owner" && status !== "denied";

  useEffect(() => {
    if (!writable) return;
    const controller = new AbortController();
    async function read() {
      setStatus("loading");
      setDirectory(null);
      setChosenRoles({});
      try {
        const response = await fetch(base, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) { setStatus("denied"); return; }
        if (!response.ok) throw new Error("Directory unavailable");
        const payload: unknown = await response.json();
        if (!validDirectory(payload)) throw new Error("Unexpected directory response");
        if (!controller.signal.aborted) { setDirectory(payload); setStatus("ready"); }
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }
    void read();
    return () => controller.abort();
  }, [base, revision, writable]);

  const mutate = useCallback(async (action: "grant" | "change_role" | "remove", recipient: string, nextRole?: Role) => {
    if (!writable || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setPending(true); setMessage("");
    try {
      const body = action === "remove" ? { action, email: recipient } : { action, email: recipient, role: nextRole };
      const response = await fetch(`${base}/manage`, { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result: unknown = await response.json();
      const error = result && typeof result === "object" && "error" in result ? String(result.error) : null;
      if (response.status === 401 || response.status === 403) { setStatus("denied"); setDirectory(null); }
      if (response.status === 409) setRevision((value) => value + 1);
      if (!response.ok) throw new Error(error ?? "Permission change was not completed.");
      setMessage("Organizer access updated. The change was recorded in the audit log.");
      if (action === "grant") setEmail("");
      if (recipient.trim().toLowerCase() === directory?.members.find(member => member.isCurrentUser)?.email?.trim().toLowerCase()
          && (action === "remove" || nextRole !== "owner")) {
        setStatus("denied"); setDirectory(null);
        setMessage("Your owner access changed. Reload to continue with your current permissions.");
      } else setRevision((value) => value + 1);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Permission change failed."); }
    finally { mutationInFlight.current = false; setPending(false); setConfirm(null); }
  }, [base, writable, directory]);

  useEffect(() => {
    if (confirm) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      confirmButton.current?.focus();
    } else if (returnFocus.current?.isConnected) {
      returnFocus.current.focus();
      returnFocus.current = null;
    } else if (returnFocus.current) {
      directoryHeading.current?.focus();
      returnFocus.current = null;
    }
  }, [confirm]);

  function submitGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) void mutate("grant", email.trim(), grantRole);
  }

  return <div className={styles.operationsSetupItem}>
    <div className={styles.peopleDirectory}>
      <p className={styles.eyebrow}>Organizer access</p>
      <h4 ref={directoryHeading} tabIndex={-1}>People &amp; permissions</h4>
      <p>Verified members and campaign-specific roles.</p>
      {previewMode ? <p className={styles.peopleFeedback}>Member management is unavailable in visual preview.</p> :
       !writable ? <p className={styles.peopleFeedback}>Only campaign owners can manage organizers. Reload after your access changes.</p> : <>
        {status === "loading" && <p className={styles.peopleFeedback} role="status">Loading organizers…</p>}
        {status === "error" && <div className={styles.peopleFeedback} role="alert">Directory unavailable. <button type="button" className={styles.outline} onClick={() => setRevision((n) => n + 1)}>Retry</button></div>}
        {status === "ready" && directory && <>
          <p className={styles.peopleCount}>{directory.members.length} active {directory.members.length === 1 ? "organizer" : "organizers"}</p>
          <ul className={styles.peopleList}>
          {directory.members.map((member, index) => {
            const key = member.email ?? `unresolved-${index}`;
            const roleValue = chosenRoles[key] ?? member.role;
            return <li key={key} className={styles.peopleMember}>
              <span className={styles.peopleIdentity}><strong>{member.label}</strong><small>{member.email ?? "Account identity unavailable"}{member.isCurrentUser ? " · Your account" : ""}</small></span>
              {!member.manageable ? <span className={styles.peopleRole}>{member.role} · unavailable</span> : <>
                <label className={styles.peopleControl}>Role
                  <select aria-label={`Role for ${member.email}`} value={roleValue} disabled={pending}
                    onChange={(event) => setChosenRoles((previous) => ({ ...previous, [key]: event.target.value as Role }))}>
                    {roles.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
                  </select>
                </label>
                <button type="button" aria-label={`Change role for ${member.email}`} disabled={pending || roleValue === member.role} className={styles.outline}
                  onClick={() => setConfirm({ action: "change_role", email: member.email!, role: roleValue })}>Change role</button>
                <button type="button" aria-label={`Remove access for ${member.email}`} disabled={pending} className={styles.outline}
                  onClick={() => setConfirm({ action: "remove", email: member.email! })}>Remove access</button>
              </>}
            </li>;
          })}
          </ul>
          <form className={styles.peopleGrant} onSubmit={submitGrant}>
            <label>Existing verified account email<input disabled={pending} type="email" required maxLength={254} autoComplete="off" value={email}
              onChange={(event) => setEmail(event.target.value)} placeholder="organizer@example.com" /></label>
            <label>Permission<select disabled={pending} value={grantRole} onChange={(event) => setGrantRole(event.target.value as Role)}>
              {roles.map((value) => <option key={value} value={value}>{value}</option>)}
            </select></label>
            <button type="submit" disabled={pending || !email.trim()}>Add verified organizer</button>
          </form>
          <p className={styles.peopleFooter}>The recipient must already have a verified FutureFunded login. Invitations are not enabled yet.</p>
        </>}
        {confirm && <div className={styles.peopleConfirm} role="group" aria-label="Confirm permission change" onKeyDown={(event) => { if (event.key === "Escape" && !pending) setConfirm(null); }}>
          <strong>{confirm.action === "remove" ? "Remove organizer access?" : "Change organizer role?"}</strong>
          <p>{confirm.email}{confirm.role ? ` → ${confirm.role}` : ""}. This action is audited.</p>
          <div className={styles.peopleButtons}>
            <button ref={confirmButton} type="button" disabled={pending} onClick={() => void mutate(confirm.action, confirm.email, confirm.role)}>Confirm change</button>
            <button type="button" className={styles.outline} disabled={pending} onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>}
      </>}
      {message && <p role="status" className={styles.peopleFeedback}>{message}</p>}
      <p className={styles.peopleFooter}>Owner: manage people · Publisher: stage updates · Editor: manage drafts</p>
    </div>
  </div>;
}
