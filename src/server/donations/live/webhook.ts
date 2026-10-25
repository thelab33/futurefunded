import { liveCheckoutSettings } from "@/server/donations/live/config";
import { boundedBody,errorResponse,GiftError,json,signedEvent } from "@/server/donations/live/protocol";
import { processGiftEvent } from "@/server/donations/live/store";
import { verifyAccount } from "@/server/donations/live/stripe";

export async function POST(request:Request){
  try{
    const s=liveCheckoutSettings();if(!s)throw new GiftError(503,'checkout_disabled','Live webhook is not configured.');
    // Raw bytes are bounded and authenticated before JSON parsing or any database/provider call.
    const raw=await boundedBody(request,262144);
    const event=signedEvent(raw,request.headers.get('stripe-signature'),s.webhookSecret);
    await verifyAccount(s);
    const outcome=await processGiftEvent(s,event);
    return json({received:true,outcome});
  }catch(error){return errorResponse(error);}
}
