import test from "node:test";
import assert from "node:assert/strict";
import {loadSource} from "./campaign-loader.mjs";
const {publicCampaignSnapshot,publishedSeasonUpdates} = loadSource("src/domain/campaigns/season-dispatch.ts");
const {getCampaign} = loadSource("src/data/campaigns/index.ts");
const {toCampaignPresentationV1} = loadSource("src/server/campaigns/presentation-adapter.ts");
const {resolveCampaignBranding} = loadSource("src/components/campaign/campaign-branding.ts");
const {getPublicOrigin,getCampaignCanonicalUrl} = loadSource("src/config/site.ts");
const cutoff = "2026-10-20T00:00:00Z";
const entry = {id:"published-entry",title:"Public milestone",summary:"Approved summary",category:"practice",status:"published",publishedAt:"2026-10-19T00:00:00Z"};
test("public snapshot excludes drafts, future entries, invalid dates, and duplicate ids", () => {
 const source = structuredClone(getCampaign("connect-atx-elite"));
 source.community.updates = [entry,{...entry,id:"draft-entry",status:"draft",title:"PRIVATE_SENTINEL"},{...entry,id:"future-entry",publishedAt:"2027-01-01T00:00:00Z"},{...entry,id:"invalid-date",publishedAt:"2026-02-30T00:00:00Z"},{...entry}];
 const snapshot=publicCampaignSnapshot(source,cutoff);
 assert.deepEqual(snapshot.community.updates.map(item => item.id),[entry.id]);
 assert.equal(JSON.stringify(snapshot).includes("PRIVATE_SENTINEL"),false);
 assert.equal(source.community.updates.length,5);
});
test("invalid publication cutoff fails closed", () => assert.deepEqual(publishedSeasonUpdates([entry],"invalid"),[]));
test("unknown campaign never falls back to the flagship", () => {
 for(const slug of ["missing-campaign","../connect-atx-elite","CONNECT-ATX-ELITE"]) assert.equal(getCampaign(slug),null);
});
test("presentation identifies demonstration totals as unreconciled", () => {
 const value=toCampaignPresentationV1(getCampaign("connect-atx-elite"),{checkoutReady:false,purposes:[],canonicalUrl:null});
 assert.equal(value.funding.isVerifiedSettlement,false);assert.equal(value.funding.source,"campaign_record_unreconciled");
 assert.equal(value.giving.checkoutReady,false);assert.equal(value.publicUrl,null);
 assert.equal(value.funding.raised,11850);assert.equal(value.funding.goal,20000);
});
test("malformed funding and purpose configuration rejected", () => {
 const campaign=getCampaign("connect-atx-elite");
 assert.throws(()=>toCampaignPresentationV1({...campaign,raised:-1},{checkoutReady:false,purposes:[],canonicalUrl:null}));
 assert.throws(()=>toCampaignPresentationV1(campaign,{checkoutReady:false,purposes:[{id:"shared",amountCents:0}],canonicalUrl:null}));
});
test("warm default and contrast-safe branding remain deterministic", () => {
 assert.equal(resolveCampaignBranding().surface,"warm");
 assert.equal(resolveCampaignBranding({accent:"#ffffff"}).accentAccepted,false);
 assert.equal(resolveCampaignBranding({surface:"dark"}).surface,"dark");
});
test("canonical origin rejects credentials, paths, insecure URLs and malformed input", () => {
 const old=process.env.NEXT_PUBLIC_SITE_URL;
 try {
  for(const value of ["http://localhost:3355","https://user:secret@example.com","https://example.com/path","bad","https://example.com?x=1"]) {process.env.NEXT_PUBLIC_SITE_URL=value;assert.equal(getPublicOrigin(),null);}
  process.env.NEXT_PUBLIC_SITE_URL="https://getfuturefunded.com";
  assert.equal(getCampaignCanonicalUrl("connect-atx-elite"),"https://getfuturefunded.com/c/connect-atx-elite");
  assert.equal(getCampaignCanonicalUrl("../outside"),null);
 } finally {if(old===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=old;}
});
