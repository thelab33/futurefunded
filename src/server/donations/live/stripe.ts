import "server-only";
import type { LiveCheckoutSettings } from "./config";
import { stripeVersion } from "./config";
import type { GiftInput } from "./protocol";
import { GiftError } from "./protocol";
import type { Campaign } from "@/domain/campaigns/types";
export type StripeCharge={id:string;object:string;livemode:boolean;amount:number;amount_refunded:number;currency:string;paid:boolean;captured:boolean;payment_intent:string};
export type StripeIntent={id:string;object:string;livemode:boolean;amount:number;amount_received:number;currency:string;status:string;metadata:Record<string,string>;latest_charge:StripeCharge|string|null};
export type StripeSession={id:string;object:string;livemode:boolean;mode:string;currency:string;amount_total:number;payment_status:string;status:string;metadata:Record<string,string>;client_reference_id:string;payment_intent:StripeIntent|string|null;url:string|null;expires_at:number};
export async function stripeRequest<T>(s:LiveCheckoutSettings,route:string,form?:string,key?:string):Promise<T>{
  if(!route.startsWith('/v1/')||route.includes('://'))throw new Error('Invalid Stripe route');
  const response=await fetch('https://api.stripe.com'+route,{method:form===undefined?'GET':'POST',headers:{Authorization:'Bearer '+s.key,'Stripe-Version':stripeVersion,...(form===undefined?{}:{'Content-Type':'application/x-www-form-urlencoded'}),...(key?{'Idempotency-Key':key}:{})},body:form,signal:AbortSignal.timeout(8000),cache:'no-store',redirect:'error'});
  if(!response.ok){
    const body=await response.json().catch(()=>null);
    const safe=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_\[\].-]{1,100}$/.test(v)?v:'unspecified';
    console.error('Stripe operation failed: HTTP '+response.status+' code='+safe(body?.error?.code)+' parameter='+safe(body?.error?.param));
    throw new GiftError(503,'checkout_unavailable','Stripe checkout could not be opened. Retry with the same details.');}
  return await response.json() as T;
}
export async function verifyAccount(s:LiveCheckoutSettings){
  const account=await stripeRequest<{id:string;object:string;charges_enabled?:boolean;payouts_enabled?:boolean}>(s,'/v1/account');
  if(account.object!=='account'||account.id!==s.account)throw new Error('Stripe account mismatch');
  return account;
}
// Readiness is required for NEW sessions only. Refund/confirmation processing must
// continue when charges, payouts, or the checkout kill switch are disabled.
export async function verifyLiveReadiness(s:LiveCheckoutSettings){
  const account=await verifyAccount(s);
  if(account.charges_enabled!==true||account.payouts_enabled!==true)throw new Error('Stripe account is not ready');
  const endpoint=await stripeRequest<{id:string;object:string;livemode:boolean;url:string;status:string;api_version:string|null;application:string|null;enabled_events:string[]}>(s,'/v1/webhook_endpoints/'+encodeURIComponent(s.webhookId));
  const required=['checkout.session.completed','checkout.session.expired','payment_intent.succeeded','charge.refunded','refund.created','refund.updated','refund.failed','charge.dispute.created','charge.dispute.updated','charge.dispute.closed'];
  if(endpoint.id!==s.webhookId||endpoint.object!=='webhook_endpoint'||endpoint.livemode!==true||endpoint.url!==s.origin+'/api/donations/webhook'||endpoint.status!=='enabled'||endpoint.api_version!==stripeVersion||endpoint.application!==null||!Array.isArray(endpoint.enabled_events)||!required.every(e=>endpoint.enabled_events.includes('*')||endpoint.enabled_events.includes(e)))throw new Error('Live webhook configuration mismatch');
}
export function checkoutURL(value:unknown):value is string{
  try{if(typeof value!=='string')return false;const url=new URL(value);return url.protocol==='https:'&&url.hostname==='checkout.stripe.com'&&!url.port&&!url.username&&!url.password;}catch{return false;}
}
export function sessionForm(s:LiveCheckoutSettings,campaign:Campaign,gift:GiftInput,id:string,expires:number){
  const p=new URLSearchParams({mode:'payment','payment_method_types[0]':'card','submit_type':'donate',client_reference_id:id,
    success_url:`${s.origin}/c/${campaign.slug}/gift?attempt=${id}&state=returned`,cancel_url:`${s.origin}/c/${campaign.slug}/gift?attempt=${id}&state=cancelled`,expires_at:String(expires),
    'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(gift.amountCents),
    'line_items[0][price_data][product_data][name]':campaign.organization+' · Season gift',
    'line_items[0][price_data][product_data][description]':'One-time gift to the shared season fund.',
    'branding_settings[display_name]':campaign.organization+' · FutureFunded','branding_settings[background_color]':'#fdfcf9','branding_settings[button_color]':'#e9bd68','branding_settings[font_family]':'inter',
    'custom_text[submit][message]':'Your gift supports the shared season fund; impact amounts are examples, not reserved purchases.'});
  // Tenant context is derived server-side, never taken from browser metadata.
  for(const prefix of ['metadata','payment_intent_data[metadata]']){
    for(const [k,v]of Object.entries({ff_attempt:id,ff_tenant:s.tenants[campaign.slug],ff_campaign:campaign.slug,ff_mode:'live',ff_purpose:'shared-season-fund'}))p.set(`${prefix}[${k}]`,v);
  }
  if(gift.donorEmail)p.set('customer_email',gift.donorEmail);
  return p.toString();
}
export function assertSession(value:StripeSession,row:{id:string;tenant_id:string;campaign_slug:string;amount_cents:number},sessionId?:string){
  if(value.object!=='checkout.session'||value.livemode!==true||!/^cs_live_[A-Za-z0-9]+$/.test(value.id)||(sessionId&&value.id!==sessionId)||value.mode!=='payment'||value.currency!=='usd'||value.amount_total!==row.amount_cents||value.client_reference_id!==row.id||value.metadata?.ff_attempt!==row.id||value.metadata?.ff_campaign!==row.campaign_slug||value.metadata?.ff_tenant!==row.tenant_id||value.metadata?.ff_mode!=='live'||value.metadata?.ff_purpose!=='shared-season-fund')throw new Error('Checkout session integrity mismatch');
}
export type PaymentProjection={state:'pending'|'paid'|'expired'|'failed'|'refunded'|'disputed';gross:number;refunded:number;disputed:number;intent:string|null;charge:string|null};
export async function paymentProjection(s:LiveCheckoutSettings,session:StripeSession,row:{id:string;amount_cents:number}) :Promise<PaymentProjection>{
  const empty:PaymentProjection={state:session.status==='expired'?'expired':'pending',gross:0,refunded:0,disputed:0,intent:null,charge:null};
  if(!['open','complete','expired'].includes(session.status)||!['paid','unpaid','no_payment_required'].includes(session.payment_status))throw new Error('Unsupported session state');
  if(session.payment_status!=='paid')return empty;
  const pi=session.payment_intent;
  if(!pi||typeof pi==='string'||pi.object!=='payment_intent'||pi.livemode!==true||!/^pi_[A-Za-z0-9]+$/.test(pi.id)||pi.currency!=='usd'||pi.status!=='succeeded'||pi.amount!==row.amount_cents||pi.amount_received!==row.amount_cents||pi.metadata?.ff_attempt!==row.id||pi.metadata?.ff_mode!=='live'||pi.metadata?.ff_purpose!=='shared-season-fund')throw new Error('Payment intent integrity mismatch');
  const ch=pi.latest_charge;
  if(!ch||typeof ch==='string'||ch.object!=='charge'||ch.livemode!==true||!/^ch_[A-Za-z0-9]+$/.test(ch.id)||!ch.paid||!ch.captured||ch.currency!=='usd'||ch.payment_intent!==pi.id||ch.amount!==row.amount_cents||!Number.isSafeInteger(ch.amount_refunded)||ch.amount_refunded<0||ch.amount_refunded>ch.amount)throw new Error('Charge integrity mismatch');
  const list=await stripeRequest<{object:string;has_more:boolean;data:{id:string;amount:number;currency:string;status:string;livemode:boolean}[]}>(s,'/v1/disputes?charge='+encodeURIComponent(ch.id)+'&limit=100');
  if(list.object!=='list'||list.has_more||!Array.isArray(list.data))throw new Error('Incomplete dispute projection');
  let disputed=0;
  for(const dispute of list.data){
    if(!['won','lost','needs_response','under_review','warning_closed','warning_needs_response','warning_under_review','prevented'].includes(dispute.status)||dispute.livemode!==true||dispute.currency!=='usd'||!Number.isSafeInteger(dispute.amount)||dispute.amount<0)throw new Error('Invalid dispute projection');
    if(!['won','warning_closed','warning_needs_response','warning_under_review','prevented'].includes(dispute.status))disputed+=dispute.amount;
  }
  disputed=Math.min(ch.amount-ch.amount_refunded,disputed);
  const state=ch.amount_refunded===ch.amount?'refunded':disputed>0?'disputed':'paid';
  return {state,gross:ch.amount,refunded:ch.amount_refunded,disputed,intent:pi.id,charge:ch.id};
}
