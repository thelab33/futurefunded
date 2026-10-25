import "server-only";
import {getCampaign} from "@/data/campaigns";
import type {CheckoutMode,FundingSource,PublicGivingDetails} from "@/domain/campaigns/payment-presentation";
import {testCheckoutContext} from "./store";
import {liveCheckoutContext} from "./live/store";
export type CampaignCheckout = {ready:boolean;mode:CheckoutMode;funding:{source:FundingSource;raised:number;gifts:number}|null;details:PublicGivingDetails|null};
export async function campaignCheckoutContext(slug:string):Promise<CampaignCheckout>{
  const campaign=getCampaign(slug);
  if(!campaign)return {ready:false,mode:"preview",funding:null,details:null};
  if(process.env.NODE_ENV==="production"){
    const context=await liveCheckoutContext(slug);
    const ready=context.ready&&campaign.capabilities.donations;
    return {ready,mode:ready?"live":"preview",funding:context.funding?{...context.funding,source:"live_payment_ledger"}:null,details:context.details??null};
  }
  const context=await testCheckoutContext(slug);
  const ready=context.ready&&campaign.capabilities.donations;
  return {ready,mode:ready?"test":"preview",funding:context.funding?{...context.funding,source:"test_payment_ledger"}:null,details:null};
}
