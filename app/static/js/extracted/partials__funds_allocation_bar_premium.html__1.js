(() => {
    const id = {{ _alloc_id|tojson }};
    const root = document.getElementById(id); if (!root || root.__init) return;

    // Lazy boot for perf
    const boot = () => { if (root.__init) return; root.__init = true; init(); };
    if ('IntersectionObserver' in window){
      const io = new IntersectionObserver((ents)=>{ if (ents.some(e=>e.isIntersecting)){ io.disconnect(); boot(); } }, { rootMargin: '120px' });
      io.observe(root);
    } else { boot(); }

    function init(){
      const bar     = root.querySelector('[data-bar]');
      const legend  = root.querySelector('[data-legend]');
      const raisedEl= document.getElementById(id + "-raised");
      const goalEl  = document.getElementById(id + "-goal");
      const pctEl   = document.getElementById(id + "-pct");
      const pb      = root.querySelector('[role="progressbar"]');
      const sr      = document.getElementById(id + "-sr");

      let defaults = []; try { defaults = JSON.parse(root.dataset.default || "[]"); } catch {}
      let initial  = {}; try { initial  = JSON.parse(root.dataset.initial || "{}"); } catch {}

      const state = {
        raised: Math.max(0, Number(initial.raised || 0)),
        goal:   Math.max(1, Number(initial.goal || 1)),
        allocations: []
      };
      let highlightedKey = null;

      // Formatters
      const nf   = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
      const fmt$ = n => "$" + nf.format(Math.round(Number(n)||0));

      // Colors (deterministic per key)
      const brand = getComputedStyle(root).getPropertyValue("--fc-brand").trim() || "#facc15";
      const paletteBase = [
        `linear-gradient(90deg, ${brand}, #fde68a)`,
        `linear-gradient(90deg, color-mix(in srgb, ${brand} 70%, #fff), ${brand})`,
        `linear-gradient(90deg, #f59e0b, ${brand})`,
        `linear-gradient(90deg, color-mix(in srgb, ${brand} 55%, #fff), #f59e0b)`,
        `linear-gradient(90deg, #fbbf24, color-mix(in srgb, ${brand} 50%, #fff))`
      ];
      const hash = (s)=>{ s=String(s||""); let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; };
      const colorFor = (key, i) => paletteBase[(hash(key)+i)%paletteBase.length];

      const clamp01 = n => Math.max(0, Math.min(1, Number(n)||0));
      const say = (t)=>{ try{ sr.textContent=t; }catch{} }

      function updateTotals(){
        const { raised, goal } = state;
        const pct = Math.max(0, Math.min(100, goal ? (raised/goal)*100 : 0));
        raisedEl.textContent = fmt$(raised);
        goalEl.textContent   = fmt$(goal);
        pctEl.textContent    = (Math.round(pct*10)/10).toString().replace(/\.0$/,'');
        if (pb){
          pb.setAttribute("aria-valuenow", String(Math.round(raised)));
          pb.setAttribute("aria-valuemax", String(Math.round(goal)));
          pb.setAttribute("aria-valuetext", `${fmt$(raised)} of ${fmt$(goal)}`);
        }
      }

      function normalizeAllocations(baseRaised){
        const list = (state.allocations.length ? state.allocations : defaults).map((x,i)=>{
          const key   = x.key ?? `k${i}`;
          const label = x.label ?? String(key);
          if (typeof x.amount === "number" && isFinite(x.amount)){
            return { key, label, amount: Math.max(0, Number(x.amount)||0) };
          } else {
            const r = clamp01(x.ratio);
            return { key, label, amount: Math.max(0, r*baseRaised) };
          }
        });
        const sum = list.reduce((a,b)=>a+b.amount,0);
        // If allocations exceed raised, scale them to fit
        if (sum > baseRaised && sum > 0){
          const k = baseRaised / sum;
          for (const it of list) it.amount *= k;
        }
        const sum2 = list.reduce((a,b)=>a+b.amount,0);
        if (baseRaised > sum2 + 0.5){
          list.push({ key:"unallocated", label:"Unallocated", amount: baseRaised - sum2, _ghost:true });
        }
        return list;
      }

      function renderBar(list, total){
        bar.innerHTML = "";
        list.forEach((item,i)=>{
          const seg   = document.createElement("span");
          const pct   = total ? Math.max(0, item.amount/total*100) : 0;
          const segId = `${id}-seg-${CSS.escape(item.key)}`;
          seg.className = "seg";
          seg.id        = segId;
          seg.tabIndex  = 0;
          seg.dataset.key = item.key;
          seg.style.width     = pct + "%";
          seg.style.background= colorFor(item.key, i);
          seg.title = `${item.label}: ${fmt$(item.amount)} (${Math.round(pct)}%)`;
          if (item._ghost) seg.style.filter = "grayscale(.25) saturate(.9)";
          seg.addEventListener('click', ()=> toggleHighlight(item.key, item.label, item.amount, pct));
          seg.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); toggleHighlight(item.key, item.label, item.amount, pct); } });
          bar.appendChild(seg);
        });
        const sk = bar.querySelector('.skeleton'); if (sk) sk.remove();
        applyHighlight();
      }

      function renderLegend(list, total){
        legend.innerHTML = "";
        list.forEach((item,i)=>{
          const pill = document.createElement("button");
          const pct  = total ? Math.round(item.amount/total*100) : 0;
          const segId= `${id}-seg-${CSS.escape(item.key)}`;

          pill.type="button"; pill.className="pill"; pill.setAttribute("role","listitem");
          pill.setAttribute("data-k", item.key);
          pill.setAttribute("aria-controls", segId);
          pill.setAttribute("aria-pressed", String(item.key === highlightedKey));
          if (item.key === highlightedKey) pill.setAttribute("aria-current","true");
          pill.innerHTML = `<span class="sw" style="background:${colorFor(item.key, i)}"></span>
                            <span>${item.label}: ${fmt$(item.amount)} (${pct}%)</span>`;

          pill.addEventListener("click", ()=> toggleHighlight(item.key, item.label, item.amount, pct));
          pill.addEventListener("keydown", (e)=>{
            if (e.key==='Enter' || e.key===' '){ e.preventDefault(); toggleHighlight(item.key, item.label, item.amount, pct); }
            if (e.key==='ArrowRight' || e.key==='ArrowLeft'){
              e.preventDefault();
              const pills = Array.from(legend.querySelectorAll('.pill'));
              const idx   = pills.indexOf(pill);
              const next  = pills[(idx + (e.key==='ArrowRight'?1:-1) + pills.length) % pills.length];
              next?.focus();
            }
          });

          legend.appendChild(pill);
        });
      }

      function applyHighlight(){
        const segs = bar.querySelectorAll(".seg");
        if (!highlightedKey){ segs.forEach(s=> s.style.opacity=""); legend.querySelectorAll(".pill").forEach(p=>{p.removeAttribute('aria-current');p.setAttribute('aria-pressed','false');}); return; }
        segs.forEach(s=> s.style.opacity = (s.dataset.key===highlightedKey) ? "1" : ".35");
        legend.querySelectorAll(".pill").forEach(p=>{
          const on = p.getAttribute('data-k')===highlightedKey;
          p.setAttribute("aria-pressed", String(on));
          if (on) p.setAttribute("aria-current","true"); else p.removeAttribute("aria-current");
        });
      }

      function toggleHighlight(key, label, amount, pct){
        if (highlightedKey === key) highlightedKey = null;
        else highlightedKey = key;
        applyHighlight();
        const percent = Math.max(0, Math.min(100, Math.round(Number(pct||0))));
        say(highlightedKey ? `${label} highlighted: ${fmt$(amount)} (${percent}%)` : `Highlight cleared`);
        try{
          dispatchEvent(new CustomEvent('fc:alloc:highlight', { detail:{ key, label, amount, percent }}));
        }catch{}
      }

      function render(){
        updateTotals();
        const list  = normalizeAllocations(state.raised);
        const total = list.reduce((a,b)=>a+b.amount,0) || state.raised;
        renderBar(list, total);
        renderLegend(list, total);
      }

      // ---------- Public APIs ----------
      const api = {
        setTotals({raised, goal}={}){
          if (typeof raised==="number") state.raised=Math.max(0,raised);
          if (typeof goal==="number")   state.goal  =Math.max(1,goal);
          render();
        },
        setAllocations(list){ state.allocations = Array.isArray(list) ? list.slice() : []; render(); },
        setFromRatios(ratios){
          state.allocations = Array.isArray(ratios) ? ratios.map(r=>({key:r.key,label:r.label,ratio:clamp01(r.ratio)})) : [];
          render();
        },
        rerender: render
      };

      // Global + instance maps (back-compat)
      window.fcAlloc = Object.assign({}, window.fcAlloc, api);
      window.fcAllocById = window.fcAllocById || {};
      window.fcAllocById[id] = api;

      // ---------- Event bridges ----------
      addEventListener("fc:meter:update", (ev)=>{
        const d = ev.detail || {};
        if (typeof d.raised==="number") state.raised = Math.max(0,d.raised);
        if (typeof d.goal  ==="number") state.goal   = Math.max(1,d.goal);
        render();
      }, {passive:true});

      addEventListener("fc:funds:update", (ev)=>{
        const d = ev.detail || {};
        const newRaised = (typeof d.raised==='number') ? d.raised : state.raised;
        const newGoal   = (typeof d.goal  ==='number') ? d.goal   : state.goal;
        if (newRaised!==state.raised || newGoal!==state.goal){
          state.raised = Math.max(0,newRaised);
          state.goal   = Math.max(1,newGoal);
          render();
        }
      }, {passive:true});

      addEventListener("fc:alloc:update", (ev)=>{
        const list = (ev.detail && ev.detail.allocations) || ev.detail || [];
        if (Array.isArray(list)) { state.allocations = list.slice(); render(); }
      }, {passive:true});

      // ---------- First render ----------
      render();

      // ---------- Optional polling (Save-Data aware) ----------
      (async function poll(){
        const statsUrl = (root.dataset.statsUrl || "").trim();
        const allocUrl = (root.dataset.allocUrl || "").trim();
        try{
          if (document.hidden) return;

          if (statsUrl){
            const r = await fetch(statsUrl, { headers:{Accept:"application/json"}, cache:'no-store', credentials:'same-origin' });
            if (r.ok){
              const j = await r.json();
              const rRaised = (typeof j.raised==='number') ? j.raised : (typeof j.funds_raised==='number' ? j.funds_raised : undefined);
              const rGoal   = (typeof j.goal  ==='number') ? j.goal   : (typeof j.fundraising_goal==='number' ? j.fundraising_goal : undefined);
              if (typeof rRaised==="number") state.raised=Math.max(0,rRaised);
              if (typeof rGoal  ==="number") state.goal  =Math.max(1,rGoal);
            }
          }

          if (allocUrl){
            const r2 = await fetch(allocUrl, { headers:{Accept:"application/json"}, cache:'no-store', credentials:'same-origin' });
            if (r2.ok){
              const j2 = await r2.json();
              const list = Array.isArray(j2) ? j2 : (j2.allocations || []);
              state.allocations = list.map(x=>({
                key: x.key, label: x.label,
                amount: (typeof x.amount === "number") ? Math.max(0,x.amount) : undefined,
                ratio:  (typeof x.ratio  === "number") ? Math.max(0,Math.min(1,x.ratio)) : undefined
              }));
            }
          }

          render();
        }catch{}
        const slow = !!(navigator.connection && (navigator.connection.saveData || (navigator.connection.effectiveType||'').includes('2g')));
        setTimeout(poll, slow ? 30000 : 15000);
      })();
    }
  })();
