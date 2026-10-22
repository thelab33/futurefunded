import { newsletterSettings } from "@/server/newsletter-config";
import { confirm } from "@/server/newsletter-store";
import { ProviderError, subscribeContact } from "@/server/newsletter-provider";
import { boundedText, checkOrigin, confirmationPage, NewsletterInputError, tokenValid } from "@/server/newsletter-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!newsletterSettings()) return confirmationPage("Updates are unavailable.", "Please return to the campaign and try again later.", undefined, undefined, 503);
  if (!tokenValid(token)) return confirmationPage("This link is invalid.", "Request a fresh confirmation from the campaign.", undefined, undefined, 400);
  // Reading an email link never subscribes anyone. Mail scanners cannot opt a recipient in by issuing GET.
  return confirmationPage("Confirm season updates.", "Confirm that you want to receive the campaign updates you requested. You can unsubscribe from future updates anytime.", token);
}
export async function POST(request: Request) {
  let stage: "request" | "database" | "provider" = "request";
  try {
    const settings = newsletterSettings();
    if (!settings) return confirmationPage("Updates are unavailable.", "Please try again later.", undefined, undefined, 503);
    checkOrigin(request, settings.origin);
    if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new NewsletterInputError(415, "Invalid confirmation request.");
    const token = new URLSearchParams(await boundedText(request)).get("token");
    if (!tokenValid(token)) throw new NewsletterInputError(400, "Request a fresh confirmation from the campaign.");
    stage = "database";
    const result = await confirm(settings, token, async (email, slug) => {
      stage = "provider";
      const outcome = await subscribeContact(settings, email, slug);
      stage = "database";
      return outcome;
    });
    if (result.kind === "limited") return confirmationPage("Please try again later.", "Confirmation is temporarily busy.", undefined, undefined, 429);
    if (result.kind === "invalid") return confirmationPage("This link has expired.", "Request a fresh confirmation from the campaign.", undefined, undefined, 400);
    if (result.kind === "already-confirmed") return confirmationPage("Already confirmed.", "This link was used earlier. Your current email preferences have not been changed.", undefined, result.slug);
    if (result.kind === "suppressed") return confirmationPage("Your preferences are preserved.", "This email address has opted out of updates. We have kept that choice and have not reactivated it.", undefined, result.slug);
    return confirmationPage("You’re subscribed.", "Your email is confirmed for this campaign’s season updates. You can unsubscribe from future updates anytime.", undefined, result.slug);
  } catch (error) {
    if (error instanceof NewsletterInputError) return confirmationPage("Unable to confirm.", error.message, undefined, undefined, error.status);
    // Only fixed operation labels and bounded codes: never raw errors, addresses, paths, tokens or credentials.
    if (error instanceof ProviderError) {
      console.error(`Newsletter confirmation failed: provider operation=${error.operation} status=${error.status} reason=${error.reason}`);
    } else {
      const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : "unclassified";
      const kind = error instanceof TypeError ? "type-error" : error instanceof ReferenceError ? "reference-error" : "error";
      console.error(`Newsletter confirmation failed: stage=${stage} code=${code} kind=${kind}`);
    }
    return confirmationPage("Please try again.", "We could not complete confirmation. Return to your email link and try again shortly.", undefined, undefined, 503);
  }
}
