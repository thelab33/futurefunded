import "server-only";
export type TestCheckoutSettings = { key: string; webhookSecret: string; account: string; origin: string; databaseUrl: string; secret: string; tenants: Record<string,string> };
export const stripeVersion = "2025-09-30.clover";
export function testCheckoutSettings(): TestCheckoutSettings | null {
  try {
    // Deliberately local-development and test-key only. This release cannot enable live payments.
    if (process.env.NODE_ENV === "production" || process.env.FF_TEST_CHECKOUT_ENABLED !== "1") return null;
    const key=process.env.FF_TEST_STRIPE_KEY?.trim() ?? "", webhookSecret=process.env.FF_TEST_STRIPE_WEBHOOK_SECRET?.trim() ?? "";
    const account=process.env.FF_TEST_STRIPE_ACCOUNT ?? "", secret=process.env.FF_TEST_CHECKOUT_SECRET ?? "";
    const origin=new URL(process.env.FF_TEST_CHECKOUT_ORIGIN ?? "");
    if(!/^sk_test_[A-Za-z0-9]+$/.test(key)||!/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)||!/^acct_[A-Za-z0-9]+$/.test(account)||!/^[a-f0-9]{64}$/.test(secret))return null;
    if(origin.protocol!=="http:"||!["127.0.0.1","localhost","[::1]"].includes(origin.hostname)||origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash)return null;
    const databaseUrl=process.env.FF_TEST_CHECKOUT_DATABASE_URL ?? "",db=new URL(databaseUrl);
    if(!["postgres:","postgresql:"].includes(db.protocol)||!db.hostname||!db.pathname.slice(1))return null;
    if(!["127.0.0.1","localhost","[::1]"].includes(db.hostname) && !(db.hostname==="ep-shy-mode-atp5qqux.c-9.us-east-1.aws.neon.tech"&&db.pathname==="/neondb"&&db.searchParams.get("sslmode")==="verify-full"))return null;
    const tenants: Record<string,string>=JSON.parse(process.env.FF_TEST_CHECKOUT_TENANTS ?? "{}");
    const entries=Object.entries(tenants);
    if(!entries.length||entries.length>100||entries.some(([slug,tenant])=>!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug)||typeof tenant!=="string"||!/^[a-z0-9][a-z0-9-]{1,79}$/.test(tenant)))return null;
    return {key,webhookSecret,account,origin:origin.origin,databaseUrl,secret,tenants:Object.assign(Object.create(null),tenants)};
  }catch{return null;}
}
