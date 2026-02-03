(() => {
  if (window.__aiConciergeBound) return; window.__aiConciergeBound = true;

  const dlg    = document.getElementById('ai-concierge');
  const btn    = document.getElementById('ai-concierge-btn');
  const closeB = dlg.querySelector('[data-close]');
  const clearB = document.getElementById('ai-clear');
  const exportB= document.getElementById('ai-export');
  const importB= document.getElementById('ai-import');
  const form   = document.getElementById('ai-chat-form');
  const input  = document.getElementById('ai-chat-input');
  const send   = document.getElementById('ai-send-btn');
  const micBtn = document.getElementById('ai-mic');
  const log    = document.getElementById('ai-chat-log');
  const typing = document.getElementById('typing-indicator');
  const suggEl = document.getElementById('ai-suggestions');
  const offlineEl = document.getElementById('ai-offline');
  const personasEl= document.getElementById('ai-personas');

  const POST_URL   = dlg.getAttribute('data-ai-post')   || '/api/ai/concierge';
  const STREAM_URL = dlg.getAttribute('data-ai-stream') || '/api/ai/stream';
  const MODE       = dlg.getAttribute('data-ai-mode')   || 'auto';
  const TEAM_ID    = dlg.getAttribute('data-team-id')   || 'global';
  const TEAM_NAME  = dlg.getAttribute('data-team-name') || 'FundChamps';
  const STATS_URL  = dlg.getAttribute('data-stats-url') || '/stats';
  const SUGGESTIONS= (()=>{ try { return JSON.parse(dlg.getAttribute('data-suggestions')||'[]'); } catch { return []; } })();
  const PERSONAS   = (()=>{ try { return JSON.parse(dlg.getAttribute('data-personas')||'[]'); } catch { return ['Sponsor','Parent','Coach']; } })();
  const FAQS       = (()=>{ try { return JSON.parse(dlg.getAttribute('data-faqs')||'[]'); } catch { return []; } })();

  const STORAGE_KEY = `fc:ai:thread:${TEAM_ID}`;
  const QUEUE_KEY   = `fc:ai:queue:${TEAM_ID}`;
  const TRENDS_KEY  = `fc:ai:trends:${TEAM_ID}`;
  const MAX_MSG = 60;

  // Global state
  let currentPersona = PERSONAS[0] || 'Sponsor';
  let lastStats = null;
  let lastController = null;
  let speech = null, recognizing = false;

  // Public API
  window.fcAI = window.fcAI || {};
  window.fcAI.open = (prefill) => { openModal(); if (prefill) { input.value = prefill; send.disabled = false; input.focus(); } };
  window.fcAI.ask  = (q) => { openModal(); input.value = q; send.disabled = false; form.requestSubmit?.(); };
  window.fcAI.setSuggestions = (arr=[]) => { try { renderSuggestions(arr); } catch {} };

  // Utils
  const escapeHtml = (t) => (t||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const renderMarkdownSafe = (txt) => {
    let s = escapeHtml(txt||'');
    s = s.replace(/`([^`]+)`/g,'<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g,'<em>$1</em>');
    s = s.replace(/\b(https?:\/\/[^\s<]+)\b/g,'<a href="$1" target="_blank" rel="nofollow noopener noreferrer">$1</a>');
    return s.replace(/\n/g,'<br>');
  };
  const appendHTML = (html) => { log.insertAdjacentHTML('beforeend', html); log.scrollTop = log.scrollHeight; };
  const addAIBlock = () => { appendHTML(`<p><strong>AI:</strong> <span class="ai-out"></span></p>`); return log.querySelector('.ai-out:last-of-type'); };
  const addUserBlock = (msg) => appendHTML(`<p><strong>You:</strong> ${renderMarkdownSafe(msg)}</p>`);
  const announce = (msg) => { try { typing.textContent = msg; typing.classList.remove('hidden'); setTimeout(()=>typing.classList.add('hidden'), 1200); } catch {} };

  const saveThread = () => {
    const rows = Array.from(log.querySelectorAll('p')).map(p => {
      const strong = p.querySelector('strong')?.innerText || '';
      const role = /You:/i.test(strong) ? 'user' : 'assistant';
      const html = p.innerHTML.replace(/^<strong>(You|AI):<\/strong>\s*/,'');
      return { role, html, ts: Date.now() };
    }).slice(-MAX_MSG);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch {}
  };
  const restoreThread = () => {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(rows) || !rows.length) return;
      log.innerHTML = '';
      rows.forEach(r => appendHTML(`<p><strong>${r.role === 'user' ? 'You' : 'AI'}:</strong> ${r.html}</p>`));
    } catch {}
  };

  // Personas
  function renderPersonas() {
    personasEl.innerHTML = (PERSONAS||[]).map((p,i)=>`<button type="button" class="rounded-full px-3 py-1 text-xs text-yellow-200 hover:bg-yellow-300/20" data-persona="${escapeHtml(p)}" aria-pressed="${i===0?'true':'false'}">${escapeHtml(p)}</button>`).join('');
  }
  renderPersonas();
  personasEl.addEventListener('click', (e)=>{
    const b = e.target.closest('[data-persona]'); if(!b) return;
    personasEl.querySelectorAll('[data-persona]').forEach(x=>x.setAttribute('aria-pressed','false'));
    b.setAttribute('aria-pressed','true');
    currentPersona = b.getAttribute('data-persona') || 'Sponsor';
    announce(`Persona set to ${currentPersona}`);
  });

  // Suggestions (merge base + FAQ Qs, trend-weighted, dedup)
  function getTrends(){ try { const t = JSON.parse(localStorage.getItem(TRENDS_KEY)||'{}'); return t && typeof t==='object' ? t : {}; } catch{ return {}; } }
  function bumpTrend(text){ try { const t = getTrends(); t[text] = (t[text]||0)+1; localStorage.setItem(TRENDS_KEY, JSON.stringify(t)); } catch{} }
  function renderSuggestions(list){
    const base = new Set([...(list||SUGGESTIONS), ...FAQS.map(f=>f.q)]);
    const all = Array.from(base);
    const trends = getTrends();
    all.sort((a,b)=>(trends[b]||0)-(trends[a]||0));
    suggEl.innerHTML = all.slice(0,10).map(t=>`<button type="button" class="rounded-full px-3 py-1 text-xs text-yellow-200 hover:bg-yellow-300/20">${escapeHtml(t)}</button>`).join('');
  }
  renderSuggestions();
  suggEl.addEventListener('click', (e)=>{ const b = e.target.closest('button'); if(!b) return; const txt = b.textContent.trim(); bumpTrend(txt); input.value = txt; send.disabled=false; form.requestSubmit?.(); });

  // Offline queue
  const setOfflineUI = (offline) => offlineEl.classList.toggle('hidden', !offline);
  const enqueue = (message) => { try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); q.push({ message, ts: Date.now(), persona: currentPersona }); localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {} };
  const flushQueue = async () => {
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); if (!q.length) return;
      localStorage.setItem(QUEUE_KEY,'[]');
      for (const item of q) { currentPersona = item.persona || currentPersona; await sendMessage(item.message, { queued: true }); }
    } catch {}
  };
  window.addEventListener('online', ()=>{ setOfflineUI(false); flushQueue(); });
  window.addEventListener('offline', ()=> setOfflineUI(true));

  // PII nudge
  const hasPII = (s) => /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(s) || /(?:\+?\d[\d\-\s()]{8,})/.test(s);

  // Stats snapshot (enrich context)
  async function fetchStats(){
    try{
      const res = await fetch(STATS_URL, { headers:{Accept:'application/json'} });
      if (!res.ok) return null;
      const d = await res.json();
      const raised = (d.raised ?? d.funds_raised) || 0;
      const goal   = (d.goal   ?? d.fundraising_goal) || 0;
      const pct    = goal ? Math.min(100, Math.max(0, (raised/goal*100))) : 0;
      return (lastStats = { raised, goal, pct: +pct.toFixed(1) });
    }catch{ return null; }
  }

  // Cooldown
  let lastSend = 0; const COOLDOWN_MS = 800;

  // Open/Close modal
  function openModal() {
    try { dlg.showModal?.(); } catch {}
    dlg.classList.remove('closed');
    document.body.style.overflow = 'hidden';
    btn.setAttribute('aria-expanded', 'true');
    restoreThread();
    setTimeout(() => input.focus(), 0);
    window.dispatchEvent(new CustomEvent('fc:ai:open', { detail: { team: TEAM_NAME } }));
    fetchStats(); // no await
  }
  function closeModal() {
    dlg.classList.add('closed');
    try { dlg.close?.(); } catch {}
    document.body.style.overflow = '';
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
    if (lastController){ try { lastController.abort(); } catch{} }
  }

  // Bindings
  btn.addEventListener('click', () => dlg.classList.contains('closed') ? openModal() : closeModal());
  closeB.addEventListener('click', closeModal);
  dlg.addEventListener('close', () => btn.focus());
  input.addEventListener('input', () => { send.disabled = input.value.trim() === ''; });

  clearB.addEventListener('click', () => {
    log.innerHTML = `<p><strong>AI:</strong> New conversation started. How can I help?</p>`;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    input.focus();
  });

  // Export (TXT + JSON)
  exportB.addEventListener('click', () => {
    const rows = Array.from(log.querySelectorAll('p')).map(p => ({ text: p.innerText, html: p.innerHTML, ts: Date.now() }));
    const txt  = rows.map(r => r.text).join('\n');
    const json = JSON.stringify({ team: TEAM_NAME, persona: currentPersona, rows }, null, 2);

    const dl = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000); };
    dl(`AI-Concierge-${TEAM_NAME}-${new Date().toISOString().slice(0,10)}.txt`, new Blob([txt],  { type: 'text/plain' }));
    dl(`AI-Concierge-${TEAM_NAME}-${new Date().toISOString().slice(0,10)}.json`, new Blob([json], { type: 'application/json' }));
  });

  // Import (JSON)
  importB.addEventListener('click', async () => {
    const inp = document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      try { const j = JSON.parse(await f.text()); if (Array.isArray(j.rows)){ log.innerHTML=''; j.rows.forEach(r=>appendHTML(`<p>${r.html||escapeHtml(r.text||'')}</p>`)); saveThread(); announce('Transcript imported'); } }
      catch { announce('Import failed'); }
    };
    inp.click();
  });

  // Streaming writer (SSE via fetch)
  async function streamTo(resp, outEl, controller) {
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buffer = '', rendered = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const m = line.match(/^data:\s*(.*)$/);
        if (!m) continue;
        const token = m[1];
        if (token && token !== '[DONE]') { rendered += token; outEl.innerHTML = renderMarkdownSafe(rendered); log.scrollTop = log.scrollHeight; }
      }
      if (controller.signal.aborted) break;
    }
  }

  // ---- FAQ matcher (instant, client-side) ---------------------------------
  const normalize = s => String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  const tokenize  = s => normalize(s).split(' ').filter(Boolean);
  function scoreFAQ(q, item){
    const qt = tokenize(q); const qi = new Set(qt);
    const k  = (item.k||[]).map(normalize);
    let score = 0;
    // keyword overlaps
    for (const kw of k){ if (qi.has(kw)) score += 3; }
    // question token overlap (soft)
    const it = new Set(tokenize(item.q));
    let hits = 0; for (const t of it){ if (qi.has(t)) hits++; }
    score += Math.min(3, hits);
    // substring
    if (normalize(q).includes(normalize(item.q).slice(0,18))) score += 2;
    return score;
  }
  function matchFAQ(q){
    if (!FAQS.length) return null;
    let best = null, bestScore = 0;
    for (const item of FAQS){
      const s = scoreFAQ(q, item);
      if (s > bestScore){ best = item; bestScore = s; }
    }
    // threshold tuned to avoid false positives
    return bestScore >= 4 ? best : null;
  }

  // Slash commands
  function trySlash(message){
    const m = message.trim();
    if (!m.startsWith('/')) return false;
    const cmd = m.split(/\s+/)[0].toLowerCase();
    if (cmd === '/donate' || cmd === '/sponsor') { window.openDonationModal?.(); window.location.hash = '#tiers'; return true; }
    if (cmd === '/schedule') { window.location.hash = '#program-stats-calendar'; return true; }
    if (cmd === '/faq') {
      const list = FAQS.map(f=>`• ${escapeHtml(f.q)}`).join('<br>');
      appendHTML(`<p><strong>AI:</strong> Here are common questions:<br>${list}<br><em>Tip:</em> click a chip below or type your question.</p>`);
      saveThread(); return true;
    }
    if (cmd === '/help') {
      appendHTML(`<p><strong>AI:</strong> Commands: <code>/donate</code>, <code>/sponsor</code>, <code>/schedule</code>, <code>/faq</code>, <code>/help</code>. Personas: ${PERSONAS.join(', ')}.</p>`);
      saveThread(); return true;
    }
    return false;
  }

  // Voice dictation (Web Speech API)
  try {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      speech = new SR(); speech.lang = 'en-US'; speech.interimResults = true; speech.continuous = false;
      speech.onresult = (e)=>{ let s=''; for (const res of e.results) s += res[0].transcript; input.value = s; send.disabled = !s.trim(); };
      speech.onstart  = ()=>{ recognizing = true; micBtn.setAttribute('aria-pressed','true'); micBtn.textContent='🛑'; };
      speech.onend    = ()=>{ recognizing = false; micBtn.setAttribute('aria-pressed','false'); micBtn.textContent='🎙️'; };
    } else { micBtn.disabled = true; micBtn.title = 'Voice not supported'; }
  } catch { micBtn.disabled = true; }
  micBtn.addEventListener('click', ()=>{ if (!speech) return; if (!recognizing) { try { speech.start(); } catch{} } else { try { speech.stop(); } catch{} } });

  // Core send logic
  async function sendMessage(message, { queued=false } = {}) {
    const now = Date.now(); if (now - lastSend < COOLDOWN_MS) { return; }
    lastSend = now;

    // Slash commands handled client-side
    if (trySlash(message)) return;

    const trimmed = message.trim().slice(0, 4000);
    addUserBlock(trimmed); saveThread();
    input.value = ''; send.disabled = true;
    typing.classList.remove('hidden'); log.setAttribute('aria-busy', 'true');

    // Minimal client pre-check (PII nudge)
    if (hasPII(trimmed)) { const ok = confirm('Your message looks like it includes contact info (email/phone). Share anyway?'); if (!ok) { typing.classList.add('hidden'); log.setAttribute('aria-busy','false'); return; } }

    // Try **local FAQ** first
    const hit = matchFAQ(trimmed);
    if (hit){
      const out = addAIBlock();
      out.innerHTML = renderMarkdownSafe(hit.a + '\n\n*Need anything else? Try* `/donate` *,* `/schedule`*, or ask another question.*');
      typing.classList.add('hidden'); log.setAttribute('aria-busy','false'); saveThread();
      try { dispatchEvent(new CustomEvent('fc:ai:faq_hit', { detail: { q: hit.q } })); } catch {}
      return;
    }

    // Context envelope
    const ctx = {
      team_id: TEAM_ID, team_name: TEAM_NAME, persona: currentPersona,
      page: location.pathname, ts: Date.now(), stats: lastStats
    };

    // 1) SSE streaming
    const trySSE = MODE === 'sse' || (MODE === 'auto' && STREAM_URL);
    if (trySSE && navigator.onLine) {
      try {
        const url = new URL(STREAM_URL, window.location.origin);
        url.searchParams.set('q', trimmed);
        url.searchParams.set('team_id', TEAM_ID);
        url.searchParams.set('persona', currentPersona);
        if (ctx.stats && typeof ctx.stats.raised === 'number') url.searchParams.set('pct', String(ctx.stats.pct));
        const controller = new AbortController(); lastController = controller;
        const resp = await fetch(url, { method: 'GET', headers: { Accept: 'text/event-stream' }, signal: controller.signal });
        if (resp.ok && resp.headers.get('content-type')?.includes('text/event-stream')) {
          const out = addAIBlock(); await streamTo(resp, out, controller);
          typing.classList.add('hidden'); log.setAttribute('aria-busy','false'); saveThread();
          window.dispatchEvent(new CustomEvent('fc:ai:reply', { detail: { mode: 'sse', queued } }));
          return;
        }
      } catch (_){}
    }

    // 2) HTMX POST
    if (window.htmx && navigator.onLine) {
      try {
        await htmx.ajax('POST', POST_URL, {
          values: { message: trimmed, team_id: TEAM_ID, team_name: TEAM_NAME, persona: currentPersona, context: JSON.stringify(ctx) },
          target: '#ai-chat-log',
          swap: 'beforeend'
        });
        typing.classList.add('hidden'); log.setAttribute('aria-busy','false'); saveThread();
        window.dispatchEvent(new CustomEvent('fc:ai:reply', { detail: { mode: 'htmx', queued } }));
        return;
      } catch (_){ }
    }

    // 3) Fetch JSON
    try {
      const resp = await fetch(POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ message: trimmed, team_id: TEAM_ID, team_name: TEAM_NAME, persona: currentPersona, context: ctx })
      });
      let reply = 'Sorry, something went wrong.';
      let actions = null;
      if (resp.ok) {
        const data = await resp.json().catch(()=>({}));
        if (data && typeof data.reply === 'string') reply = data.reply;
        if (data && data.actions) actions = data.actions;
      }
      typing.classList.add('hidden'); log.setAttribute('aria-busy','false');
      appendHTML(`<p><strong>AI:</strong> ${renderMarkdownSafe(reply)}</p>`); saveThread();
      handleActions(actions);
      window.dispatchEvent(new CustomEvent('fc:ai:reply', { detail: { mode: 'fetch', queued } }));
    } catch {
      typing.classList.add('hidden'); log.setAttribute('aria-busy','false');
      appendHTML(`<p class="text-red-300"><strong>AI:</strong> Network error. Try again.</p>`);
    }
  }

  // Optional backend actions contract: { actions: [{ type:'open_donate'|'update_meter', payload:{} }]}
  function handleActions(actions){
    if (!Array.isArray(actions)) return;
    for (const a of actions) {
      if (a?.type === 'open_donate') window.openDonationModal?.();
      if (a?.type === 'update_meter') window.dispatchEvent(new CustomEvent('fc:meter:update', { detail: a.payload || {} }));
    }
  }

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    if (!navigator.onLine) {
      addUserBlock(message + ' *(queued)*'); enqueue(message); setOfflineUI(true); saveThread();
      input.value=''; send.disabled=true; return;
    }
    if (!lastStats || (Date.now() % 3 === 0)) fetchStats();
    await sendMessage(message);
  });

  // Initial offline + prefill via ?ask=
  setOfflineUI(!navigator.onLine);
  try { const q = new URLSearchParams(location.search).get('ask'); if (q) setTimeout(() => window.fcAI.open(q), 300); } catch {}
})();
