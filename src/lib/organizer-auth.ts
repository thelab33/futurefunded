import "server-only";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { Pool } from "pg";
import { Resend } from "resend";
import { developmentConnection } from "@/server/database/development";

export { organizerSubject } from "./organizer-identity";
export function organizerAuthConfigured(): boolean {
  if (process.env.NODE_ENV === "production" || process.env.FF_DEVELOPMENT_STUDIO !== "1") return false;
  const url = process.env.BETTER_AUTH_URL;
  if (url !== "http://127.0.0.1:3355") return false;
  if (process.env.FF_TEST_ORGANIZER_EMAIL?.trim().toLowerCase() !== "arodgps@gmail.com") return false;
  if (!process.env.RESEND_API_KEY || !process.env.FF_M3_FROM_EMAIL || !process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) return false;
  try { developmentConnection("FF_M3_AUTH_DATABASE_URL"); developmentConnection("FF_M3_DISPATCH_DATABASE_URL"); return true; }
  catch { return false; }
}
const cache = globalThis as typeof globalThis & { ffDevAuth?: ReturnType<typeof createAuth> };
function createAuth() {
  const authPool = new Pool({connectionString: developmentConnection("FF_M3_AUTH_DATABASE_URL"), max: 3, connectionTimeoutMillis: 5000, options: "-c search_path=ff_organizer_auth"});
  authPool.on("error", () => console.error("Organizer auth pool connection failed."));
  return betterAuth({
    appName: "FutureFunded Organizer Studio",
    baseURL: "http://127.0.0.1:3355",
    secret: process.env.BETTER_AUTH_SECRET!,
    database: authPool,
    emailAndPassword: {enabled: false},
    plugins: [magicLink({
      expiresIn: 300,
      storeToken: "hashed",
      disableSignUp: false,
      sendMagicLink: async ({email,url}) => {
        // Email allowlist is for account creation; it never grants campaign membership.
        if (email.trim().toLowerCase() !== "arodgps@gmail.com") return;
        const resend = new Resend(process.env.RESEND_API_KEY!);
        const response = await resend.emails.send({
          from: process.env.FF_M3_FROM_EMAIL!, to: [email],
          subject: "Sign in to FutureFunded Organizer Studio",
          text: `Use this secure sign-in link within five minutes: ${url}\nIf you did not request this, ignore it.`,
        });
        if (response.error || !response.data?.id) throw new Error("Organizer sign-in delivery was not accepted.");
      },
    })],
  });
}
export function getOrganizerAuth(): ReturnType<typeof createAuth> {
  if (!organizerAuthConfigured()) throw new Error("Development organizer authentication is not configured.");
  return cache.ffDevAuth ?? (cache.ffDevAuth = createAuth());
}
