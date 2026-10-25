import { POST as livePOST } from "@/server/donations/live/webhook";
import { testCheckoutSettings } from "@/server/donations/config";
import { boundedBody,errorResponse,GiftError,json,signedEvent } from "@/server/donations/protocol";
import { processGiftEvent } from "@/server/donations/store";
import { verifyAccount } from "@/server/donations/stripe";
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
  if(process.env.NODE_ENV === "production") return livePOST(request);
  try{
    const s=testCheckoutSettings();if(!s)throw new GiftError(503,'checkout_disabled','Test webhook is not configured.');
    // Raw bytes are bounded and authenticated before JSON parsing or any database/provider call.
    const raw=await boundedBody(request,262144);
    const event=signedEvent(raw,request.headers.get('stripe-signature'),s.webhookSecret);
    await verifyAccount(s);
    const outcome=await processGiftEvent(s,event);
    return json({received:true,outcome});
  }catch(error){return errorResponse(error);}
}
