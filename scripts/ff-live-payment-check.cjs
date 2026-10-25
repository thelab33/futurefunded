// Read-only operator check. Load server environment securely before invoking.
const path=require('node:path');
const root=path.resolve(__dirname,'..'),load=require('./ff-payment-loader.cjs')(root);
(async()=>{
 const {liveCheckoutSettings}=load('src/server/donations/live/config.ts');
 const {publicGivingDetails}=load('src/server/donations/live/public.ts');
 const details=publicGivingDetails();
 if(!details){console.log('NOT READY: Public recipient, support email and distinct policy links are required. No values displayed.');process.exitCode=1;return;}
 const s=liveCheckoutSettings(false);
 if(!s){console.log('NOT READY: Production environment/configuration is incomplete or invalid. No values displayed.');process.exitCode=1;return;}
 const {verifyLiveReadiness}=load('src/server/donations/live/stripe.ts');
 const {giftPool}=load('src/server/donations/live/store.ts');
 let pool;
 try{
  await verifyLiveReadiness(s);console.log('PASS: Expected Stripe account accepts charges/payouts; registered live webhook matches.');
  pool=giftPool(s);
  const r=await pool.query(`SELECT c.launch_approved,c.recipient_label,length(c.recipient_label)>0 AS recipient_set FROM ff_donations_live.campaigns c JOIN ff_donations_live.schema_version v ON v.version=1 WHERE c.tenant_id=$1 AND c.campaign_slug=$2 AND c.stripe_account=$3`,[s.tenants['connect-atx-elite'],'connect-atx-elite',s.account]);
  if(r.rowCount!==1||!r.rows[0].recipient_set||r.rows[0].recipient_label!==details.recipientName)throw new Error('Campaign ledger registration missing');
  console.log('PASS: Live ledger registration and recipient label exist.');
  console.log(r.rows[0].launch_approved?'STATE: Ledger launch approval set.':'STATE: Ledger launch approval OFF.');
  console.log(liveCheckoutSettings(true)?'STATE: New-session switches ON.':'STATE: New-session switches OFF.');
  console.log('NOT LAUNCH ACCEPTANCE: Webhook delivery/signing-secret agreement, real database concurrency, published policy/contact reachability and live payment/receipt/refund checks still need verification.');
 }catch{console.log('NOT READY: Account, webhook, or live ledger verification failed. No secret values displayed.');process.exitCode=1;}
 finally{if(pool)await pool.end();}
})().catch(()=>{console.log('NOT READY: Operator check could not complete.');process.exitCode=1;});
