"use client";

import { createAuthClient } from "better-auth/react";
import { PeoplePermissions } from "./PeoplePermissions";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { validateDispatchDraft, DispatchValidationError, type DispatchCategory } from "@/domain/organizer/dispatch-rules";
import styles from "./OrganizerStudio.module.css";

type Entry = { id: string; title: string; summary: string; category: DispatchCategory;
  status: "draft" | "published"; version: number; updated_at: string; published_at: string | null };
type Filter = "all" | "draft" | "published";
const categories: ReadonlyArray<{ value: DispatchCategory; label: string }> = [
  {value:"practice",label:"Practices & gym time"}, {value:"competition",label:"Tournaments"},
  {value:"travel",label:"Travel"}, {value:"equipment",label:"Uniforms & equipment"},
  {value:"access",label:"Participation & scholarships"}, {value:"community",label:"Community"},
];
const blank = { title: "", summary: "", category: "practice" as DispatchCategory };
const previewEntries: Entry[] = [
  { id: "preview-draft", title: "Season preparation update", summary: "Preview sample only — organize gym time, tournament travel, and program milestones. No real campaign update is stored here.", category: "practice", status: "draft", version: 1, updated_at: "2026-10-18T12:00:00Z", published_at: null },
];

function updatedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Update time unavailable" : new Intl.DateTimeFormat(undefined,
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

const organizerAuthClient = createAuthClient();

export function OrganizerStudio({ slug, organization, role, publicEnabled, previewMode = false }: {
  slug: string; organization: string; role: "owner" | "publisher" | "editor"; publicEnabled: boolean; previewMode?: boolean;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [confirmation, setConfirmation] = useState<Entry | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const allowNavigation = useRef(false);
  const headline = useRef<HTMLInputElement>(null);
  const confirmCancel = useRef<HTMLButtonElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const base = `/api/organizer/${encodeURIComponent(slug)}/dispatch`;
  const canPublish = role !== "editor";
  const original = editing ?? blank;
  const dirty = form.title !== original.title || form.summary !== original.summary || form.category !== original.category;

  const readEntries = useCallback(async (signal?: AbortSignal) => {
    if (previewMode) return previewEntries;
    const response = await fetch(base, { cache: "no-store", credentials: "same-origin", signal });
    if (!response.ok) throw new Error("Updates could not be loaded. Check your connection or sign in again.");
    const body = await response.json() as { entries?: Entry[] };
    if (!Array.isArray(body.entries)) throw new Error("The update list could not be read. Please retry.");
    return body.entries;
  }, [base, previewMode]);
  async function refresh() {
    setLoading(true); setLoadError("");
    try {
      const latest = await readEntries();
      setEntries(latest); setLoaded(true); setUncertain(false);
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : "Updates could not be loaded.");
    } finally { setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void readEntries(controller.signal).then(latest => {
      if (!controller.signal.aborted) { setEntries(latest); setLoaded(true); setLoading(false); }
    }).catch(failure => {
      if (!controller.signal.aborted) {
        setLoadError(failure instanceof Error ? failure.message : "Updates could not be loaded.");
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [readEntries]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (!allowNavigation.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (confirmation) confirmCancel.current?.focus();
  }, [confirmation]);
  function closeConfirmation() {
    setConfirmation(null);
    listHeading.current?.focus({ preventScroll: true });
  }
  function mayDiscard() { return !dirty || window.confirm("Discard your unsaved changes?"); }
  function resetComposer() {
    if (!mayDiscard()) return;
    setEditing(null); setForm(blank); setPreview(false); setError("");
    headline.current?.focus();
  }
  function select(entry: Entry) {
    if (!mayDiscard()) return;
    setEditing(entry); setForm({title:entry.title,summary:entry.summary,category:entry.category});
    setPreview(false); setError(""); setNotice(""); headline.current?.focus();
  }
  async function mutate(url: string, method: "POST" | "PATCH", data: unknown) {
    if (previewMode) throw new Error("Visual preview only. Saving and publishing are disabled.");
    let response: Response;
    try {
      response = await fetch(url, { method, credentials: "same-origin",
        headers: {"Content-Type":"application/json"}, body:JSON.stringify(data) });
    } catch {
      setUncertain(true);
      throw new Error("The result could not be confirmed. Refresh updates and check the list before trying again. Your text is still here.");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null) as {error?: string} | null;
      if (response.status >= 500) setUncertain(true);
      throw new Error(response.status === 409
        ? "Someone changed this update. Your text is preserved. Refresh updates, then reopen the latest draft before saving."
        : body?.error || "The change could not be confirmed. Refresh updates before retrying.");
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !loaded || loading || uncertain) return;
    let content;
    try { content = validateDispatchDraft(form); }
    catch (failure) {
      setError(failure instanceof DispatchValidationError ? failure.message : "Check the update text.");
      return;
    }
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (editing) await mutate(`${base}/${encodeURIComponent(editing.id)}`, "PATCH", {...content,version:editing.version});
      else await mutate(base, "POST", content);
      setEditing(null); setForm(blank); setPreview(false);
      setNotice("Saved successfully. Your update is a private draft and is not visible to supporters.");
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Your text is preserved."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function publication(entry: Entry) {
    if (lock.current || !canPublish || loading || uncertain) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const publish = entry.status === "draft";
      await mutate(`${base}/${encodeURIComponent(entry.id)}`, "POST",
        {action:publish ? "publish" : "unpublish",version:entry.version});
      closeConfirmation();
      setNotice(publish
        ? publicEnabled ? "Publication confirmed. This update is eligible for the public campaign." : "Moved to staging. The update remains hidden from supporters while the public connection is off."
        : "Returned to a private draft. This update is not published.");
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not change publication."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function signOut() {
    if (previewMode || busy || lock.current) return;
    if (!mayDiscard()) return;

    lock.current = true;
    setBusy(true);
    setError("");

    try {
      const result = await organizerAuthClient.signOut();

      if (result.error) {
        throw new Error("Sign-out could not be completed.");
      }

      allowNavigation.current = true;
      window.location.replace(
        `/organizer/${encodeURIComponent(slug)}`
      );
    } catch {
      setError(
        "We couldn't sign you out. Please retry. Your session may still be active."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const drafts = entries.filter(entry => entry.status === "draft").length;
  const published = entries.length - drafts;
  const visible = entries.filter(entry => (filter === "all" || entry.status === filter)
    && `${entry.title} ${entry.summary}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const blocked = previewMode || busy || loading || !loaded || uncertain;
  const nextDraft = entries.find(entry => entry.status === "draft");
  const stagedStatus = publicEnabled ? "Public connection enabled" : "Public connection off";
  const nextAction = !loaded ? "Load your updates" : dirty ? "Save your changes" : editing ? "Review your draft" : nextDraft ? "Review your saved draft" : "Write your first update";
  function proceedNext() {
    if (dirty || editing) {
      headline.current?.focus();
      document.getElementById("dispatch-edit-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (nextDraft) {
      select(nextDraft);
      document.getElementById("dispatch-edit-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      headline.current?.focus();
      document.getElementById("dispatch-edit-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return <div className={styles.studio}>
    <nav className={styles.workspaceNav} aria-label="Organizer workspace">
      <a href="#workspace-today">Overview</a><a href="#dispatch-edit-title">Write an update</a>
      <a href="#dispatch-list-title">Manage updates</a><a href="#workspace-operations">Campaign operations</a>
      <a href={previewMode ? "#workspace-today" : `/c/${encodeURIComponent(slug)}`} onClick={event=>{if(!mayDiscard()) event.preventDefault();else allowNavigation.current=true;}}>View campaign →</a>
      <button className={styles.outline} type="button" disabled={previewMode || busy} onClick={()=>signOut()}>Sign out</button>
    </nav>
    <section id="workspace-today" className={styles.overview} aria-labelledby="workspace-title">
      <div><p className={styles.eyebrow}>Organizer workspace · Season 2026</p><h1 id="workspace-title">{organization}</h1>
        <p>Write the next chapter. Keep families and supporters informed.</p></div>
      <span className={styles.role}>{role}</span>
      <div className={styles.summaryGrid} aria-label="Season update overview">
        <div><span>Private drafts</span><strong>{loaded ? drafts : "—"}</strong><small>Ready for review</small></div>
        <div><span>{publicEnabled ? "Published updates" : "In staging"}</span><strong>{loaded ? published : "—"}</strong><small>{publicEnabled ? "Public connection enabled" : "Public connection off"}</small></div>
        <div><span>Your permissions</span><strong className={styles.permission}>{canPublish ? "Write & publish" : "Write drafts"}</strong><small>{canPublish ? "Review each update before publishing" : "A publisher approves public updates"}</small></div>
      </div>
    </section>
    {!publicEnabled && <p className={styles.notice}>Public connection off. Drafts and staged updates stay private.</p>}
    {notice && <div className={styles.feedback} role="status" aria-live="polite" aria-atomic="true"><strong>Changes saved</strong><span>{notice}</span></div>}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {loadError && <div role="alert" className={styles.error}>{loadError} {loaded && "Previously loaded updates remain below."}
      <button type="button" className={styles.outline} disabled={busy || loading} onClick={()=>void refresh()}>Retry loading updates</button></div>}
    {uncertain && <p className={styles.notice}>Check the latest update list before retrying this change.
      <button type="button" className={styles.outline} disabled={busy || loading} onClick={()=>void refresh()}>Refresh updates</button></p>}
    <section className={styles.nextAction} aria-label="Recommended next action">
      <div><p className={styles.eyebrow}>Your next step</p><h2>{nextAction}</h2>
        <p>{dirty ? "Your latest edits aren't saved yet. Review your wording, then save a private draft." : editing ? "Finish reviewing this update. Saving never publishes it." : nextDraft ? `“${nextDraft.title}” is private. Open it to review or revise before staging.` : "Create a short, accurate update about a real team milestone."}</p></div>
      <button type="button" className={styles.nextActionButton} disabled={busy || loading || !loaded || uncertain} onClick={proceedNext}>{nextDraft && !dirty && !editing ? "Open saved draft" : "Continue editing"} <span aria-hidden="true">→</span></button>
    </section>
    <div className={styles.grid}>
      <section className={styles.panel} aria-labelledby="dispatch-edit-title">
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>Compose</p><h2 id="dispatch-edit-title">{editing ? "Edit draft" : "New season update"}</h2></div>
          <span className={styles.saveState}>{dirty ? "Unsaved changes" : "Private draft"}</span></div>
        <p className={styles.panelSubline}>Write one clear moment: what happened, why it matters, and how supporters helped.</p>
        <form onSubmit={save} className={styles.form}>
          <fieldset disabled={busy}>
            <label htmlFor="dispatch-title">Headline <span>{form.title.length}/120</span></label>
            <input ref={headline} id="dispatch-title" required maxLength={120} value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="A milestone worth sharing" />
            <label htmlFor="dispatch-category">Update type</label>
            <select id="dispatch-category" value={form.category} onChange={event=>setForm({...form,category:event.target.value as DispatchCategory})}>
              {categories.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <label htmlFor="dispatch-summary">The update <span>{form.summary.length}/600</span></label>
            <textarea id="dispatch-summary" required maxLength={600} rows={6} value={form.summary} aria-describedby="dispatch-hint"
              onChange={event=>setForm({...form,summary:event.target.value})} placeholder="What happened, when, and why it matters." />
            <p id="dispatch-hint" className={styles.hint}>Be specific and factual. Never identify a child or share personal details without appropriate authorization.</p>
          </fieldset>
          <div className={styles.actions}>
            <button type="submit" disabled={blocked || !dirty}>{busy ? "Working…" : "Save draft"}</button>
            <button type="button" className={styles.outline} disabled={busy} aria-expanded={preview} aria-controls="dispatch-preview" onClick={()=>setPreview(!preview)}>{preview ? "Hide preview" : "Preview update"}</button>
            {(dirty || editing) && <button type="button" className={styles.link} disabled={busy} onClick={resetComposer}>Discard changes</button>}
          </div>
          <p className={styles.hint}><strong>Private by default.</strong> Saving creates a draft only. No update goes public automatically.</p>
        </form>
        {preview && <article id="dispatch-preview" className={styles.preview} aria-label="Update preview"><small>{categories.find(c=>c.value===form.category)?.label}</small>
          <h3>{form.title || "Your headline"}</h3><p>{form.summary || "Your update will appear here."}</p><small>Preview only · Not published</small></article>}
      </section>
      <section className={styles.panel} aria-labelledby="dispatch-list-title" aria-busy={loading}>
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>Season dispatch</p><h2 ref={listHeading} tabIndex={-1} id="dispatch-list-title">Your updates</h2></div>
          <button className={styles.outline} disabled={busy || loading} type="button" onClick={()=>{setConfirmation(null);void refresh();}}>{loading ? "Loading…" : "Refresh"}</button></div>
        <p className={styles.panelSubline}>Review, edit, and stage your season updates.</p>
        <div className={styles.listTools}>
          <label htmlFor="dispatch-filter">Show<select id="dispatch-filter" value={filter} onChange={event=>setFilter(event.target.value as Filter)}>
            <option value="all">All updates</option><option value="draft">Drafts</option><option value="published">{publicEnabled ? "Published" : "In staging"}</option></select></label>
          <label htmlFor="dispatch-search">Find an update<input id="dispatch-search" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search your updates" /></label>
        </div>
        <div className={styles.entries}>{visible.map(entry=><article className={styles.entry} key={entry.id}>
          <div className={styles.entryTop}><span className={entry.status === "published" ? styles.published : styles.draft}>{entry.status === "published" && !publicEnabled ? "In staging" : entry.status}</span>
            <time dateTime={entry.updated_at}>Edited {updatedLabel(entry.updated_at)}</time></div>
          <h3>{entry.title}</h3><p>{entry.summary}</p>
          <p className={styles.entryStatusDetail}>{entry.status === "draft" ? "Private · Not visible to supporters" : publicEnabled ? "Published · Eligible for public campaign display" : "Staging only · Not visible to supporters"}</p>
          {confirmation?.id === entry.id ? <div className={styles.confirmation} role="group" aria-label="Confirm publication change">
            <h4>{entry.status === "draft" ? publicEnabled ? "Publish this update?" : "Move this update to staging?" : "Unpublish this update?"}</h4>
            <p>{entry.status === "draft" ? publicEnabled ? "This update will become eligible to appear on the public campaign." : "This saves a published version, but the public connection is switched off." : "This removes the update from published results and returns it to a private draft."}</p>
            <div className={styles.entryActions}><button ref={confirmCancel} type="button" disabled={busy} className={styles.outline} onClick={closeConfirmation}>Cancel</button>
              <button type="button" disabled={blocked} onClick={()=>void publication(entry)}>{entry.status === "draft" ? publicEnabled ? "Confirm publish" : "Confirm move to staging" : "Confirm unpublish"}</button></div>
          </div> : <div className={styles.entryActions}>
            {entry.status === "draft" && <button type="button" className={styles.outline} disabled={blocked} onClick={()=>{select(entry);document.getElementById("dispatch-edit-title")?.scrollIntoView({behavior:"smooth",block:"start"});}}>Review / edit<span className={styles.srOnly}> {entry.title}</span></button>}
            {canPublish && <button type="button" className={entry.status === "published" ? styles.outline : undefined} disabled={blocked} onClick={()=>setConfirmation(entry)}>
              {entry.status === "draft" ? publicEnabled ? "Publish" : "Move to staging" : "Unpublish"}<span className={styles.srOnly}> {entry.title}</span></button>}
          </div>}
        </article>)}
        {!visible.length && <div className={styles.empty}>{loading ? "Loading your season updates…" : !loaded ? "Your updates are unavailable. Retry loading to continue." : entries.length ? "No updates match this search. Try another title or filter." : "Your first update starts here. Share a practice milestone, tournament moment, or community thank-you."}</div>}</div>
      </section>
    </div>
    <section id="workspace-operations" className={styles.operations} aria-labelledby="operations-title">
      <div className={styles.operationsHeading}>
        <div><p className={styles.eyebrow}>Campaign administration</p><h2 id="operations-title">Campaign operations</h2>
          <p>Workspace access and campaign services.</p></div>
        <a href={previewMode ? "#workspace-today" : `/c/${encodeURIComponent(slug)}`} onClick={event=>{if(!mayDiscard()) event.preventDefault();else allowNavigation.current=true;}}>View campaign <span aria-hidden="true">→</span></a>
      </div>
      <div className={styles.operationsPrimary}>
        <div className={styles.operationsPrimaryCopy}>
          <p className={styles.eyebrow}>Active workspace</p>
          <h3>Season communications</h3>
          <p>Write, review, and organize team milestones from one private workspace.</p>
          <div className={styles.operationsFacts} aria-label="Current season communications status">
            <span><strong>{loaded ? drafts : "—"}</strong> Private drafts</span>
            <span><strong>{loaded ? published : "—"}</strong> {publicEnabled ? "Published" : "In staging"}</span>
            <span><strong>{stagedStatus}</strong> {publicEnabled ? "Review before sharing" : "Supporters cannot see staged updates"}</span>
          </div>
        </div>
        <a className={styles.operationsAction} href="#dispatch-list-title">Manage updates <span aria-hidden="true">→</span></a>
      </div>
      <div className={styles.operationsSecondary} aria-label="Setup and administration">
        <h3>Setup &amp; administration</h3>
        <div className={styles.operationsSetupGrid}>
          <PeoplePermissions
            slug={slug}
            role={role}
            previewMode={previewMode}
          />
          <div className={styles.operationsSetupItem}>
            <div><p className={styles.eyebrow}>Payment administration</p><h4>Stripe Connect onboarding</h4>
              <p>Connect onboarding and payout management are not available here.</p></div>
            <span className={styles.operationPending}>Not available</span>
          </div>
        </div>
      </div>
      <p className={styles.operationsNote}>Nothing here changes organizer access, payment settings, or the public publishing connection.</p>
    </section>
  </div>;
}
