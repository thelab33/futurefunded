import "server-only";
/** Fail closed: never connect the new application to the operational Neon endpoint. */
export function developmentConnection(name: "FF_M3_AUTH_DATABASE_URL" | "FF_M3_DISPATCH_DATABASE_URL"): string {
  if (process.env.NODE_ENV === "production" || process.env.FF_DEVELOPMENT_STUDIO !== "1") throw new Error("Development access disabled");
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is missing`);
  const parsed = new URL(raw);
  if (!["postgres:","postgresql:"].includes(parsed.protocol) || parsed.hostname !== "ep-shy-mode-atp5qqux.c-9.us-east-1.aws.neon.tech" || parsed.pathname !== "/neondb" || parsed.searchParams.get("sslmode") !== "verify-full") throw new Error("Unapproved development database connection");
  return raw;
}
