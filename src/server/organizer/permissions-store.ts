import { organizerSubject } from "@/lib/organizer-identity";
import type { SqlTransactionRunner } from "@/server/database/sql-client";
export type Role = "owner" | "publisher" | "editor";
export type PermissionInput = { action: "grant" | "change_role" | "remove"; email: string; role?: Role };
export class PermissionError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
/** Internal service: callers must authenticate. Authority is rechecked under the campaign lock. */
export async function mutatePermission(db: SqlTransactionRunner, slug: string, actor: string, input: PermissionInput) {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) || !/^emailsha256:[0-9a-f]{64}$/.test(actor)) {
    throw new PermissionError(403, "Owner access required.");
  }
  const {action, email, role} = input;
  if (!["grant", "change_role", "remove"].includes(action) ||
      (action !== "remove" && !["owner", "publisher", "editor"].includes(role ?? "")) ||
      (action === "remove" && role !== undefined)) throw new PermissionError(422, "Invalid permission request.");
  let target: string;
  try { target = organizerSubject(email); }
  catch { throw new PermissionError(422, "Invalid email address."); }
  return db.transaction(async (tx) => {
      // All membership mutations for this campaign use the same
      // transaction-scoped lock, including final-owner checks.
      await tx.query(
        "SELECT pg_advisory_xact_lock(72401, hashtext($1))",
        [slug]
      );

      // Recheck owner authority inside the protected transaction.
      const authority = await tx.query<{ role: string }>(
        `SELECT role
         FROM ff_organizer_dispatch.ff_campaign_organizer_members
         WHERE campaign_slug=$1 AND actor_subject=$2`,
        [slug, actor]
      );

      if (authority.rows[0]?.role !== "owner") {
        throw new PermissionError(403, "Owner access required.");
      }

      // Resolve verified identity before any membership write.
      // Never trust an email address alone as proof of enrollment.
      const users = await tx.query<{ email: string }>(
        `SELECT email
         FROM ff_organizer_auth."user"
         WHERE lower(email)=lower($1)
           AND "emailVerified"=true
         LIMIT 2`,
        [email.trim().toLowerCase().normalize("NFC")]
      );

      if (
        users.rows.length !== 1 ||
        organizerSubject(users.rows[0].email) !== target
      ) {
        throw new PermissionError(
          422,
          "An existing verified organizer account is required."
        );
      }

      const current = await tx.query<{ role: Role }>(
        `SELECT role
         FROM ff_organizer_dispatch.ff_campaign_organizer_members
         WHERE campaign_slug=$1 AND actor_subject=$2`,
        [slug, target]
      );

      const previous = current.rows[0]?.role ?? null;
      const nextRole = action === "remove" ? null : role as Role;

      if (action === "grant" && previous !== null) {
        throw new PermissionError(409, "Organizer already has access.");
      }
      if (action !== "grant" && previous === null) {
        throw new PermissionError(404, "Organizer membership not found.");
      }
      if (previous === nextRole) {
        throw new PermissionError(409, "The role is already assigned.");
      }

      if (previous === "owner" && nextRole !== "owner") {
        const owners = await tx.query<{ total: string }>(
          `SELECT count(*)::text AS total
           FROM ff_organizer_dispatch.ff_campaign_organizer_members
           WHERE campaign_slug=$1 AND role='owner'`,
          [slug]
        );

        if (Number(owners.rows[0]?.total) <= 1) {
          throw new PermissionError(
            409,
            "The last campaign owner cannot be removed or demoted."
          );
        }
      }

      if (action === "grant") {
        await tx.query(
          `INSERT INTO ff_organizer_dispatch.ff_campaign_organizer_members
           (campaign_slug, actor_subject, role, granted_by)
           VALUES ($1,$2,$3,$4)`,
          [slug, target, nextRole, actor]
        );
      } else if (action === "change_role") {
        await tx.query(
          `UPDATE ff_organizer_dispatch.ff_campaign_organizer_members
           SET role=$3, granted_by=$4, granted_at=now()
           WHERE campaign_slug=$1 AND actor_subject=$2`,
          [slug, target, nextRole, actor]
        );
      } else {
        await tx.query(
          `DELETE FROM ff_organizer_dispatch.ff_campaign_organizer_members
           WHERE campaign_slug=$1 AND actor_subject=$2`,
          [slug, target]
        );
      }

      await tx.query(
        `INSERT INTO ff_organizer_dispatch.ff_campaign_membership_audit
         (campaign_slug, actor_subject, target_subject,
          action, previous_role, new_role)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [slug, actor, target, action, previous, nextRole]
      );

      return { action, role: nextRole };
    });

}
