import {cookies} from "next/headers";
import {testCheckoutSettings} from "@/server/donations/config";
import {liveCheckoutSettings} from "@/server/donations/live/config";
import {ownsCookie as ownsTestCookie,sameOrigin,json,GiftError} from "@/server/donations/protocol";
import {ownsCookie as ownsLiveCookie} from "@/server/donations/live/protocol";
import {giftStatus as testGiftStatus} from "@/server/donations/store";
import {giftStatus as liveGiftStatus} from "@/server/donations/live/store";
export const runtime="nodejs";
/** Read-only recovery of the browser's owned attempt. Never creates a Stripe session. */
export async function GET(request:Request){
  try{
    const live=process.env.NODE_ENV==="production";
    const liveSettings=live?liveCheckoutSettings(false):null;
    const settings=live?liveSettings:testCheckoutSettings();
    if(!settings)return json({ok:true,mode:"preview",available:false,gift:null});
    sameOrigin(request,settings.origin,false);
    const slug=new URL(request.url).searchParams.get("campaign")??"";
    if(!Object.hasOwn(settings.tenants,slug))throw new GiftError(404,"campaign_not_found","Campaign confirmation is unavailable.");
    const cookie=(await cookies()).get(live?"__Host-ff_live_gift":"ff_test_gift")?.value;
    const id=cookie?.split(".")[0]??"";
    const owned=liveSettings?ownsLiveCookie(cookie,liveSettings,id):ownsTestCookie(cookie,settings,id);
    if(!owned)return json({ok:true,mode:live?"live":"test",available:true,gift:null});
    const gift=liveSettings?await liveGiftStatus(liveSettings,slug,id):await testGiftStatus(settings,slug,id);
    return json({ok:true,mode:live?"live":"test",available:true,gift});
  }catch(error){return recoveryError(error);}
}
export async function POST(request:Request){
  try{
    if(process.env.NODE_ENV==="production")throw new GiftError(503,"checkout_disabled","Sandbox retry is unavailable here.");
    const s=testCheckoutSettings();if(!s)throw new GiftError(503,"checkout_disabled","Sandbox recovery is not configured.");
    sameOrigin(request,s.origin);
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new GiftError(415,'invalid_json','Use the campaign checkout.');
    const {boundedBody}=await import('@/server/donations/protocol');
    let raw;try{raw=JSON.parse((await boundedBody(request,1024)).toString('utf8'));}catch(error){if(error instanceof GiftError)throw error;throw new GiftError(400,'invalid_json','Invalid recovery request.');}
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==1||typeof raw.campaignSlug!=='string'||!Object.hasOwn(s.tenants,raw.campaignSlug))throw new GiftError(400,'invalid_request','Invalid recovery request.');
    const cookie=(await cookies()).get('ff_test_gift')?.value,id=cookie?.split('.')[0]??'';
    if(!ownsTestCookie(cookie,s,id))throw new GiftError(404,'confirmation_unavailable','Use the browser that started this test checkout.');
    const {recoverTestCheckout}=await import('@/server/donations/recovery');
    const checkout=await recoverTestCheckout(s,raw.campaignSlug,id);
    return json({ok:true,mode:'test',checkout});
  }catch(error){return recoveryError(error);}
}

function recoveryError(error:unknown){
  if(error instanceof GiftError)return json({ok:false,error:{code:error.code,message:error.message}},error.status);
  return json({ok:false,error:{code:"recovery_unavailable",message:"The earlier checkout could not be checked. Retry before starting another gift."}},503);
}
