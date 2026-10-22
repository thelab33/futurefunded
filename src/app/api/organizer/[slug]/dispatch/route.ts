import { getOrganizerDispatchDatabase } from "@/server/organizer/dispatch-database";
import { OrganizerDispatchStore } from "@/server/organizer/dispatch-store";
import { authorizeStudio, parseMutation, studioError, studioResponse } from "@/server/organizer/studio-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
export async function GET(_request: Request, context: Context) {
  const { slug } = await context.params;
  try {
    const { principal, error } = await authorizeStudio(slug);
    if (error || !principal) return error!;
    const store = new OrganizerDispatchStore(getOrganizerDispatchDatabase());
    return studioResponse({ entries: await store.listEditable(slug, principal.actor), role: principal.role });
  } catch (error) { return studioError(error); }
}
export async function POST(request: Request, context: Context) {
  const { slug } = await context.params;
  const input = await parseMutation(request);
  if (!input) return studioResponse({ error: "Invalid or cross-origin request." }, 400);
  try {
    const { principal, error } = await authorizeStudio(slug);
    if (error || !principal) return error!;
    const store = new OrganizerDispatchStore(getOrganizerDispatchDatabase());
    const id = await store.createDraft(slug, principal.actor, input);
    return studioResponse({ id }, 201);
  } catch (error) { return studioError(error); }
}
