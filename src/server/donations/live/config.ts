import "server-only";
import {publicGivingDetails} from "./public";
/** Direct-account pilot: one campaign, one verified recipient; no Connect routing. */
export type LiveCheckoutSettings = { key:string; webhookSecret:string; account:string; origin:string; databaseUrl:string; secret:string; tenants:Record<string,string>; webhookId:string };
export const stripeVersion = "2025-09-30.clover";
export const liveOrigin = "https://getfuturefunded.com";
export function liveCheckoutSettings(requireEnabled=false):LiveCheckoutSettings|null {
  try {
    if(process.env.NODE_ENV!=="production" || process.env.VERCEL_ENV!=="production")return null;
    if(requireEnabled && (process.env.FF_LIVE_CHECKOUT_ENABLED!=="1" || process.env.FF_LIVE_CHECKOUT_RELEASE!=="connect-atx-elite-v1" || !publicGivingDetails()))return null;
    const key=process.env.FF_LIVE_STRIPE_KEY?.trim()??"",webhookSecret=process.env.FF_LIVE_STRIPE_WEBHOOK_SECRET?.trim()??"";
    const account=process.env.FF_LIVE_STRIPE_ACCOUNT??"",secret=process.env.FF_LIVE_CHECKOUT_SECRET??"",webhookId=process.env.FF_LIVE_STRIPE_WEBHOOK_ID??"";
    if(!/^sk_live_[A-Za-z0-9]+$/.test(key)||!/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)||!/^acct_[A-Za-z0-9]+$/.test(account)||!/^we_[A-Za-z0-9]+$/.test(webhookId)||!/^[a-f0-9]{64}$/.test(secret))return null;
    if(process.env.FF_LIVE_CHECKOUT_ORIGIN!==liveOrigin)return null;
    const databaseUrl=process.env.FF_LIVE_CHECKOUT_DATABASE_URL??"",db=new URL(databaseUrl);
    if(!["postgres:","postgresql:"].includes(db.protocol)||!db.hostname||!db.username||!db.password||!db.pathname.slice(1)||db.hash||db.searchParams.get('sslmode')!=="verify-full")return null;
    if(["localhost","127.0.0.1","[::1]"].includes(db.hostname)||db.searchParams.has('ssl')||db.searchParams.has('uselibpqcompat'))return null;
    const tenants=JSON.parse(process.env.FF_LIVE_CHECKOUT_TENANTS??"{}");
    if(!tenants||typeof tenants!=="object"||Array.isArray(tenants))return null;
    const entries=Object.entries(tenants);
    if(entries.length!==1||entries[0][0]!=="connect-atx-elite"||typeof entries[0][1]!=="string"||!/^[a-z0-9][a-z0-9-]{1,79}$/.test(entries[0][1]))return null;
    return {key,webhookSecret,account,origin:liveOrigin,databaseUrl,secret,tenants:Object.assign(Object.create(null),tenants),webhookId};
  }catch{return null;}
}
