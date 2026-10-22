import { getOrganizerDispatchDatabase } from "@/server/organizer/dispatch-database";
import { OrganizerDispatchStore } from "@/server/organizer/dispatch-store";
import { authorizeStudio, parseMutation, studioError, studioResponse } from "@/server/organizer/studio-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string; id: string }> };
export async function PATCH(request: Request, context: Context) {
  const { slug, id } = await context.params;
  const input = await parseMutation(request);
  if (!input) return studioResponse({ error: "Invalid or cross-origin request." }, 400);
  try {
    const { principal, error } = await authorizeStudio(slug);
    if (error || !principal) return error!;
    const store = new OrganizerDispatchStore(getOrganizerDispatchDatabase());
    const version = await store.editDraft(slug, id, principal.actor, input.version, input);
    return studioResponse({ version });
  } catch (error) { return studioError(error); }
}
export async function POST(request: Request, context: Context) {
  const { slug, id } = await context.params;
  const input = await parseMutation(request);
  if (!input || (input.action !== "publish" && input.action !== "unpublish"))
    return studioResponse({ error: "Invalid or cross-origin request." }, 400);
  try {
    const { principal, error } = await authorizeStudio(slug);
    if (error || !principal) return error!;
    if (principal.role === "editor") return studioResponse({ error: "Publisher permission is required." }, 403);
    const store = new OrganizerDispatchStore(getOrganizerDispatchDatabase());
    const version = await store.setPublication(slug, id, principal.actor, input.version, input.action === "publish");
    return studioResponse({ version });
  } catch (error) { return studioError(error); }
}
