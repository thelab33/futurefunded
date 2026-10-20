import "server-only";
import { headers } from "next/headers";
import { getOrganizerAuth, organizerAuthConfigured, organizerSubject } from "@/lib/organizer-auth";
import { getOrganizerDispatchDatabase } from "./dispatch-database";
import type { OrganizerIdentity, OrganizerRole } from "./dispatch-store";

export type StudioPrincipal = { actor: OrganizerIdentity; role: OrganizerRole; email: string };
const VALID_CAMPAIGN = /^[a-z0-9][a-z0-9-]{1,79}$/;
export async function requireOrganizerPrincipal(slug: string): Promise<StudioPrincipal | null> {
  if (!VALID_CAMPAIGN.test(slug) || !organizerAuthConfigured()) return null;
  const session = await getOrganizerAuth().api.getSession({ headers: await headers() });
  if (!session?.user || session.user.emailVerified !== true) return null;
  const email = session.user.email.trim().toLowerCase();
  const actor = { subject: organizerSubject(email) };
  const db = getOrganizerDispatchDatabase();
  const { rows } = await db.executor.query<{role: OrganizerRole}>(
    `SELECT role FROM ff_campaign_organizer_members WHERE campaign_slug=$1 AND actor_subject=$2`,
    [slug, actor.subject],
  );
  const role = rows[0]?.role;
  if (!role || !["owner", "publisher", "editor"].includes(role)) return null;
  return { actor, role, email };
}
