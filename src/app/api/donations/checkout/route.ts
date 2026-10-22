import { cookies } from "next/headers";
import { getCampaign } from "@/data/campaigns";
import { testCheckoutSettings } from "@/server/donations/config";
import { boundedBody,errorResponse,GiftError,json,proof,sameOrigin,validateGift } from "@/server/donations/protocol";
import { bindSession,reserveGift,testCheckoutContext } from "@/server/donations/store";
import { checkoutURL,stripeRequest,verifyAccount,type StripeSession } from "@/server/donations/stripe";
export const runtime="nodejs";
export async function POST(request:Request){
  try{
    const s=testCheckoutSettings();if(!s)throw new GiftError(503,'checkout_disabled','Test checkout is not configured. No real payments are available.');
    sameOrigin(request,s.origin);
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new GiftError(415,'invalid_json','Use the campaign checkout form.');
    let raw;try{raw=JSON.parse((await boundedBody(request,4096)).toString('utf8'));}catch(error){if(error instanceof GiftError)throw error;throw new GiftError(400,'invalid_json','Invalid checkout request.');}
    const campaign=typeof raw?.campaignSlug==='string'?getCampaign(raw.campaignSlug):undefined;
    if(!campaign||!s.tenants[campaign.slug]||!campaign.capabilities.donations)throw new GiftError(404,'campaign_not_found','Campaign is unavailable.');
    const gift=validateGift(raw,campaign);
    if(!(await testCheckoutContext(campaign.slug)).ready)throw new GiftError(503,'checkout_not_configured','Test checkout storage is unavailable.');
    await verifyAccount(s);
    const row=await reserveGift(s,campaign,gift);
    const setOwnerCookie=async()=>{(await cookies()).set('ff_test_gift',row.id+'.'+proof(s,row.id),{httpOnly:true,sameSite:'lax',secure:false,path:'/',maxAge:86400});};
    // Never recreate an old ambiguous request after Stripe's retry window.
    // Completed/expired attempts recover ownership and return to their existing record.
    const returnOnly=row.state!=='pending'||row.expires_at.getTime()<=Date.now()||(!row.stripe_session_id&&Date.now()-row.created_at.getTime()>15*60000);
    if(returnOnly){
      await setOwnerCookie();
      return json({ok:true,mode:'test',checkout:{attemptId:row.id,returnUrl:`/c/${campaign.slug}/gift?attempt=${row.id}&state=returned`}});
    }
    let url=row.checkout_url;
    if(!row.stripe_session_id){
      const session=await stripeRequest<StripeSession>(s,'/v1/checkout/sessions',row.stripe_form,'ff-test:'+s.account+':'+row.id);
      await bindSession(s,row,session);url=session.url;
    }
    if(!checkoutURL(url))throw new Error('Invalid checkout destination');
    await setOwnerCookie();
    return json({ok:true,mode:'test',checkout:{url,attemptId:row.id}});
  }catch(error){return errorResponse(error);}
}
