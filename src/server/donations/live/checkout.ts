import { cookies } from "next/headers";
import { liveCheckoutSettings } from "@/server/donations/live/config";
import { boundedBody,errorResponse,GiftError,json,proof,sameOrigin,validateGift } from "@/server/donations/live/protocol";
import { bindSession,reserveGift,liveCheckoutContext } from "@/server/donations/live/store";
import { checkoutURL,stripeRequest,type StripeSession } from "@/server/donations/live/stripe";

export async function POST(request:Request){
  try{
    const s=liveCheckoutSettings(true);if(!s)throw new GiftError(503,'checkout_disabled','Giving is not open. No checkout was created.');
    sameOrigin(request,s.origin);
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new GiftError(415,'invalid_json','Use the campaign checkout form.');
    let raw;try{raw=JSON.parse((await boundedBody(request,4096)).toString('utf8'));}catch(error){if(error instanceof GiftError)throw error;throw new GiftError(400,'invalid_json','Invalid checkout request.');}
    const {getCampaign}=await import("@/data/campaigns");
    const campaign=typeof raw?.campaignSlug==='string'?getCampaign(raw.campaignSlug):undefined;
    if(!campaign||!s.tenants[campaign.slug]||!campaign.capabilities.donations)throw new GiftError(404,'campaign_not_found','Campaign is unavailable.');
    const gift=validateGift(raw,campaign);
    if(!(await liveCheckoutContext(campaign.slug)).ready)throw new GiftError(503,'checkout_not_configured','Checkout storage is unavailable.');
    const row=await reserveGift(s,campaign,gift);
    const setOwnerCookie=async()=>{(await cookies()).set('__Host-ff_live_gift',row.id+'.'+proof(s,row.id),{httpOnly:true,sameSite:'lax',secure:true,path:'/',maxAge:86400});};
    await setOwnerCookie();
    // Never recreate an old ambiguous request after Stripe's retry window.
    // Completed/expired attempts recover ownership and return to their existing record.
    const returnOnly=row.state!=='pending'||row.expires_at.getTime()<=Date.now()||(!row.stripe_session_id&&Date.now()-row.created_at.getTime()>15*60000);
    if(returnOnly){
      return json({ok:true,mode:'live',checkout:{attemptId:row.id,returnUrl:`/c/${campaign.slug}/gift?attempt=${row.id}&state=returned`}});
    }
    let url=row.checkout_url;
    if(!row.stripe_session_id){
      const session=await stripeRequest<StripeSession>(s,'/v1/checkout/sessions',row.stripe_form,'ff-live:'+s.account+':'+row.id);
      await bindSession(s,row,session);url=session.url;
    }
    if(!checkoutURL(url))throw new Error('Invalid checkout destination');
    return json({ok:true,mode:'live',checkout:{url,attemptId:row.id}});
  }catch(error){return errorResponse(error);}
}
