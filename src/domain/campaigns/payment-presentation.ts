export type CheckoutMode = "preview" | "test" | "live";
export type FundingSource = "campaign_record_unreconciled" | "test_payment_ledger" | "live_payment_ledger";
export type PublicGivingDetails = {recipientName:string;supportEmail:string;privacyUrl:string;termsUrl:string};
export function givingState(mode:CheckoutMode|undefined,ready:boolean):CheckoutMode {
  return ready&&(mode==="live"||mode==="test")?mode:"preview";
}
export function hasVerifiedFunding(source:FundingSource|undefined,raised:number,gifts:number):boolean {
  return source==="live_payment_ledger"&&Number.isFinite(raised)&&raised>0&&Number.isSafeInteger(gifts)&&gifts>0;
}
