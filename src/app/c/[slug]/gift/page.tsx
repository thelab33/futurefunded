import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaign } from "@/data/campaigns";
import { uuid } from "@/server/donations/protocol";
import { GiftReturn } from "@/components/campaign/checkout/GiftReturn";
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Test gift confirmation · FutureFunded',robots:{index:false,follow:false}};
export default async function GiftReturnPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{attempt?:string;state?:string}>}){
  const {slug}=await params,campaign=getCampaign(slug),query=await searchParams;
  if(!campaign)notFound();
  return <GiftReturn key={slug+String(query.attempt??'')} slug={slug} organization={campaign.organization} attempt={uuid(query.attempt)?query.attempt:null} cancelled={query.state==='cancelled'}/>;
}
