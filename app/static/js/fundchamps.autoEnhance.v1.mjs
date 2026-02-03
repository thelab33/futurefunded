/* FundChamps FinalUX
   Per-tenant polish: class toggle, analytics bridge, live region, hero fallbacks,
   noopener, Stripe preconnect, optional dev a11y hotkey. */

(function(){
  const CFG = Object.assign({
    features: {
      classToggle: true,
      analyticsBridge: true,
      liveRegion: true,
      preconnectStripe: true,
      heroFallback: true,
      enforceNoopener: true,
      devAxeHotkey: false
    },
    tenants: {}
  }, (window.FC_UX_CFG||{}));

  const html = document.documentElement;

  function enableClassToggle(){
    html.classList.add("fcux-on");
    const route = document.body?.dataset?.route || document.querySelector("[data-route]")?.dataset?.route;
    if(route) html.classList.add(`fcux-route-${route}`);
  }

  function preconnectStripe(){
    if(!CFG.features.preconnectStripe) return;
    const have = !!document.querySelector('link[rel="preconnect"][href="https://js.stripe.com"]');
    if(have) return;
    const l = document.createElement("link");
    l.rel="preconnect"; l.href="https://js.stripe.com"; l.crossOrigin="anonymous";
    document.head.appendChild(l);
  }

  // Announcer region for quick status text updates
  function liveRegion(){
    if(!CFG.features.liveRegion) return;
    if(document.getElementById("fc-live")) return;
    const r = document.createElement("div");
    r.id="fc-live";
    r.className="sr-only";
    r.setAttribute("aria-live","polite");
    r.setAttribute("aria-atomic","true");
    r.style.position="absolute"; r.style.left="-9999px"; r.style.width="1px"; r.style.height="1px";
    document.body.appendChild(r);
    window.fcAnnounce = (msg)=>{ r.textContent=""; setTimeout(()=>{ r.textContent = msg; }, 40); };
  }

  function analyticsBridge(){
    if(!CFG.features.analyticsBridge) return;
    window.addEventListener("fc:analytics", (e)=>{
      const {name, ...rest} = e.detail||{};
      (window.dataLayer = window.dataLayer || []).push({event:"fc_event", name, ...rest});
      // Console crumb for devs
      if(window.location.hostname === "localhost") console.log("[analytics]", name, rest);
    });
  }

  function heroFallback(){
    if(!CFG.features.heroFallback) return;
    document.addEventListener("error", (e)=>{
      const t = e.target;
      if(t && t.classList && t.classList.contains("fcx-hero__img")){
        const fb = t.getAttribute("data-fallback") || "/static/images/team-default.jpg";
        if(t.src && !t.src.endsWith(fb)){
          t.src = fb;
        }
      }
    }, true);
  }

  function enforceNoopener(){
    if(!CFG.features.enforceNoopener) return;
    document.querySelectorAll("a[target=_blank]").forEach(a=>{
      const rel = (a.getAttribute("rel")||"").split(/\s+/);
      if(!rel.includes("noopener")) rel.push("noopener");
      if(!rel.includes("noreferrer")) rel.push("noreferrer");
      a.setAttribute("rel", rel.join(" ").trim());
    });
  }

  function devAxeHotkey(){
    if(!CFG.features.devAxeHotkey) return;
    window.addEventListener("keydown", (e)=>{
      if(e.ctrlKey && e.altKey && e.key.toLowerCase()==="a"){
        console.log("Axe scan hotkey pressed. Tip: run Lighthouse/Axe in your browser devtools.");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    if(CFG.features.classToggle) enableClassToggle();
    preconnectStripe();
    analyticsBridge();
    liveRegion();
    heroFallback();
    enforceNoopener();
    devAxeHotkey();
  }, {once:true});
})();

