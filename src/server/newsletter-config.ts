import "server-only";

export type NewsletterSettings = { origin: string; databaseUrl: string; apiKey: string; from: string; secret: string; campaigns: Record<string, { segment: string; topic: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function newsletterSettings(): NewsletterSettings | null {
  try {
    if (process.env.FF_NEWSLETTER_ENABLED !== "1") return null;
    const origin = new URL(process.env.FF_NEWSLETTER_ORIGIN ?? "");
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
    if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
        !(origin.protocol === "https:" || (process.env.NODE_ENV !== "production" && loopback && origin.protocol === "http:"))) return null;
    const databaseUrl = process.env.FF_NEWSLETTER_DATABASE_URL ?? "";
    const db = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(db.protocol) || !db.hostname || !db.pathname.slice(1)) return null;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(db.hostname) && db.searchParams.get("sslmode") !== "verify-full") return null;
    // The explicitly isolated organizer development endpoint is never a production newsletter database.
    if (process.env.NODE_ENV === "production" && (loopback || db.hostname === "ep-shy-mode-atp5qqux.c-9.us-east-1.aws.neon.tech" || ["127.0.0.1", "localhost", "[::1]"].includes(db.hostname))) return null;
    const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
    const from = (process.env.FF_NEWSLETTER_FROM_EMAIL || process.env.FF_M3_FROM_EMAIL)?.trim() ?? "";
    const secret = process.env.FF_NEWSLETTER_SECRET ?? "";
    if (!apiKey || !from || /[\r\n]/.test(from) || secret.length < 48) return null;
    const campaigns: NewsletterSettings["campaigns"] = JSON.parse(process.env.FF_NEWSLETTER_CAMPAIGNS ?? "{}");
    const entries = Object.entries(campaigns);
    if (!entries.length || entries.length > 100 || entries.some(([slug, ids]) => !/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) || !ids || !uuid.test(ids.segment) || !uuid.test(ids.topic))) return null;
    if (new Set(entries.map(([, v]) => v.segment)).size !== entries.length || new Set(entries.map(([, v]) => v.topic)).size !== entries.length) return null;
    return { origin: origin.origin, databaseUrl, apiKey, from, secret, campaigns };
  } catch { return null; }
}
