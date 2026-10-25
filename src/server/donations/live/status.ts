import { cookies } from "next/headers";
import { liveCheckoutSettings } from "@/server/donations/live/config";
import { errorResponse,GiftError,json,ownsCookie,sameOrigin,uuid } from "@/server/donations/live/protocol";
import { giftStatus } from "@/server/donations/live/store";

export async function GET(request:Request){
  try{
    const s=liveCheckoutSettings();if(!s)throw new GiftError(503,'checkout_disabled','Gift confirmation is unavailable.');
    sameOrigin(request,s.origin,false);
    const url=new URL(request.url),slug=url.searchParams.get('campaign')??'',id=url.searchParams.get('attempt')??'';
    const cookie=(await cookies()).get('__Host-ff_live_gift')?.value;
    if(!s.tenants[slug]||!uuid(id)||!ownsCookie(cookie,s,id))throw new GiftError(404,'confirmation_unavailable','Open the return page in the browser used for this checkout.');
    const result=await giftStatus(s,slug,id);
    if(!result)throw new GiftError(404,'confirmation_unavailable','Gift confirmation is unavailable.');
    return json({ok:true,mode:'live',gift:result});
  }catch(error){return errorResponse(error);}
}
