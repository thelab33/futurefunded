import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Campaign } from "@/domain/campaigns/types";
import type { LiveCheckoutSettings } from "./config";
export class GiftError extends Error { constructor(public status: number,public code: string, message: string){super(message);} }
export const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
export const proof=(settings:LiveCheckoutSettings,id:string)=>createHmac("sha256",settings.secret).update("gift-return:"+id).digest("hex");
export function equal(a:string,b:string){const first=Buffer.from(a),second=Buffer.from(b);return first.length===second.length&&timingSafeEqual(first,second);}
export function ownsCookie(value:string|undefined,s:LiveCheckoutSettings,id:string){return uuid(id)&&Boolean(value&&equal(value,id+"."+proof(s,id)));}
export async function boundedBody(request:Request,maximum:number){
  if(Number(request.headers.get("content-length")??0)>maximum)throw new GiftError(413,"request_too_large","Request too large.");
  const reader=request.body?.getReader();if(!reader)throw new GiftError(400,"invalid_json","Missing request.");
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maximum){await reader.cancel();throw new GiftError(413,"request_too_large","Request too large.");}chunks.push(part.value);}}finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}
export function sameOrigin(request:Request,origin:string,required=true){
  if(request.headers.get("sec-fetch-site")==="cross-site"||(required?request.headers.get("origin")!==origin: Boolean(request.headers.get("origin")&&request.headers.get("origin")!==origin)))throw new GiftError(403,"origin_not_allowed","Open checkout from the campaign page.");
}
export type GiftInput={campaignSlug:string;amountCents:number;purposeId:string;frequency:"one_time";donorName:string;donorEmail:string;anonymous:boolean;sourceRef:string;sourceChannel:string;requestToken:string};
export function validateGift(raw:unknown,campaign:Campaign):GiftInput{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new GiftError(400,"invalid_json","Invalid checkout request.");
  const d=raw as Record<string,unknown>;
  const allowed=new Set(['campaignSlug','amountCents','purposeId','frequency','donorName','donorEmail','anonymous','sourceRef','sourceChannel','requestToken']);
  if(Object.keys(d).some(k=>!allowed.has(k)))throw new GiftError(400,'invalid_request','Unexpected checkout details.');
  if(d.campaignSlug!==campaign.slug||!uuid(d.requestToken))throw new GiftError(400,"invalid_request","Reload the campaign and try again.");
  if(!Number.isSafeInteger(d.amountCents))throw new GiftError(400,"invalid_amount","Enter a valid amount in cents.");
  const amount=d.amountCents as number;
  if(amount<100)throw new GiftError(400,"amount_below_minimum","Enter a gift of at least $1.");
  if(amount>1000000)throw new GiftError(400,"amount_above_maximum","Gifts are limited to $10,000.");
  if(d.frequency!=="one_time")throw new GiftError(400,"frequency_not_allowed","Only one-time gifts are available.");
  if(d.purposeId!=="shared-season-fund")throw new GiftError(400,"purpose_not_allowed","Gifts support the shared season fund.");
  const text=(v:unknown,max:number,code:string)=>{if(typeof v!=="string"||v.length>max||/[\u0000-\u001f\u007f]/u.test(v))throw new GiftError(400,code,"Check your donor details.");return v.trim();};
  const donorName=text(d.donorName,100,"invalid_name"),donorEmail=text(d.donorEmail,254,"invalid_email").toLowerCase();
  if(donorEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail))throw new GiftError(400,"invalid_email","Enter a valid email address or leave it blank.");
  if(typeof d.anonymous!=="boolean")throw new GiftError(400,"invalid_request","Check your donor privacy selection.");
  const source=(v:unknown,fallback:string)=>typeof v==="string"&&/^[a-z0-9_.:-]{1,80}$/i.test(v)?v:fallback;
  return {campaignSlug:campaign.slug,amountCents:amount,purposeId:"shared-season-fund",frequency:"one_time",donorName,donorEmail,anonymous:d.anonymous,sourceRef:source(d.sourceRef,"campaign"),sourceChannel:source(d.sourceChannel,"web"),requestToken:d.requestToken.toLowerCase()};
}
export function signedEvent(body:Buffer,signature:string|null,secret:string,now=Math.floor(Date.now()/1000)){
  if(!signature||signature.length>2048)throw new GiftError(400,"invalid_signature","Invalid signature.");
  const parts=signature.split(",").map(v=>v.trim().split("="));
  const times=parts.filter(p=>p[0]==="t");const t=times[0]?.[1];
  if(times.length!==1||!t||!/^\d{10,12}$/.test(t)||Math.abs(now-Number(t))>300)throw new GiftError(400,"invalid_signature","Invalid signature.");
  const expected=createHmac("sha256",secret).update(t+".").update(body).digest("hex");
  if(!parts.some(([k,v])=>k==="v1"&&/^[a-f0-9]{64}$/.test(v??"")&&equal(expected,v)))throw new GiftError(400,"invalid_signature","Invalid signature.");
  let event;try{event=JSON.parse(body.toString("utf8"));}catch{throw new GiftError(400,"invalid_event","Invalid event.");}
  if(!event||event.object!=="event"||!/^evt_[A-Za-z0-9]+$/.test(event.id)||event.livemode!==true||event.account||typeof event.type!=="string"||!event.data?.object||typeof event.data.object.id!=="string")throw new GiftError(400,"invalid_event","Only direct-account live events are accepted.");
  return event as {id:string;type:string;livemode:true;data:{object:Record<string,unknown>&{id:string;object?:string;metadata?:Record<string,string>;payment_intent?:string}}};
}
export function json(body:unknown,status=200,headers:Record<string,string>={}){return Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...(status===429?{"Retry-After":"3600"}:{}),...headers}});}
export function errorResponse(error:unknown){
  if(error instanceof GiftError)return json({ok:false,error:{code:error.code,message:error.message}},error.status);
  console.error("Donation operation failed.");
  return json({ok:false,error:{code:"checkout_unavailable",message:"Checkout is temporarily unavailable. Retry with the same details."}},503);
}
