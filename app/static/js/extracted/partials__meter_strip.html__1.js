{% endif %}
        (() => {
          const id   = "{{ strip_id }}";
          const root = document.getElementById(id);
          if (!root || root.__init) return; root.__init = true;

          const fill = document.getElementById(id + '-fill');
          const rEl  = document.getElementById(id + '-raised');
          const gEl  = document.getElementById(id + '-goal');
          const pEl  = document.getElementById(id + '-pct');

          const prefersReduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

          const state = (()=>{ try { return JSON.parse(root.dataset.initial||'{}'); } catch { return {}; } })();
          state.raised = Math.max(0, Number(state.raised||0));
          state.goal   = Math.max(0, Number(state.goal||0));

          const clamp = (n,min,max)=>Math.min(Math.max(n,min),max);
          const fmt = v => new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}).format(+v||0);

          function setVals(raised, goal){
            const pct = goal ? clamp((raised/goal)*100,0,100) : 0;
            if (fill) fill.style.width = pct.toFixed(1) + '%';
            if (pEl)  pEl.textContent  = pct.toFixed(1).replace(/\.0$/,'');
            if (rEl)  rEl.textContent  = fmt(raised);
            if (gEl)  gEl.textContent  = fmt(goal);
            const bar = root.querySelector('[role="progressbar"]');
            if (bar) bar.setAttribute('aria-valuenow', pct.toFixed(1));
          }

          // Public API for manual syncs
          window.updateMeterStrip = function(targetId, raised, goal){
            if (targetId && targetId !== id) return;
            const R = (typeof raised === 'number') ? raised : state.raised;
            const G = (typeof goal   === 'number') ? goal   : state.goal;
            state.raised = Math.max(0, +R||0);
            state.goal   = Math.max(1, +G||1);
            setVals(state.raised, state.goal);
          };

          // Listen for global updates (from hero, checkout, etc.)
          addEventListener('fc:funds:update', (e)=>{
            const d = e.detail || {};
            const R = (typeof d.raised === 'number') ? d.raised : state.raised;
            const G = (typeof d.goal   === 'number') ? d.goal   : state.goal;
            if (R !== state.raised || G !== state.goal) {
              state.raised = Math.max(0, +R||0);
              state.goal   = Math.max(1, +G||1);
              setVals(state.raised, state.goal);
            }
          }, { passive:true });

          // Init
          setVals(state.raised, state.goal);

          // Optional gentle number tween (skipped if reduced motion)
          if (!prefersReduce) {
            const tweenMoney = (el, to, ms=500) => {
              if (!el) return;
              const from = parseFloat((el.textContent||'0').replace(/[^0-9.-]/g,''))||0;
              const t0 = performance.now();
              const step = (t)=>{
                const k = Math.min(1, (t - t0)/ms), e = 1 - Math.pow(1-k, 3);
                el.textContent = fmt(from + (to - from)*e);
                if (k < 1) requestAnimationFrame(step);
              };
              requestAnimationFrame(step);
            };

            // Re-wrap setVals to animate amounts
            const _setVals = setVals;
            setVals = function(raised, goal){
              const pct = goal ? clamp((raised/goal)*100,0,100) : 0;
              if (fill) fill.style.width = pct.toFixed(1) + '%';
              if (pEl)  pEl.textContent  = pct.toFixed(1).replace(/\.0$/,'');
              if (rEl)  tweenMoney(rEl, raised);
              if (gEl)  gEl.textContent = fmt(goal);
              const bar = root.querySelector('[role="progressbar"]');
              if (bar) bar.setAttribute('aria-valuenow', pct.toFixed(1));
            };
            // Re-apply once to use tweened version
            setVals(state.raised, state.goal);
          }
        })();
        {% if script_close is defined %}{{ script_close() }}{% else %}
