import "server-only";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { NewsletterSettings } from "./newsletter-config";

export const consentVersion = "futurefunded-season-updates-v1";
export const consentText = (organization: string) => `I agree to receive occasional campaign updates from ${organization}. I can unsubscribe anytime.`;
const cache = globalThis as typeof globalThis & { ffNewsletterPool?: { url: string; pool: Pool } };
export function newsletterPool(settings: NewsletterSettings) {
  if (cache.ffNewsletterPool?.url !== settings.databaseUrl) {
    if (cache.ffNewsletterPool) throw new Error("Newsletter database configuration changed; restart required.");
    const pool = new Pool({ connectionString: settings.databaseUrl, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 10000, idle_in_transaction_session_timeout: 45000 });
    pool.on("error", () => console.error("Newsletter database connection failed."));
    cache.ffNewsletterPool = { url: settings.databaseUrl, pool };
  }
  return cache.ffNewsletterPool.pool;
}
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function newsletterReady(slug: string): Promise<boolean> {
  const { newsletterSettings } = await import("./newsletter-config");
  const settings = newsletterSettings();
  if (!settings?.campaigns[slug]) return false;
  try { const r = await newsletterPool(settings).query("SELECT version FROM ff_newsletter.schema_version WHERE version = 1"); return r.rowCount === 1; }
  catch { return false; }
}
export async function transaction<T>(pool: Pool, work: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try { await db.query("BEGIN"); await db.query("SET LOCAL lock_timeout = '5s'"); const result = await work(db); await db.query("COMMIT"); return result; }
  catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
  finally { db.release(); }
}
async function limit(db: PoolClient, key: string, maximum: number) {
  const r = await db.query<{ hits: number }>(`INSERT INTO ff_newsletter.rate_limits (key, starts_at, hits)
    VALUES ($1, date_trunc('hour', now()), 1)
    ON CONFLICT (key) DO UPDATE SET starts_at = EXCLUDED.starts_at,
    hits = CASE WHEN ff_newsletter.rate_limits.starts_at = EXCLUDED.starts_at THEN ff_newsletter.rate_limits.hits + 1 ELSE 1 END RETURNING hits`, [key]);
  return r.rows[0].hits <= maximum;
}
export async function reserve(settings: NewsletterSettings, slug: string, organization: string, email: string) {
  const token = randomBytes(32).toString("hex"), id = randomUUID();
  const emailKey = createHmac("sha256", settings.secret).update(email).digest("hex");
  const accepted = await transaction(newsletterPool(settings), async db => {
    // Database-backed across processes; no untrusted forwarded-IP headers. Global cap bounds confirmation-email costs.
    const globalOK = await limit(db, "send:global", 60);
    if (!globalOK) return "limited" as const;
    const emailOK = await limit(db, `send:${slug}:${emailKey}`, 3);
    await db.query("DELETE FROM ff_newsletter.rate_limits WHERE starts_at < now() - interval '2 days'");
    await db.query("DELETE FROM ff_newsletter.requests WHERE confirmed_at IS NULL AND expires_at < now() - interval '7 days'");
    if (!emailOK) return "quiet" as const;
    await db.query(`INSERT INTO ff_newsletter.requests (id,token_hash,campaign_slug,organization,email,consent_version,consent_text)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, tokenHash(token), slug, organization, email, consentVersion, consentText(organization)]);
    return "reserved" as const;
  });
  return { accepted, token, id };
}
export type Confirmation = { campaign_slug: string; organization: string; email: string; confirmed_at: string | null; outcome: "subscribed" | "suppressed" | null; valid: boolean };
export async function confirm(settings: NewsletterSettings, token: string, subscribe: (email: string, slug: string) => Promise<"subscribed" | "suppressed">) {
  const pool = newsletterPool(settings);
  if (!await transaction(pool, db => limit(db, "confirm:global", 300))) return { kind: "limited" as const };
  return transaction(pool, async db => {
    const found = await db.query<Confirmation>(`SELECT campaign_slug,organization,email,confirmed_at,outcome,
      expires_at > now() AND mail_accepted AS valid FROM ff_newsletter.requests WHERE token_hash=$1 FOR UPDATE`, [tokenHash(token)]);
    const row = found.rows[0];
    if (!row || !settings.campaigns[row.campaign_slug] || (!row.confirmed_at && !row.valid)) return { kind: "invalid" as const };
    if (row.confirmed_at) return { kind: "already-confirmed" as const, slug: row.campaign_slug };
    const outcome = await subscribe(row.email, row.campaign_slug);
    await db.query("UPDATE ff_newsletter.requests SET confirmed_at=now(), outcome=$2 WHERE token_hash=$1", [tokenHash(token), outcome]);
    return { kind: outcome, slug: row.campaign_slug };
  });
}
