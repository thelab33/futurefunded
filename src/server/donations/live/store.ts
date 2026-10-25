import "server-only";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { Campaign } from "@/domain/campaigns/types";
import { liveCheckoutSettings, type LiveCheckoutSettings } from "./config";
import type {PublicGivingDetails} from "@/domain/campaigns/payment-presentation";
import {publicGivingDetails} from "./public";
import { GiftError, hash, type GiftInput } from "./protocol";
import { assertSession, checkoutURL, paymentProjection, sessionForm, stripeRequest, verifyAccount, verifyLiveReadiness, type StripeSession } from "./stripe";
export type GiftRow={id:string;tenant_id:string;campaign_slug:string;stripe_account:string;details_hash:string;amount_cents:number;origin:string;stripe_form:string;created_at:Date;expires_at:Date;stripe_session_id:string|null;checkout_url:string|null;payment_intent_id:string|null;charge_id:string|null;state:string;gross_cents:number;refunded_cents:number;disputed_cents:number;verified_at:Date|null};
const cache=globalThis as typeof globalThis & {ffLiveGiftPool?:{url:string;pool:Pool}};
export function giftPool(s:LiveCheckoutSettings){
  if(cache.ffLiveGiftPool?.url!==s.databaseUrl){
    if(cache.ffLiveGiftPool)throw new Error('Live ledger database changed; restart required');
    const pool=new Pool({connectionString:s.databaseUrl,max:4,connectionTimeoutMillis:5000,statement_timeout:15000,idle_in_transaction_session_timeout:60000});
    pool.on('error',()=>console.error('Donation database connection failed.'));
    cache.ffLiveGiftPool={url:s.databaseUrl,pool};
  }return cache.ffLiveGiftPool.pool;
}
export async function inTransaction<T>(pool:Pool,work:(db:PoolClient)=>Promise<T>):Promise<T>{
  const db=await pool.connect();try{await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");const result=await work(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
async function limit(db:PoolClient,key:string,max:number){
  const r=await db.query<{hits:number}>(`INSERT INTO ff_donations_live.rate_limits(key,starts_at,hits) VALUES($1,date_trunc('hour',now()),1)
  ON CONFLICT(key) DO UPDATE SET starts_at=EXCLUDED.starts_at,hits=CASE WHEN ff_donations_live.rate_limits.starts_at=EXCLUDED.starts_at THEN LEAST(ff_donations_live.rate_limits.hits+1,10000) ELSE 1 END RETURNING hits`,[key]);return r.rows[0].hits<=max;
}
export async function liveCheckoutContext(slug:string):Promise<{ready:boolean;funding:{raised:number;gifts:number}|null;details?:PublicGivingDetails|null}>{
  const s=liveCheckoutSettings(false);if(!s?.tenants[slug])return {ready:false,funding:null};
  try{
    await verifyAccount(s);
    const r=await giftPool(s).query<{net_cents:string;gifts:string;launch_approved:boolean;recipient_label:string}>(`SELECT COALESCE(t.net_cents,0)::text AS net_cents,COALESCE(t.gifts,0)::text AS gifts,c.launch_approved,c.recipient_label FROM ff_donations_live.campaigns c
    JOIN ff_donations_live.schema_version v ON v.version=1 LEFT JOIN ff_donations_live.campaign_totals t USING(tenant_id,campaign_slug)
    WHERE c.tenant_id=$1 AND c.campaign_slug=$2 AND c.stripe_account=$3 AND length(c.recipient_label)>0`,[s.tenants[slug],slug,s.account]);
    if(r.rowCount!==1)return {ready:false,funding:null};
    const cents=Number(r.rows[0].net_cents),gifts=Number(r.rows[0].gifts);
    if(!Number.isSafeInteger(cents)||!Number.isSafeInteger(gifts)||cents<0||gifts<0||(cents>0)!==(gifts>0))throw new Error('Invalid funding projection');
    let ready=false;
    const details=publicGivingDetails();
    if(liveCheckoutSettings(true)&&r.rows[0].launch_approved&&details?.recipientName===r.rows[0].recipient_label){
      try{await verifyLiveReadiness(s);ready=true;}catch{/* Keep verified historical funds visible while new gifts are closed. */}
    }
    return {ready,funding:{raised:cents/100,gifts},details:details?.recipientName===r.rows[0].recipient_label?details:null};
  }catch{return {ready:false,funding:null};}
}
export async function reserveGift(s:LiveCheckoutSettings,campaign:Campaign,gift:GiftInput){
  const tenant=s.tenants[campaign.slug],candidate=randomUUID(),expires=Math.floor(Date.now()/1000)+3600;
  const {requestToken,...details}=gift;const digest=hash(JSON.stringify(details));
  const result=await inTransaction(giftPool(s),async db=>{
    const registered=await db.query('SELECT 1 FROM ff_donations_live.campaigns WHERE tenant_id=$1 AND campaign_slug=$2 AND stripe_account=$3 AND launch_approved AND recipient_label=$4',[tenant,campaign.slug,s.account,publicGivingDetails()?.recipientName??'']);
    if(!registered.rowCount)throw new GiftError(503,'checkout_not_configured','Checkout is not configured.');
    // Shared quota first: consistent lock order across all campaign/session requests.
    if(!await limit(db,'checkout:global',120)||!await limit(db,'checkout:'+tenant,60))return null;
    await db.query(`INSERT INTO ff_donations_live.attempts(id,tenant_id,campaign_slug,stripe_account,request_token,details_hash,amount_cents,donor_name,donor_email,anonymous,origin,stripe_form,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,to_timestamp($13)) ON CONFLICT(tenant_id,campaign_slug,request_token) DO NOTHING`,
      [candidate,tenant,campaign.slug,s.account,requestToken,digest,gift.amountCents,gift.donorName,gift.donorEmail,gift.anonymous,s.origin,sessionForm(s,campaign,gift,candidate,expires),expires]);
    const row=(await db.query<GiftRow>('SELECT * FROM ff_donations_live.attempts WHERE tenant_id=$1 AND campaign_slug=$2 AND request_token=$3 FOR UPDATE',[tenant,campaign.slug,requestToken])).rows[0];
    if(!row||row.stripe_account!==s.account||row.origin!==s.origin||row.details_hash!==digest)throw new GiftError(409,'request_conflict','The previous request has different details. Restore them before retrying.');
    return row;
  });
  if(!result)throw new GiftError(429,'checkout_rate_limited','Checkout is busy. Please try again later.');
  return result;
}
export async function bindSession(s:LiveCheckoutSettings,row:GiftRow,session:StripeSession){
  assertSession(session,row);
  if(session.status!=='open'||!checkoutURL(session.url)||!Number.isSafeInteger(session.expires_at))throw new Error('Invalid open checkout');
  return inTransaction(giftPool(s),async db=>{
    const current=(await db.query<GiftRow>('SELECT * FROM ff_donations_live.attempts WHERE id=$1 FOR UPDATE',[row.id])).rows[0];
    if(!current||current.tenant_id!==row.tenant_id||current.stripe_account!==s.account||(current.stripe_session_id&&current.stripe_session_id!==session.id))throw new Error('Checkout binding mismatch');
    await db.query('UPDATE ff_donations_live.attempts SET stripe_session_id=$2,checkout_url=$3,expires_at=to_timestamp($4) WHERE id=$1',[row.id,session.id,session.url,session.expires_at]);
  });
}
export async function giftStatus(s:LiveCheckoutSettings,slug:string,id:string){
  const row=(await giftPool(s).query<GiftRow>('SELECT * FROM ff_donations_live.attempts WHERE tenant_id=$1 AND campaign_slug=$2 AND stripe_account=$3 AND id=$4',[s.tenants[slug],slug,s.account,id])).rows[0];
  if(!row)return null;
  const expired=row.state==='pending'&&row.expires_at.getTime()<=Date.now();
  return {id:row.id,campaign:row.campaign_slug,state:expired?'expired':row.state,amountCents:row.amount_cents,refundedCents:row.refunded_cents,disputedCents:row.disputed_cents,verified:Boolean(row.verified_at),
    resumeURL:row.state==='pending'&&!expired&&checkoutURL(row.checkout_url)?row.checkout_url:null};
}
export const supportedEvents=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','payment_intent.succeeded','charge.refunded','refund.created','refund.updated','refund.failed','charge.dispute.created','charge.dispute.updated','charge.dispute.closed']);
export async function processGiftEvent(s:LiveCheckoutSettings,event:{id:string;type:string;data:{object:{id:string;metadata?:Record<string,string>;payment_intent?:string;object?:string}}}){
  if(!supportedEvents.has(event.type))return 'ignored';
  const object=event.data.object;
  let candidate=object.metadata?.ff_attempt;
  if(!candidate&&typeof object.payment_intent==='string'&&/^pi_[A-Za-z0-9]+$/.test(object.payment_intent)){
    const row=(await giftPool(s).query<{id:string}>('SELECT id FROM ff_donations_live.attempts WHERE stripe_account=$1 AND payment_intent_id=$2',[s.account,object.payment_intent])).rows[0];
    candidate=row?.id;
    if(!candidate){const intent=await stripeRequest<{metadata?:Record<string,string>}>(s,'/v1/payment_intents/'+encodeURIComponent(object.payment_intent));candidate=intent.metadata?.ff_attempt;}
  }
  if(!candidate||!/^[a-f0-9-]{36}$/i.test(candidate))return 'ignored';
  return inTransaction(giftPool(s),async db=>{
    // A row lock serializes snapshot retrieval as well as writes. Older event delivery cannot overwrite a newer projection.
    const row=(await db.query<GiftRow>('SELECT * FROM ff_donations_live.attempts WHERE id=$1 AND stripe_account=$2 FOR UPDATE',[candidate,s.account])).rows[0];
    if(!row||s.tenants[row.campaign_slug]!==row.tenant_id)return 'ignored';
    const prior=await db.query<{event_type:string;object_id:string}>('SELECT event_type,object_id FROM ff_donations_live.events WHERE stripe_account=$1 AND event_id=$2',[s.account,event.id]);
    if(prior.rowCount){if(prior.rows[0].event_type!==event.type||prior.rows[0].object_id!==object.id)throw new Error('Event identity mismatch');return 'duplicate';}
    const isSession=event.type.startsWith('checkout.session.');
    const sessionId=row.stripe_session_id??(isSession&&/^cs_live_[A-Za-z0-9]+$/.test(object.id)?object.id:null);
    if(!sessionId)throw new Error('Checkout binding pending; retry event');
    if(isSession&&object.id!==sessionId)throw new Error('Event session mismatch');
    const session=await stripeRequest<StripeSession>(s,'/v1/checkout/sessions/'+encodeURIComponent(sessionId)+'?expand%5B%5D=payment_intent.latest_charge');
    assertSession(session,row,sessionId);
    const projection=await paymentProjection(s,session,row);
    if(row.gross_cents>0&&projection.gross===0)throw new Error('Refusing paid-state regression');
    if(event.type==='checkout.session.async_payment_failed'&&projection.gross===0)projection.state='failed';
    await db.query(`UPDATE ff_donations_live.attempts SET stripe_session_id=$2,payment_intent_id=$3,charge_id=$4,state=$5,gross_cents=$6,refunded_cents=$7,disputed_cents=$8,verified_at=now() WHERE id=$1`,
      [row.id,sessionId,projection.intent,projection.charge,projection.state,projection.gross,projection.refunded,projection.disputed]);
    await db.query('INSERT INTO ff_donations_live.events(stripe_account,event_id,event_type,object_id,attempt_id) VALUES($1,$2,$3,$4,$5)',[s.account,event.id,event.type,object.id,row.id]);
    return 'processed';
  });
}
