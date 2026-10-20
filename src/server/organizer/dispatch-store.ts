import "server-only";
import { randomUUID } from "node:crypto";
import type { CampaignUpdate } from "@/domain/organizer/dispatch-types";
import { validateDispatchDraft, validateExpectedVersion, type DispatchDraftInput } from "@/domain/organizer/dispatch-rules";
import type { SqlExecutor, SqlTransactionRunner } from "@/server/database/sql-client";

export type OrganizerIdentity = Readonly<{ subject: string }>;
export type OrganizerRole = "owner" | "publisher" | "editor";
export class OrganizerAccessError extends Error {
  constructor(readonly code: "forbidden" | "conflict" | "not_found") { super(code); this.name = "OrganizerAccessError"; }
}
const VALID_SLUG = /^[a-z0-9][a-z0-9-]{1,79}$/;
const VALID_SUBJECT = /^[A-Za-z0-9_:@.\-|]{3,200}$/;
function assertScope(slug: string, actor: OrganizerIdentity): void {
  if (!VALID_SLUG.test(slug) || !VALID_SUBJECT.test(actor.subject)) throw new OrganizerAccessError("forbidden");
}
function serializableRow(row: Record<string, unknown>) {
  return { title: String(row.title), summary: String(row.summary), category: String(row.category),
    status: String(row.status), publishedAt: row.published_at ? new Date(row.published_at as string).toISOString() : null };
}
async function requireRole(tx: SqlExecutor, slug: string, actor: OrganizerIdentity, action: "edit" | "publish") {
  assertScope(slug, actor);
  const role = await tx.query(`SELECT role FROM ff_campaign_organizer_members
    WHERE campaign_slug = $1 AND actor_subject = $2`, [slug, actor.subject]);
  const found = role.rows[0]?.role as OrganizerRole | undefined;
  if (!found || (action === "publish" && found === "editor")) throw new OrganizerAccessError("forbidden");
}
async function audit(tx: SqlExecutor, slug: string, id: string, actor: OrganizerIdentity,
  action: "create" | "edit" | "publish" | "unpublish", prior: number | null, row: Record<string, unknown>) {
  await tx.query(`INSERT INTO ff_campaign_dispatch_audit
    (campaign_slug, update_id, actor_subject, action, prior_version, resulting_version, snapshot)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [slug, id, actor.subject, action, prior, row.version, JSON.stringify(serializableRow(row))]);
}
/** Convert PostgreSQL int8 versions to JSON-safe integers without precision loss. */
function serializeDispatchVersion(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new Error("Unexpected dispatch version type from database.");
  }
  if (typeof value === "string" && !/^[1-9][0-9]*$/.test(value)) {
    throw new Error("Unexpected dispatch version format from database.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || BigInt(parsed) !== BigInt(value)) {
    throw new Error("Dispatch version exceeds the safe integer range.");
  }
  return parsed;
}

/** Internal operations only. No API or user-controlled principal is exposed in M3A. */
export class OrganizerDispatchStore {
  constructor(private readonly db: SqlTransactionRunner) {}

  async createDraft(slug: string, actor: OrganizerIdentity, input: unknown): Promise<string> {
    const content = validateDispatchDraft(input);
    return this.db.transaction(async tx => {
      await requireRole(tx, slug, actor, "edit");
      const id = randomUUID();
      const result = await tx.query(`INSERT INTO ff_campaign_dispatch_updates
        (campaign_slug,id,title,summary,category,status,created_by,updated_by)
        VALUES ($1,$2,$3,$4,$5,'draft',$6,$6) RETURNING *`,
        [slug,id,content.title,content.summary,content.category,actor.subject]);
      if (!result.rows[0]) throw new Error("Draft creation did not return a record.");
      await audit(tx,slug,id,actor,"create",null,result.rows[0]);
      return id;
    });
  }

  async editDraft(slug: string, id: string, actor: OrganizerIdentity, expectedVersion: unknown, input: unknown) {
    const version = validateExpectedVersion(expectedVersion);
    const content: DispatchDraftInput = validateDispatchDraft(input);
    return this.db.transaction(async tx => {
      await requireRole(tx,slug,actor,"edit");
      if (!VALID_SLUG.test(id)) throw new OrganizerAccessError("not_found");
      const result = await tx.query(`UPDATE ff_campaign_dispatch_updates
        SET title=$4, summary=$5, category=$6, version=version+1,
            updated_at=now(), updated_by=$7
        WHERE campaign_slug=$1 AND id=$2 AND version=$3 AND status='draft'
        RETURNING *`, [slug,id,version,content.title,content.summary,content.category,actor.subject]);
      if (!result.rows[0]) throw new OrganizerAccessError("conflict");
      await audit(tx,slug,id,actor,"edit",version,result.rows[0]);
      return Number(result.rows[0].version);
    });
  }

  async setPublication(slug: string, id: string, actor: OrganizerIdentity,
    expectedVersion: unknown, publish: boolean) {
    const version = validateExpectedVersion(expectedVersion);
    return this.db.transaction(async tx => {
      await requireRole(tx,slug,actor,"publish");
      if (!VALID_SLUG.test(id)) throw new OrganizerAccessError("not_found");
      // Publication time is assigned by PostgreSQL, never provided by the browser.
      const result = await tx.query(`UPDATE ff_campaign_dispatch_updates
        SET status=$4, published_at=CASE WHEN $4='published' THEN now() ELSE NULL END,
            updated_at=now(), updated_by=$5, version=version+1
        WHERE campaign_slug=$1 AND id=$2 AND version=$3 AND status <> $4
        RETURNING *`, [slug,id,version,publish ? "published" : "draft",actor.subject]);
      if (!result.rows[0]) throw new OrganizerAccessError("conflict");
      await audit(tx,slug,id,actor,publish ? "publish" : "unpublish",version,result.rows[0]);
      return Number(result.rows[0].version);
    });
  }

  async listEditable(slug: string, actor: OrganizerIdentity) {
    return this.db.transaction(async tx => {
      await requireRole(tx, slug, actor, "edit");
      const rows = await tx.query(`SELECT id,title,summary,category,status,published_at,version,updated_at
        FROM ff_campaign_dispatch_updates WHERE campaign_slug=$1 ORDER BY updated_at DESC,id`, [slug]);
      return rows.rows.map(row => ({ ...row, version: serializeDispatchVersion(row.version) }));
    });
  }
}

/** Public reads cannot expose drafts, unpublished metadata, actor details, or audit records. */
export async function readPublishedDispatch(tx: SqlExecutor, slug: string, asOf: Date): Promise<CampaignUpdate[]> {
  if (!VALID_SLUG.test(slug) || !Number.isFinite(asOf.valueOf())) return [];
  const { rows } = await tx.query(`SELECT id,title,summary,category,published_at
    FROM ff_campaign_dispatch_updates
    WHERE campaign_slug=$1 AND status='published' AND published_at <= $2
    ORDER BY published_at DESC, id ASC LIMIT 50`, [slug, asOf.toISOString()]);
  return rows.map(row => ({
    id: String(row.id), title: String(row.title), summary: String(row.summary),
    category: row.category as CampaignUpdate["category"], status: "published" as const,
    publishedAt: new Date(row.published_at as string).toISOString(),
  }));
}
