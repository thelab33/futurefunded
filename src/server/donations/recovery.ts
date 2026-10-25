import "server-only";
import type {TestCheckoutSettings} from "./config";
import {GiftError} from "./protocol";
import {giftPool,bindSession,type GiftRow} from "./store";
import {checkoutURL,stripeRequest,verifyAccount,type StripeSession} from "./stripe";
/** Retry only an already-owned development test attempt, using its persisted form/key. */
export async function recoverTestCheckout(s:TestCheckoutSettings,slug:string,id:string){
  if(process.env.NODE_ENV==="production"||!s.key.startsWith('sk_test_'))throw new GiftError(503,'checkout_disabled','Sandbox recovery is unavailable.');
  const row=(await giftPool(s).query<GiftRow>('SELECT * FROM ff_donations_test.attempts WHERE tenant_id=$1 AND campaign_slug=$2 AND stripe_account=$3 AND id=$4',[s.tenants[slug],slug,s.account,id])).rows[0];
  if(!row||row.origin!==s.origin)throw new GiftError(404,'confirmation_unavailable','The earlier test checkout could not be found.');
  const returnUrl=`/c/${slug}/gift?attempt=${row.id}&state=returned`;
  if(row.state!=='pending'||row.expires_at.getTime()<=Date.now())return {returnUrl,attemptId:row.id};
  if(row.stripe_session_id){
    if(!checkoutURL(row.checkout_url))throw new GiftError(503,'recovery_unavailable','Open the existing test confirmation and retry later.');
    return {url:row.checkout_url,attemptId:row.id};
  }
  if(Date.now()-row.created_at.getTime()>15*60000)throw new GiftError(409,'recovery_pending','The earlier request needs verification. Check its confirmation before starting another gift.');
  await verifyAccount(s);
  const session=await stripeRequest<StripeSession>(s,'/v1/checkout/sessions',row.stripe_form,'ff-test:'+s.account+':'+row.id);
  await bindSession(s,row,session);
  if(!checkoutURL(session.url))throw new Error('Invalid recovered checkout');
  return {url:session.url,attemptId:row.id};
}
