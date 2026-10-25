"use client";
import { useEffect,useState } from "react";
import styles from "./GiftReturn.module.css";
type Gift={state:string;amountCents:number;refundedCents:number;disputedCents:number;verified:boolean;resumeURL:string|null};
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
function safeResume(value:string|null){try{if(!value)return null;const u=new URL(value);return u.protocol==='https:'&&u.hostname==='checkout.stripe.com'&&!u.port&&!u.username&&!u.password?value:null;}catch{return null;}}
export function GiftReturn({slug,organization,attempt,cancelled,mode="test"}:{mode?:"test"|"live";slug:string;organization:string;attempt:string|null;cancelled:boolean}){
  const live=mode==="live";
  const [gift,setGift]=useState<Gift|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,count=0;const controller=new AbortController();
    async function read(){
      if(!attempt){setError('No checkout reference was provided. Return to the campaign to review your gift.');setLoading(false);return;}
      try{
        const response=await fetch(`/api/donations/status?campaign=${encodeURIComponent(slug)}&attempt=${encodeURIComponent(attempt)}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
        const body=await response.json();if(stopped)return;
        if(!response.ok||!body.ok)throw new Error(body.error?.message??'Confirmation is temporarily unavailable.');
        if(body.mode!==mode)throw new Error("The payment environment could not be verified.");
        const next=body.gift as Gift;
        if(!Number.isSafeInteger(next.amountCents)||!['pending','paid','expired','failed','refunded','disputed'].includes(next.state))throw new Error('Confirmation could not be verified.');
        setGift(next);setError('');setLoading(false);
        if(next.state==='pending'&&++count<8)timer=setTimeout(read,2000);
      }catch(e){if(!stopped){setError(e instanceof Error?e.message:'Confirmation is temporarily unavailable.');setLoading(false);}}
    }
    queueMicrotask(()=>{if(!stopped)void read();});return()=>{stopped=true;controller.abort();if(timer)clearTimeout(timer);};
  },[slug,attempt,refresh,mode]);
  const confirmed=gift?.verified&&gift.state==='paid';
  const title=error?'Confirmation unavailable.':loading?(live?'Checking your gift.':'Checking your test gift.'):confirmed?(live?'Your gift is confirmed.':'Your test gift is confirmed.'):gift?.state==='refunded'?(live?'Your gift was refunded.':'Your test gift was refunded.'):gift?.state==='disputed'?'Payment under review.':gift?.state==='expired'?'This checkout expired.':gift?.state==='failed'?'The payment was not completed.':cancelled?'You left checkout.':'Confirmation is still pending.';
  const message=error||(confirmed?(live?'Your payment has been verified and recorded for the shared season fund.':'A verified Stripe webhook recorded this test payment. No real money was collected.'):gift?.state==='refunded'?(live?'The recorded payment has been fully refunded.':'The test ledger reflects the recorded refund. No real money was collected.'):gift?.state==='disputed'?'This payment is under review. Disputed amounts are excluded from the campaign funding projection.':gift?.state==='expired'||gift?.state==='failed'?'No completed gift has been recorded for this attempt. If you believe you were charged, contact the organizer with your checkout reference before starting another gift.':'Returning from Stripe does not confirm payment. We are checking the verified payment record. If confirmation remains pending, refresh this page before starting another gift.');
  const resume=safeResume(gift?.resumeURL??null);
  return <main className={styles.page}>
    <a className={styles.brand} href={`/c/${slug}`}>{organization}<span>FutureFunded · {live?"Gift confirmation":"Test checkout"}</span></a>
    <section className={styles.card} aria-labelledby="gift-result-title">
      <p className={styles.eyebrow}>{live?"Shared season fund · USD":"Test mode · No real money"}</p>
      <h1 id="gift-result-title">{title}</h1>
      <p className={styles.message} role="status" aria-live="polite">{message}</p>
      {gift&&<dl className={styles.summary}>
        <div><dt>{live?"Gift":"Test gift"}</dt><dd>{money(gift.amountCents)}</dd></div>
        <div><dt>Purpose</dt><dd>Shared season fund</dd></div>
        {gift.refundedCents>0&&<div><dt>Refunded</dt><dd>{money(gift.refundedCents)}</dd></div>}
        {gift.disputedCents>0&&<div><dt>Excluded as disputed</dt><dd>{money(gift.disputedCents)}</dd></div>}
      </dl>}
      {attempt&&<p className={styles.note} style={{overflowWrap:"anywhere"}}>Checkout reference: {attempt}</p>}
      <div className={styles.actions}>
        {resume&&<a className={styles.primary} href={resume}>{live?"Resume this checkout":"Resume this test checkout"} <span aria-hidden="true">→</span></a>}
        {(!gift||gift.state==='pending'||error)&&<button type="button" disabled={loading} onClick={()=>{setLoading(true);setError('');setRefresh(v=>v+1);}}>{loading?'Checking…':(live?'Refresh confirmation':'Refresh test confirmation')}</button>}
        <a className={!resume?styles.primary:styles.secondary} href={`/c/${slug}#giving`}>Back to campaign <span aria-hidden="true">→</span></a>
      </div>
      <p className={styles.note}>{live?"This page confirms the payment record, not tax deductibility. Contact the organizer for receipt or refund questions.":"Test records stay separate from live fundraising. This page is not a tax receipt or a statement of real funds received."}</p>
    </section>
  </main>;
}
