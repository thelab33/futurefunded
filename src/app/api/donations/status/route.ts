import { cookies } from "next/headers";
import { testCheckoutSettings } from "@/server/donations/config";
import { errorResponse,GiftError,json,ownsCookie,sameOrigin,uuid } from "@/server/donations/protocol";
import { giftStatus } from "@/server/donations/store";
export const runtime='nodejs';
export async function GET(request:Request){
  try{
    const s=testCheckoutSettings();if(!s)throw new GiftError(503,'checkout_disabled','Test confirmation is unavailable.');
    sameOrigin(request,s.origin,false);
    const url=new URL(request.url),slug=url.searchParams.get('campaign')??'',id=url.searchParams.get('attempt')??'';
    const cookie=(await cookies()).get('ff_test_gift')?.value;
    if(!s.tenants[slug]||!uuid(id)||!ownsCookie(cookie,s,id))throw new GiftError(404,'confirmation_unavailable','Open the return page in the browser used for this test checkout.');
    const result=await giftStatus(s,slug,id);
    if(!result)throw new GiftError(404,'confirmation_unavailable','Test confirmation is unavailable.');
    return json({ok:true,mode:'test',gift:result});
  }catch(error){return errorResponse(error);}
}
