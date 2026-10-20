import "server-only";
import { NextResponse } from "next/server";
import { organizerAuthConfigured } from "@/lib/organizer-auth";
import { requireOrganizerPrincipal } from "./studio-session";
import { OrganizerAccessError } from "./dispatch-store";
import { DispatchValidationError } from "@/domain/organizer/dispatch-rules";

export function studioResponse(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function authorizeStudio(slug: string) {
  if (!organizerAuthConfigured()) return { principal: null, error: studioResponse({ error: "Studio is not configured." }, 503) };
  const principal = await requireOrganizerPrincipal(slug);
  if (!principal) return { principal: null, error: studioResponse({ error: "Access denied." }, 403) };
  return { principal, error: null };
}
export function requireSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const configured = process.env.BETTER_AUTH_URL;
  if (!origin || !configured) return false;
  try { return new URL(origin).origin === new URL(configured).origin; }
  catch { return false; }
}
export async function parseMutation(request: Request): Promise<Record<string, unknown> | null> {
  if (!requireSameOrigin(request)) return null;
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 8192) return null;
  const raw = await request.text();
  if (raw.length > 8192) return null;
  try {
    const object: unknown = JSON.parse(raw);
    return object && typeof object === "object" && !Array.isArray(object) ? object as Record<string, unknown> : null;
  } catch { return null; }
}
export function studioError(error: unknown) {
  if (error instanceof DispatchValidationError) return studioResponse({ error: error.message, field: error.field }, 422);
  if (error instanceof OrganizerAccessError) {
    return studioResponse({ error: error.code === "conflict" ? "Update changed. Refresh and try again." : "Access denied." },
      error.code === "conflict" ? 409 : error.code === "forbidden" ? 403 : 404);
  }
  console.error("Organizer operation failed; details withheld from the client.");
  return studioResponse({ error: "The operation could not be completed." }, 503);
}
