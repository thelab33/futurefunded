// Local configuration inspection only. Never sends email, contacts Stripe, or opens a DB connection.
const path=require('node:path');
const root=path.resolve(__dirname,'..');
if(process.env.NODE_ENV==='production'){console.log('STOP: Run this local sandbox check outside production.');process.exit(1);}
process.env.NODE_ENV='development';
require('@next/env').loadEnvConfig(root,true,{info(){},error(){}});
const load=require('./ff-payment-loader.cjs')(root);
const {sandboxEmailRecipient}=load('src/server/sandbox-email.ts');
const {developmentConnection}=load('src/server/database/development.ts');
const {testCheckoutSettings}=load('src/server/donations/config.ts');
const {newsletterSettings}=load('src/server/newsletter-config.ts');
const report=(name,ok)=>console.log((ok?'READY: ':'NOT READY: ')+name);
const db=(name)=>{try{developmentConnection(name);return true;}catch{return false;}};
report('Development Studio switch',process.env.FF_DEVELOPMENT_STUDIO==='1');
report('Approved test identity',Boolean(sandboxEmailRecipient()));
report('Organizer origin (http://127.0.0.1:3355)',process.env.BETTER_AUTH_URL==='http://127.0.0.1:3355');
report('Auth signing secret configured',Boolean(process.env.BETTER_AUTH_SECRET&&process.env.BETTER_AUTH_SECRET.length>=32));
report('Email provider key configured',Boolean(process.env.RESEND_API_KEY?.trim()));
report('Organizer sender configured',Boolean(process.env.FF_M3_FROM_EMAIL?.trim()&&!/[\r\n]/.test(process.env.FF_M3_FROM_EMAIL)));
report('Approved auth database configuration',db('FF_M3_AUTH_DATABASE_URL'));
report('Approved dispatch database configuration',db('FF_M3_DISPATCH_DATABASE_URL'));
const checkout=testCheckoutSettings(),newsletter=newsletterSettings();
report('Development Stripe test configuration',Boolean(checkout));
report('Test checkout shares the organizer origin',Boolean(checkout&&checkout.origin===process.env.BETTER_AUTH_URL));
report('Test-only newsletter configuration',Boolean(newsletter));
report('Newsletter shares the organizer origin',Boolean(newsletter&&newsletter.origin===process.env.BETTER_AUTH_URL));
report('Live new-gift switch remains OFF',process.env.FF_LIVE_CHECKOUT_ENABLED!=='1');
console.log('Configuration only: actual schema, membership, provider delivery, session and payment behavior still need end-to-end verification.');
console.log('No secret values, email addresses, tokens, or database URLs displayed.');
