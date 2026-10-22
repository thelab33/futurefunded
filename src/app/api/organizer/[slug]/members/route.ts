import { organizerSubject } from "@/lib/organizer-auth";
import { requireOrganizerPrincipal } from "@/server/organizer/studio-session";
import { getOrganizerDispatchDatabase } from "@/server/organizer/dispatch-database";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ slug: string }>;
};

const VALID_SLUG = /^[a-z0-9][a-z0-9-]{1,79}$/;

export async function GET(_request: Request, context: Context) {
  const { slug } = await context.params;

  if (!VALID_SLUG.test(slug)) {
    return Response.json({ error: "Invalid campaign." }, { status: 400 });
  }

  try {
    const principal = await requireOrganizerPrincipal(slug);

    if (!principal) {
      return Response.json({ error: "Access denied." }, { status: 403 });
    }

    if (principal.role !== "owner") {
      return Response.json(
        { error: "Owner permission required." },
        { status: 403 }
      );
    }

    const db = getOrganizerDispatchDatabase();

    const { rows } = await db.executor.query<{
      actor_subject: string;
      role: string;
    }>(
      `SELECT actor_subject, role
       FROM ff_campaign_organizer_members
       WHERE campaign_slug = $1
       ORDER BY granted_at ASC, actor_subject ASC`,
      [slug]
    );

    // Resolve account identities in application code using the same normalizer
    // as authentication; avoid relying on database crypto extensions.
    const { rows: users } = await db.executor.query<{
      email: string;
    }>(
      `SELECT email FROM ff_organizer_auth."user"
       WHERE "emailVerified" = true`
    );
    const verified = new Map<string, string | null>();
    for (const user of users) {
      try {
        const subject = organizerSubject(user.email);
        verified.set(subject, verified.has(subject) ? null : user.email);
      }
      catch { /* A malformed external account never enters the directory. */ }
    }

    const members = rows.map((row, index) => {
      const email = verified.get(row.actor_subject) ?? null;
      const isCurrentUser = row.actor_subject === principal.actor.subject;
      return {
        label: isCurrentUser ? "You" : email ?? `Unresolved organizer ${index + 1}`,
        email,
        role: row.role,
        isCurrentUser,
        access: "active",
        manageable: email !== null,
      };
    });

    return Response.json(
      { members, currentRole: principal.role },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { error: "Organizer directory unavailable." },
      { status: 503 }
    );
  }
}
