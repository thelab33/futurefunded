import "server-only";
import type { NewsletterSettings } from "./newsletter-config";

type Operation = "contact-lookup" | "contact-create" | "contact-shape" | "topic-opt-in" | "segment-add" | "email-send" | "provider-read";
export class ProviderError extends Error {
  constructor(public status: number, public operation: Operation = "provider-read", public reason: "http" | "network" | "timeout" | "response" = "http") { super("Newsletter provider unavailable."); }
}
function operationFor(path: string, method: string): Operation {
  if (path === "/emails") return "email-send";
  if (path === "/contacts" && method === "POST") return "contact-create";
  if (path.includes("/topics") && method === "PATCH") return "topic-opt-in";
  if (path.includes("/segments/") && method === "POST") return "segment-add";
  if (path.startsWith("/contacts/")) return "contact-lookup";
  return "provider-read";
}
function retryDelay(value: string | null, attempt: number): number {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000) + 100;
    const time = Date.parse(value);
    if (Number.isFinite(time)) return Math.max(0, time - Date.now()) + 100;
  }
  return 1100 * (attempt + 1);
}
async function wait(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Provider deadline reached.");
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error("Provider deadline reached.")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export async function resendRequest(settings: NewsletterSettings, path: string, method = "GET", body?: unknown, idempotency?: string, deadline?: AbortSignal): Promise<Record<string, unknown>> {
  const operation = operationFor(path, method);
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    const signal = deadline ? AbortSignal.any([deadline, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000);
    try {
      response = await fetch(`https://api.resend.com${path}`, { method, headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json", ...(idempotency ? { "Idempotency-Key": idempotency } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal, cache: "no-store", redirect: "error" });
    } catch { throw new ProviderError(signal.aborted ? 504 : 503, operation, signal.aborted ? "timeout" : "network"); }
    if (response.status === 429 && attempt < 2) {
      const delay = retryDelay(response.headers.get("retry-after"), attempt);
      // Respect longer provider windows by failing safely, rather than retrying before the requested time.
      if (delay > 10000) throw new ProviderError(429, operation);
      await response.body?.cancel().catch(() => {});
      try { await wait(delay, deadline); } catch { throw new ProviderError(504, operation, "timeout"); }
      continue;
    }
    if (!response.ok) throw new ProviderError(response.status, operation);
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new ProviderError(signal.aborted ? 504 : 502, operation, signal.aborted ? "timeout" : "response"); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new ProviderError(502, operation, "response");
    return data as Record<string, unknown>;
  }
  throw new ProviderError(429, operation);
}
export async function sendConfirmation(settings: NewsletterSettings, email: string, organization: string, token: string, id: string) {
  const url = `${settings.origin}/api/newsletter/confirm?token=${token}`;
  const result = await resendRequest(settings, "/emails", "POST", { from: settings.from, to: [email], subject: `Confirm ${organization} season updates`, text: `You requested occasional campaign updates from ${organization}.\n\nConfirm your email within 24 hours:\n${url}\n\nThe page will ask you to confirm before subscribing. If you did not request this, ignore this email. You have not been subscribed.`, }, `ff-newsletter-${id}`);
  if (typeof result.id !== "string") throw new ProviderError(502, "email-send", "response");
}
export async function subscribeContact(settings: NewsletterSettings, email: string, slug: string): Promise<"subscribed" | "suppressed"> {
  const ids = settings.campaigns[slug];
  if (!ids) throw new Error("Unknown newsletter campaign.");
  const deadline = AbortSignal.timeout(30000);
  const call = (path: string, method = "GET", body?: unknown) => resendRequest(settings, path, method, body, undefined, deadline);
  let contact: Record<string, unknown>;
  try { contact = await call(`/contacts/${encodeURIComponent(email)}`); }
  catch (error) {
    if (!(error instanceof ProviderError) || error.status !== 404) throw error;
    try { await call("/contacts", "POST", { email }); }
    catch (createError) { if (!(createError instanceof ProviderError) || createError.status !== 409) throw createError; }
    contact = await call(`/contacts/${encodeURIComponent(email)}`);
  }
  if (typeof contact.id !== "string" || typeof contact.unsubscribed !== "boolean") throw new ProviderError(502, "contact-shape", "response");
  if (contact.unsubscribed) return "suppressed";
  const path = `/contacts/${encodeURIComponent(contact.id)}`;
  // Existing unsubscribe protection and campaign-only mutations are preserved.
  await call(`${path}/topics`, "PATCH", [{ id: ids.topic, subscription: "opt_in" }]);
  await call(`${path}/segments/${ids.segment}`, "POST");
  return "subscribed";
}
