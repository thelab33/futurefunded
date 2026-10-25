"use client";
import {useEffect,useState} from "react";
import styles from "./DonationForm.module.css";
type Gift={id:string;campaign:string;state:string;amountCents:number;verified:boolean;resumeURL:string|null};
const states=new Set(["pending","paid","expired","failed","refunded","disputed"]);
export function validRecoveredGift(value:unknown,slug:string):value is Gift {
  if(!value||typeof value!=="object")return false;
  const g=value as Gift;
  return typeof g.id==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(g.id)&&g.campaign===slug&&states.has(g.state)&&Number.isSafeInteger(g.amountCents)&&g.amountCents>=100&&g.amountCents<=1000000&&typeof g.verified==="boolean"&&(!["paid","refunded","disputed"].includes(g.state)||g.verified)&&(g.resumeURL===null||safeResume(g.resumeURL)!==null);
}
function safeResume(value:unknown):string|null {
  try{if(typeof value!=="string")return null;const u=new URL(value);return u.protocol==="https:"&&u.hostname==="checkout.stripe.com"&&!u.port&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function CheckoutRecovery({slug,mode,onReady}:{slug:string;mode:"test"|"live";onReady:(ready:boolean)=>void}){
  const [gift,setGift]=useState<Gift|null>(null),[error,setError]=useState(false),[checking,setChecking]=useState(true),[refresh,setRefresh]=useState(0),[acknowledged,setAcknowledged]=useState(false),[retrying,setRetrying]=useState(false),[retryError,setRetryError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();let stopped=false;
    onReady(false);
    async function read(){
      setChecking(true);setError(false);setGift(null);setAcknowledged(false);
      try{
        const response=await fetch(`/api/donations/recovery?campaign=${encodeURIComponent(slug)}`,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
        const result=await response.json();
        if(stopped)return;
        if(!response.ok||!result.ok||result.mode!==mode||result.available!==true||(result.gift!==null&&!validRecoveredGift(result.gift,slug)))throw new Error("Recovery unavailable");
        setGift(result.gift);onReady(result.gift===null);
      }catch{if(!stopped){setError(true);onReady(false);}}
      finally{if(!stopped)setChecking(false);}
    }
    void read();return()=>{stopped=true;controller.abort();};
  },[slug,mode,onReady,refresh]);
  async function retryExisting(){
    if(retrying||mode!=="test"||!gift)return;
    setRetrying(true);setRetryError("");
    try{
      const response=await fetch('/api/donations/recovery',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({campaignSlug:slug})});
      const result=await response.json();
      if(!response.ok||!result.ok||result.mode!=="test"||result.checkout?.attemptId!==gift.id)throw new Error(result.error?.message??"The earlier attempt could not be resumed. Check its confirmation before retrying.");
      if(result.checkout.returnUrl){
        const url=new URL(result.checkout.returnUrl,window.location.origin);
        if(url.origin!==window.location.origin||url.pathname!==`/c/${slug}/gift`||url.searchParams.get('attempt')!==gift.id)throw new Error("Confirmation destination could not be verified.");
        window.location.assign(url.href);return;
      }
      const url=safeResume(result.checkout.url);if(!url)throw new Error("Checkout destination could not be verified.");
      window.location.assign(url);
    }catch(e){setRetryError(e instanceof Error?e.message:"Recovery unavailable.");}finally{setRetrying(false);}
  }
  const test=mode==="test";
  if(checking)return <p className={styles.note} role="status">Checking for an earlier {test?"test checkout":"checkout"}…</p>;
  if(error)return <div className={styles.readiness} role="status"><div><strong>We couldn’t check your earlier checkout.</strong><p>Retry this check before starting another gift.</p><button type="button" className={styles.back} onClick={()=>setRefresh(n=>n+1)}>Retry checkout check</button></div></div>;
  if(!gift||acknowledged)return null;
  const pending=gift.state==="pending",disputed=gift.state==="disputed";
  const amount=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(gift.amountCents/100);
  const title=pending?`An earlier ${amount} ${test?"test checkout":"checkout"} is still pending.`:gift.state==="paid"&&gift.verified?`Your earlier ${amount} ${test?"test gift":"gift"} was recorded.`:disputed?"Your earlier payment is under review.":`An earlier ${test?"test checkout":"checkout"} was ${gift.state}.`;
  return <div className={styles.readiness} role="status"><div>
    <strong>{title}</strong>
    <p>{pending?"Continue that attempt or check its confirmation before starting another gift.":disputed?"Check the existing confirmation or contact the organizer before making another gift.":"Review its confirmation, or explicitly choose to make another gift."}{test?" No real money is collected in test mode.":""}</p>
    {pending&&safeResume(gift.resumeURL)&&<p><a className={styles.back} href={safeResume(gift.resumeURL)!}>Resume {test?"test checkout":"checkout"} →</a></p>}
    {test&&pending&&!gift.resumeURL&&<p><button className={styles.back} type="button" disabled={retrying} onClick={()=>void retryExisting()}>{retrying?"Resuming earlier attempt…":"Retry this same test checkout"}</button></p>}
    {retryError&&<p role="alert">{retryError}</p>}
    <p><a className={styles.back} href={`/c/${slug}/gift?attempt=${encodeURIComponent(gift.id)}&state=returned`}>View {test?"test confirmation":"confirmation"} →</a></p>
    {!pending&&!disputed&&<button type="button" className={styles.back} onClick={()=>{setAcknowledged(true);onReady(true);}}>Make another {test?"test gift":"gift"}</button>}
  </div></div>;
}
