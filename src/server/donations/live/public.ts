import "server-only";
import type {PublicGivingDetails} from "@/domain/campaigns/payment-presentation";
/** Public recipient/support metadata only; never include provider or DB credentials. */
export function publicGivingDetails():PublicGivingDetails|null {
  const recipientName=process.env.FF_LIVE_RECIPIENT_NAME?.trim()??"";
  const supportEmail=process.env.FF_LIVE_SUPPORT_EMAIL?.trim()??"";
  const privacyUrl=process.env.FF_LIVE_PRIVACY_URL?.trim()??"",termsUrl=process.env.FF_LIVE_TERMS_URL?.trim()??"";
  const policy=(value:string)=>{try{const u=new URL(value);return u.origin==="https://getfuturefunded.com"&&!u.username&&!u.password&&u.pathname!=="/"&&!u.search&&!u.hash&&u.pathname!=="/c/connect-atx-elite";}catch{return false;}};
  if(recipientName.length<2||recipientName.length>140||/[\u0000-\u001f\u007f]/u.test(recipientName)||supportEmail.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)||!policy(privacyUrl)||!policy(termsUrl)||privacyUrl===termsUrl)return null;
  return {recipientName,supportEmail,privacyUrl,termsUrl};
}
