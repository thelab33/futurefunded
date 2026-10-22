import { getOrganizerDispatchDatabase } from "@/server/organizer/dispatch-database";
import { requireOrganizerPrincipal } from "@/server/organizer/studio-session";
import { parseMutation, studioResponse } from "@/server/organizer/studio-http";
import { mutatePermission, PermissionError, type PermissionInput } from "@/server/organizer/permissions-store";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const { slug } = await context.params;
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug)) return studioResponse({ error: "Invalid campaign." }, 400);
    if (process.env.NODE_ENV !== "development" || process.env.FF_DEVELOPMENT_STUDIO !== "1") {
      return studioResponse({ error: "Management unavailable." }, 503);
    }
    const principal = await requireOrganizerPrincipal(slug);
    if (!principal || principal.role !== "owner") return studioResponse({ error: "Owner access required." }, 403);
    const input = await parseMutation(request);
    if (!input) return studioResponse({ error: "Invalid request." }, 400);
    const {action, email, role} = input;
    const allowed = action === "remove" ? ["action", "email"] : ["action", "email", "role"];
    if (Object.keys(input).some(key => !allowed.includes(key)) ||
        !["grant", "change_role", "remove"].includes(String(action)) ||
        typeof action !== "string" || typeof email !== "string" || email.length > 254 ||
        (action !== "remove" && (typeof role !== "string" || !["owner", "publisher", "editor"].includes(role)))) {
      return studioResponse({ error: "Invalid permission request." }, 422);
    }
    const result = await mutatePermission(getOrganizerDispatchDatabase(), slug, principal.actor.subject, input as PermissionInput);
    return studioResponse({ success: true, ...result });
  } catch (error) {
    if (error instanceof PermissionError) return studioResponse({ error: error.message }, error.status);
    console.error("Organizer permission operation failed.");
    return studioResponse({ error: "Permission change could not be completed." }, 503);
  }
}
