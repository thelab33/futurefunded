import { toNextJsHandler } from "better-auth/next-js";
import { getOrganizerAuth, organizerAuthConfigured } from "@/lib/organizer-auth";
import { studioResponse } from "@/server/organizer/studio-http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!organizerAuthConfigured()) return studioResponse({ error: "Organizer sign-in is not enabled." }, 503);
  return toNextJsHandler(getOrganizerAuth()).GET(request);
}
export async function POST(request: Request) {
  if (!organizerAuthConfigured()) return studioResponse({ error: "Organizer sign-in is not enabled." }, 503);
  return toNextJsHandler(getOrganizerAuth()).POST(request);
}
