import {isSandboxEmailRecipient} from "@/server/sandbox-email";
import { z } from "zod";
import { getCampaign } from "@/data/campaigns";
import { newsletterSettings } from "@/server/newsletter-config";
import { newsletterReady, newsletterPool, reserve } from "@/server/newsletter-store";
import { sendConfirmation } from "@/server/newsletter-provider";
import { boundedText, checkOrigin, json, NewsletterInputError } from "@/server/newsletter-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.object({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), campaignSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/), consent: z.literal(true), company: z.string().max(200).default("") }).strict();
const accepted = () => json({ ok: true, pending: true, message: "If this address is eligible, a confirmation email will arrive shortly. Open it to confirm season updates." }, 202);
export async function POST(request: Request) {
  try {
    const settings = newsletterSettings();
    if (!settings) return json({ ok: false, message: "Email signup is not available yet." }, 503);
    checkOrigin(request, settings.origin);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new NewsletterInputError(415, "Expected a JSON request.");
    let body: unknown;
    try { body = JSON.parse(await boundedText(request)); } catch (error) { if (error instanceof NewsletterInputError) throw error; throw new NewsletterInputError(400, "Invalid request."); }
    const parsed = input.safeParse(body);
    if (!parsed.success) throw new NewsletterInputError(400, "Enter a valid email address and agree to receive updates.");
    const { email, campaignSlug, company } = parsed.data;
    const campaign = getCampaign(campaignSlug);
    if (!campaign?.engagement?.newsletter?.enabled || !settings.campaigns[campaignSlug]) throw new NewsletterInputError(404, "Campaign updates are unavailable.");
    if (company || !isSandboxEmailRecipient(email)) return accepted();
    if (!await newsletterReady(campaignSlug)) return json({ ok: false, message: "Email signup is temporarily unavailable." }, 503);
    const reservation = await reserve(settings, campaignSlug, campaign.organization, email);
    if (reservation.accepted === "limited") return json({ ok: false, message: "Please try again later." }, 429);
    if (reservation.accepted === "quiet") return accepted();
    await sendConfirmation(settings, email, campaign.organization, reservation.token, reservation.id);
    await newsletterPool(settings).query("UPDATE ff_newsletter.requests SET mail_accepted=true WHERE id=$1", [reservation.id]);
    return accepted();
  } catch (error) {
    if (error instanceof NewsletterInputError) return json({ ok: false, message: error.message }, error.status);
    console.error("Newsletter signup could not be completed.");
    return json({ ok: false, message: "Unable to send confirmation right now. Please try again later." }, 503);
  }
}
