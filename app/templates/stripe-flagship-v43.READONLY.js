<!--
⚠️ DO NOT MODIFY
Stripe live checkout logic.
Changes can cause double charges or failed payments.
-->


<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <meta name="csrf-token" content="{{ csrf_token() }}">

  <title>FutureFunded • Fundraiser</title>
  <meta name="description" content="Fast, mobile-first fundraising for youth teams, schools, nonprofits, and clubs — with transparent impact, sponsors, and instant receipts." />

  <!-- Social preview -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="FutureFunded • Fundraiser" />
  <meta property="og:description" content="Support the season with secure checkout and instant receipts." />
  <meta property="og:image" content="" />
  <meta name="twitter:card" content="summary_large_image" />

  <!-- App endpoints -->
  <meta name="ff-checkout-endpoint" content="/payments/stripe/intent" />
  <meta name="ff-status-endpoint" content="/api/status" />

  <!-- Stripe publishable key (READ ONLY) -->
  <meta name="ff-stripe-pk" content="{{ STRIPE_PUBLISHABLE_KEY }}">
  <meta name="stripe-pk" content="{{ STRIPE_PUBLISHABLE_KEY }}">

  <!-- Stripe.js -->
  <link rel="preconnect" href="https://js.stripe.com" crossorigin>
  <script src="https://js.stripe.com/v3/"></script>

  <meta name="theme-color" content="#0B1220" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#F7F8FC" media="(prefers-color-scheme: light)" />

  <style>
    /* ============================================================
      FutureFunded — Fundraiser UI — v4.1 (single-file)
      - Token system, light/dark
      - Sticky stack offset measured by JS
      - Accessible modals, focus-visible
    ============================================================ */

    :root{
      --bg: #F7F8FC;
      --surface: #FFFFFF;
      --surface-2: #F1F5FF;
      --surface-3: rgba(255,255,255,.72);
      --border: rgba(15, 23, 42, .12);

      --text: #0B1220;
      --muted: rgba(11, 18, 32, .72);
      --muted-2: rgba(11, 18, 32, .56);

      --primary: #1D4ED8;
      --primary-2: #163BB3;
      --primary-soft: rgba(29, 78, 216, .12);

      --accent: #FF3D2E;
      --success: #16A34A;
      --warning: #F59E0B;
      --danger: #EF4444;

      --max: 1160px;

      --r-sm: 14px;
      --r-md: 18px;
      --r-lg: 26px;
      --r-pill: 999px;

      --s-1: .5rem;
      --s-2: .75rem;
      --s-3: 1rem;
      --s-4: 1.5rem;
      --s-5: 2.25rem;
      --s-6: 3.25rem;

      --shadow-1: 0 10px 30px rgba(2,6,23,.08);
      --shadow-2: 0 22px 80px rgba(2,6,23,.14);
      --shadow-3: 0 36px 120px rgba(2,6,23,.18);

      --ring: 0 0 0 4px rgba(29, 78, 216, .22);
      --ease: cubic-bezier(.2,.9,.2,1);
      --t-fast: 140ms var(--ease);
      --t-med: 260ms var(--ease);
      --t-slow: 520ms var(--ease);

      --font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      --sm: .875rem;
      --base: 1rem;
      --lg: 1.125rem;
      --xl: 1.375rem;
      --h1: clamp(2.05rem, 6vw, 3.5rem);
      --h2: clamp(1.55rem, 3.8vw, 2.2rem);

      /* JS sets these to real values */
      --topbar-h: 0px;
      --header-h: 0px;
      --scroll-offset: 118px;
    }

    html[data-theme="dark"], body[data-theme="dark"]{
      --bg: #070A12;
      --surface: #0E1426;
      --surface-2: #0A1021;
      --surface-3: rgba(255,255,255,.06);
      --border: rgba(255,255,255,.14);

      --text: #F4F7FF;
      --muted: rgba(244,247,255,.72);
      --muted-2: rgba(244,247,255,.58);

      --primary-soft: rgba(29, 78, 216, .18);
      --shadow-1: 0 14px 44px rgba(0,0,0,.35);
      --shadow-2: 0 28px 90px rgba(0,0,0,.52);
      --shadow-3: 0 44px 140px rgba(0,0,0,.56);
      --ring: 0 0 0 4px rgba(29, 78, 216, .34);
    }

    *{ box-sizing:border-box; }
    html{ scroll-behavior:smooth; }
    @media (prefers-reduced-motion: reduce){
      html{ scroll-behavior:auto; }
      *,*::before,*::after{ animation:none !important; transition:none !important; }
    }

    body{
      margin:0;
      font-family:var(--font);
      font-size:var(--base);
      color:var(--text);
      min-height:100vh;
      -webkit-font-smoothing:antialiased;
      text-rendering:optimizeLegibility;
      overflow-x:hidden;
      background:
        radial-gradient(1200px 700px at 10% -10%, rgba(29,78,216,.18), transparent 60%),
        radial-gradient(1000px 700px at 95% -20%, rgba(255,61,46,.14), transparent 60%),
        radial-gradient(900px 650px at 70% 10%, rgba(99,102,241,.10), transparent 60%),
        linear-gradient(180deg, var(--bg), var(--bg));
    }

    body::before{
      content:"";
      position:fixed;
      inset:0;
      pointer-events:none;
      opacity:.065;
      mix-blend-mode:overlay;
      background-image:
        repeating-linear-gradient(0deg, rgba(255,255,255,.55), rgba(255,255,255,.55) 1px, transparent 1px, transparent 2px),
        repeating-linear-gradient(90deg, rgba(0,0,0,.35), rgba(0,0,0,.35) 1px, transparent 1px, transparent 3px);
      filter: blur(.2px);
      z-index:0;
    }
    html[data-theme="dark"] body::before{ opacity:.09; }

    a{ color:inherit; text-decoration:none; }
    img{ display:block; max-width:100%; }
    button, input, select, textarea{ font:inherit; }
    ::selection{ background: rgba(29,78,216,.22); }
    :focus-visible{ outline:none; box-shadow: var(--ring); border-color: rgba(29,78,216,.45) !important; }

    .container{ width:min(100% - 2rem, var(--max)); margin-inline:auto; position:relative; z-index:1; }
    @media (max-width:420px){ .container{ width:min(100% - 1.25rem, var(--max)); } }

    .sr-only{
      position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
      clip:rect(0,0,0,0);white-space:nowrap;border:0;
    }

    h1,h2,h3{ margin:0; letter-spacing:-.02em; }
    h1{ font-size:var(--h1); line-height:1.02; letter-spacing:-.03em; }
    h2{ font-size:var(--h2); line-height:1.15; }
    h3{ font-size:1.06rem; line-height:1.25; }
    p{ margin:0; line-height:1.6; color:var(--muted); }

    .kicker{
      font-size:.78rem;
      letter-spacing:.14em;
      text-transform:uppercase;
      font-weight:900;
      color:var(--muted);
    }
    .measure{ max-width:72ch; }
    .num{ font-variant-numeric: tabular-nums; }

    .divider{
      height:1px;
      background: linear-gradient(90deg, transparent, var(--border), transparent);
      margin: var(--s-4) 0;
    }

    .card{
      border:1px solid var(--border);
      border-radius:var(--r-lg);
      box-shadow:var(--shadow-1);
      background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.86));
    }
    html[data-theme="dark"] .card{
      background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.04));
    }
    .pad{ padding: var(--s-4); }
    .lift{ transition: transform var(--t-fast), box-shadow var(--t-fast), border-color var(--t-fast), background var(--t-fast); }
    @media (hover:hover){
      .lift:hover{ transform: translateY(-3px); box-shadow: var(--shadow-2); border-color: rgba(29,78,216,.26); }
    }

    .mini{
      border:1px solid var(--border);
      border-radius: var(--r-md);
      background: var(--surface-3);
      padding: var(--s-3);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .pill{
      display:inline-flex;
      align-items:center;
      gap:.5rem;
      padding:.35rem .72rem;
      border-radius:var(--r-pill);
      border:1px solid var(--border);
      background: var(--surface-3);
      color: var(--muted);
      font-size:.82rem;
      font-weight:900;
      white-space:nowrap;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .pill-dot{
      width:.55rem;height:.55rem;border-radius:999px;
      background: var(--accent);
      box-shadow: 0 0 0 4px rgba(255,61,46,.12);
    }
    .pill-verified{
      border-color: rgba(34,197,94,.25);
      background: linear-gradient(180deg, rgba(34,197,94,.12), rgba(255,255,255,.02));
      color: var(--text);
    }
    html[data-theme="dark"] .pill-verified{
      background: linear-gradient(180deg, rgba(34,197,94,.16), rgba(255,255,255,.02));
    }
    .pill-live{
      color: var(--text);
      border-color: rgba(255,61,46,.30);
      background: linear-gradient(180deg, rgba(255,61,46,.12), rgba(255,255,255,.02));
    }
    .pill-muted{ opacity:.95; }
    .pill-accent{
      color: var(--text);
      border-color: rgba(29,78,216,.35);
      background: linear-gradient(135deg, rgba(29,78,216,.18), rgba(255,255,255,.02));
    }

    .btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:.55rem;
      padding:.82rem 1.05rem;
      min-height:44px;
      border-radius:var(--r-pill);
      border:1px solid transparent;
      cursor:pointer;
      font-weight:950;
      user-select:none;
      touch-action:manipulation;
      transition: transform var(--t-fast), box-shadow var(--t-fast), background var(--t-fast), border-color var(--t-fast), opacity var(--t-fast);
      white-space:nowrap;
    }
    .btn:active{ transform: translateY(1px); }
    .btn[disabled], .btn[aria-disabled="true"]{ opacity:.55; cursor:not-allowed; transform:none !important; box-shadow:none !important; }

    .btn-primary{
      color:#fff;
      background: linear-gradient(135deg, var(--primary), var(--primary-2));
      box-shadow: 0 16px 44px rgba(29,78,216,.26);
    }
    @media (hover:hover){
      .btn-primary:hover{ transform: translateY(-2px); box-shadow: 0 22px 70px rgba(29,78,216,.36); }
    }

    .btn-secondary{
      background: var(--surface-3);
      border-color: var(--border);
      color: var(--text);
      box-shadow: 0 1px 0 rgba(255,255,255,.65) inset;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    html[data-theme="dark"] .btn-secondary{ box-shadow: 0 1px 0 rgba(255,255,255,.10) inset; }
    @media (hover:hover){
      .btn-secondary:hover{ background: var(--primary-soft); border-color: rgba(29,78,216,.35); transform: translateY(-1px); }
    }

    .btn-ghost{
      background: transparent;
      border-color: var(--border);
      color: var(--text);
    }
    @media (hover:hover){
      .btn-ghost:hover{ background: rgba(255,255,255,.50); }
      html[data-theme="dark"] .btn-ghost:hover{ background: rgba(255,255,255,.06); }
    }

    .btn-sm{ padding:.6rem .85rem; min-height:40px; font-size:var(--sm); }
    .btn.block{ width:100%; }

    .icon-btn{
      width:44px;height:44px;
      display:grid;place-items:center;
      border-radius:16px;
      border:1px solid var(--border);
      background: var(--surface-3);
      cursor:pointer;
      transition: transform var(--t-fast), background var(--t-fast), border-color var(--t-fast), opacity var(--t-fast);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: var(--text);
    }
    @media (hover:hover){
      .icon-btn:hover{ transform: translateY(-1px); border-color: rgba(29,78,216,.35); }
    }
    .icon-btn[disabled],
    .icon-btn[aria-disabled="true"]{ opacity:.55; cursor:not-allowed; transform:none; }

    .hide-mobile{ display:none; }
    @media (min-width: 980px){ .hide-mobile{ display:inline-flex; } }

    .topbar{
      position: sticky;
      top: 0;
      z-index: 90;
      padding-top: env(safe-area-inset-top);
      border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,.62);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
    html[data-theme="dark"] .topbar{ background: rgba(10,15,29,.70); }

    .topbar-row{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: var(--s-2);
      padding:.6rem 0;
    }
    .topbar-left{
      display:flex;
      align-items:center;
      flex-wrap:wrap;
      gap:.5rem;
      min-width:0;
    }
    .topbar-right{ display:flex; gap:.5rem; align-items:center; }

    .site-header{
      position: sticky;
      top: var(--topbar-h);
      z-index: 80;
      border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,.58);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
    html[data-theme="dark"] .site-header{ background: rgba(14,20,38,.72); }
    .site-header[data-scrolled="true"]{ box-shadow: var(--shadow-1); }

    .header-row{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: var(--s-2);
      padding: .85rem 0;
    }

    .brand{
      display:flex;
      align-items:center;
      gap:.75rem;
      min-width:0;
    }
    .brand-mark{
      width:44px;height:44px;
      border-radius:16px;
      border:1px solid var(--border);
      display:grid;
      place-items:center;
      background:
        radial-gradient(circle at 25% 20%, rgba(255,61,46,.22), transparent 60%),
        radial-gradient(circle at 80% 90%, rgba(29,78,216,.26), transparent 55%),
        linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.55));
      box-shadow: var(--shadow-1);
      font-weight: 950;
      letter-spacing: .08em;
      overflow:hidden;
    }
    html[data-theme="dark"] .brand-mark{
      background:
        radial-gradient(circle at 25% 20%, rgba(255,61,46,.18), transparent 60%),
        radial-gradient(circle at 80% 90%, rgba(29,78,216,.22), transparent 55%),
        rgba(255,255,255,.06);
    }
    .brand-logo{ width:100%;height:100%; object-fit:cover; }
    .brand-text{ display:grid; gap:.1rem; min-width:0; }
    .brand-title{ font-weight: 950; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; }
    .brand-sub{ font-size: var(--sm); color: var(--muted); white-space: nowrap; overflow:hidden; text-overflow: ellipsis; }

    .nav-links{
      display:none;
      align-items:center;
      gap: .35rem;
      margin-left: var(--s-4);
      padding: .35rem;
      border-radius: var(--r-pill);
      border:1px solid transparent;
    }
    .nav-links a{
      font-weight: 950;
      color: var(--muted);
      padding: .45rem .7rem;
      border-radius: 999px;
      transition: background var(--t-fast), color var(--t-fast), transform var(--t-fast);
    }
    .nav-links a[data-active="true"]{
      background: var(--primary-soft);
      color: var(--text);
      border: 1px solid rgba(29,78,216,.25);
    }
    @media (hover:hover){
      .nav-links a:hover{ color: var(--text); background: rgba(255,255,255,.52); transform: translateY(-1px); }
      html[data-theme="dark"] .nav-links a:hover{ background: rgba(255,255,255,.06); }
    }
    .nav-links a.nav-cta{
      color: var(--text);
      background: linear-gradient(135deg, rgba(29,78,216,.14), rgba(255,255,255,.02));
      border: 1px solid rgba(29,78,216,.25);
    }
    .header-actions{ display:flex; align-items:center; gap:.5rem; }

    @media (min-width: 980px){
      .nav-links{ display:flex; }
      .menu-toggle{ display:none; }
    }

    .drawer{
      position:fixed;
      inset:0;
      z-index: 200;
      display:none;
    }
    .drawer[data-open="true"]{ display:block; }
    .drawer-backdrop{ position:absolute; inset:0; background: rgba(0,0,0,.48); }
    .drawer-panel{
      position:absolute;
      top: calc(.85rem + env(safe-area-inset-top));
      left:1rem; right:1rem;
      border-radius: calc(var(--r-lg) + .25rem);
      border:1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-3);
      padding:.85rem;
      transform: translateY(-10px);
      opacity:0;
      transition: transform var(--t-med), opacity var(--t-med);
    }
    html[data-theme="dark"] .drawer-panel{ background: rgba(14,20,38,.96); }
    .drawer[data-open="true"] .drawer-panel{ transform: translateY(0); opacity:1; }

    .drawer-list{ display:grid; gap:.4rem; margin-top:.45rem; }
    .drawer-link{
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding: .95rem .95rem;
      border-radius: 18px;
      border:1px solid transparent;
      font-weight: 950;
      background: transparent;
      transition: background var(--t-fast), border-color var(--t-fast), transform var(--t-fast);
    }
    .drawer-primary{
      background: linear-gradient(135deg, rgba(29,78,216,.18), rgba(255,255,255,.02));
      border-color: rgba(29,78,216,.25);
    }
    @media (hover:hover){
      .drawer-link:hover{ background: var(--surface-2); border-color: rgba(29,78,216,.20); transform: translateY(-1px); }
      html[data-theme="dark"] .drawer-link:hover{ background: rgba(255,255,255,.06); }
    }

    main{ display:block; }
    section{ scroll-margin-top: var(--scroll-offset); }

    .section{ padding: var(--s-6) 0; }
    .section-head{ display:grid; gap:.6rem; margin-bottom: var(--s-3); }

    .hero{ padding: var(--s-6) 0 var(--s-4); }
    .hero-grid{ display:grid; gap: 1.25rem; align-items:start; }
    @media (min-width: 980px){
      .hero-grid{ grid-template-columns: 1.18fr .82fr; gap: 2rem; }
    }
    .hero-badges{ display:flex; flex-wrap:wrap; gap:.5rem; }

    .accent{
      background: linear-gradient(90deg, var(--accent), rgba(255,61,46,.92), var(--primary));
      -webkit-background-clip:text;
      background-clip:text;
      color:transparent;
    }

    .hero-actions{
      display:flex; flex-wrap:wrap; gap:.75rem;
      margin-top: var(--s-3);
      align-items:center;
    }

    .hero-subgrid{
      margin-top: var(--s-3);
      display:grid;
      gap: var(--s-2);
      grid-template-columns: 1fr;
    }
    @media (min-width: 720px){
      .hero-subgrid{ grid-template-columns: 1fr 1fr; }
    }

    .meter{
      height: 12px;
      border-radius: var(--r-pill);
      border: 1px solid var(--border);
      background: var(--surface-2);
      overflow:hidden;
      box-shadow: 0 1px 0 rgba(255,255,255,.65) inset;
      position:relative;
    }
    html[data-theme="dark"] .meter{ background: rgba(255,255,255,.06); box-shadow: 0 1px 0 rgba(255,255,255,.10) inset; }

    .meter > span{
      display:block;
      height:100%;
      width:0%;
      border-radius: var(--r-pill);
      background: linear-gradient(90deg, var(--primary), rgba(29,78,216,.65), var(--accent));
      transition: width var(--t-med);
      position:relative;
      will-change: width;
    }
    .meter > span::after{
      content:"";
      position:absolute;
      top:0; bottom:0;
      width:140px;
      left:-160px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
      transform: skewX(-18deg);
      animation: shine 4.8s linear infinite;
      opacity: .9;
    }
    @keyframes shine{
      0%{ left:-160px; }
      45%{ left: calc(100% + 160px); }
      100%{ left: calc(100% + 160px); }
    }
    @media (prefers-reduced-motion: reduce){
      .meter > span::after{ display:none; }
    }

    .milestones{ position:absolute; inset:0; pointer-events:none; }
    .milestones i{
      position:absolute;
      top:50%;
      transform: translate(-50%, -50%);
      width:10px;height:10px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.55);
      background: rgba(11,18,32,.20);
      box-shadow: 0 8px 18px rgba(0,0,0,.08);
      opacity:.9;
    }
    html[data-theme="dark"] .milestones i{
      border-color: rgba(255,255,255,.32);
      background: rgba(255,255,255,.10);
      box-shadow: 0 10px 22px rgba(0,0,0,.28);
    }

    .stat-row{
      display:flex;
      justify-content:space-between;
      gap: var(--s-2);
      flex-wrap:wrap;
      margin-top: .65rem;
      color: var(--muted);
      font-size: var(--sm);
    }
    .big-raise{
      font-size: 1.85rem;
      font-weight: 950;
      letter-spacing: -.02em;
      color: var(--text);
    }

    .grid{ display:grid; grid-template-columns: 1fr; gap: var(--s-3); }
    @media (min-width: 920px){
      .grid-2{ grid-template-columns: repeat(2, minmax(0,1fr)); }
      .grid-3{ grid-template-columns: repeat(3, minmax(0,1fr)); }
    }

    .chip-row{ display:flex; flex-wrap:wrap; gap:.5rem; }
    .chip{
      border-radius: var(--r-pill);
      border: 1px solid var(--border);
      background: var(--surface-3);
      padding: .6rem .9rem;
      min-height: 40px;
      font-weight: 950;
      font-size: var(--sm);
      cursor:pointer;
      transition: transform var(--t-fast), background var(--t-fast), border-color var(--t-fast);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: var(--text);
    }
    @media (hover:hover){
      .chip:hover{ transform: translateY(-1px); background: var(--primary-soft); border-color: rgba(29,78,216,.35); }
    }
    .chip[aria-pressed="true"]{ background: var(--primary-soft); border-color: rgba(29,78,216,.55); }

    .impact-card{
      text-align:left;
      border-radius: var(--r-lg);
      border: 1px solid var(--border);
      background: var(--surface-3);
      padding: var(--s-4);
      cursor:pointer;
      box-shadow: var(--shadow-1);
      transition: transform var(--t-fast), border-color var(--t-fast), background var(--t-fast), box-shadow var(--t-fast);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      color: var(--text);
    }
    @media (hover:hover){
      .impact-card:hover{ transform: translateY(-2px); border-color: rgba(29,78,216,.35); background: var(--primary-soft); box-shadow: var(--shadow-2); }
    }
    .impact-card[aria-pressed="true"]{ border-color: rgba(29,78,216,.55); background: var(--primary-soft); }

    .tag{
      display:inline-flex;
      align-items:center;
      padding:.28rem .65rem;
      border-radius: var(--r-pill);
      border: 1px solid var(--border);
      font-size:.78rem;
      font-weight:900;
      letter-spacing:.06em;
      text-transform:uppercase;
      color: var(--muted);
      background: rgba(255,255,255,.55);
    }
    html[data-theme="dark"] .tag{ background: rgba(255,255,255,.06); }

    .badge{
      display:inline-flex;
      align-items:center;
      padding:.28rem .6rem;
      border-radius: var(--r-pill);
      border: 1px solid rgba(255,61,46,.38);
      background: rgba(255,61,46,.12);
      color: var(--text);
      font-size:.78rem;
      font-weight:950;
      letter-spacing:.06em;
      text-transform:uppercase;
      white-space:nowrap;
    }

    .impact-top{ display:flex; align-items:center; justify-content:space-between; gap:.75rem; }
    .impact-amt{ margin-top:.75rem; font-weight:950; font-size:1.4rem; color:var(--text); }
    .impact-title{ margin-top:.25rem; font-weight:950; color:var(--text); }
    .impact-desc{ margin-top:.3rem; font-size:var(--sm); color:var(--muted); }
    .impact-hint{ margin-top:.85rem; font-size:var(--sm); font-weight:950; color:var(--text); opacity:.92; }

    .team-card{
      overflow:hidden;
      border-radius: var(--r-lg);
      border: 1px solid var(--border);
      background: var(--surface-3);
      box-shadow: var(--shadow-1);
      display:grid;
      grid-template-rows: auto 1fr;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      position:relative;
    }
    .team-media{
      padding: var(--s-3);
      background:
        radial-gradient(700px 260px at 20% 0%, rgba(29,78,216,.14), transparent 60%),
        radial-gradient(700px 260px at 90% 10%, rgba(255,61,46,.12), transparent 55%),
        var(--surface-2);
      border-bottom: 1px solid var(--border);
    }
    .team-img{
      width:100%;
      aspect-ratio: 16/9;
      border-radius: var(--r-md);
      border:1px solid var(--border);
      background: rgba(255,255,255,.55);
      object-fit:cover;
      box-shadow: 0 1px 0 rgba(255,255,255,.60) inset;
    }
    .team-body{ padding: var(--s-4); display:grid; gap:.9rem; }
    .team-head{ display:flex; justify-content:space-between; gap: var(--s-2); align-items:flex-start; }
    .team-name{ font-weight: 950; color: var(--text); }
    .team-blurb{ font-size: var(--sm); color: var(--muted); margin-top:.2rem; }
    .team-raise{ font-weight: 950; color: var(--text); }

    .leaderboard{ display:grid; gap:.7rem; margin-top: var(--s-3); }
    .leader{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: var(--s-2);
      padding:.8rem .9rem;
      border-radius: var(--r-md);
      border: 1px solid var(--border);
      background: var(--surface-3);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .leader-left{ display:flex; align-items:center; gap:.75rem; min-width:0; }
    .rank{
      width:34px;height:34px;
      display:grid;place-items:center;
      border-radius: 14px;
      border:1px solid var(--border);
      background: var(--surface-2);
      font-weight: 950;
      color: var(--text);
      flex: 0 0 auto;
    }
    .leader-name{ font-weight:950; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .leader-meta{ font-size:.8rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .leader-amt{ font-weight:950; color:var(--text); }

    .tier{
      border-radius: var(--r-lg);
      border: 1px solid var(--border);
      background: var(--surface-3);
      box-shadow: var(--shadow-1);
      padding: var(--s-4);
      display:grid;
      gap:.8rem;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }
    .tier-row{ display:flex; justify-content:space-between; gap: var(--s-2); align-items:flex-start; }
    .tier-price{ font-weight:950; color:var(--text); }
    .tier-desc{ font-size: var(--sm); color: var(--muted); }

    form{ display:grid; gap: var(--s-3); }
    .field{ display:grid; gap:.45rem; }
    label{
      font-size:.78rem;
      letter-spacing:.14em;
      text-transform:uppercase;
      color: var(--muted);
      font-weight:900;
    }
    input, select, textarea{
      width:100%;
      border-radius: 16px;
      border: 1px solid var(--border);
      padding: .9rem .95rem;
      background: rgba(255,255,255,.86);
      color: var(--text);
      box-shadow: 0 1px 0 rgba(255,255,255,.65) inset;
      transition: border-color var(--t-fast), background var(--t-fast), box-shadow var(--t-fast);
    }
    html[data-theme="dark"] input,
    html[data-theme="dark"] select,
    html[data-theme="dark"] textarea{
      background: rgba(255,255,255,.06);
      box-shadow: 0 1px 0 rgba(255,255,255,.10) inset;
    }
    input::placeholder, textarea::placeholder{ color: rgba(120,120,120,.80); }
    textarea{ min-height: 104px; resize: vertical; }

    .segmented{
      display:flex;
      flex-wrap:wrap;
      gap:.4rem;
      padding:.35rem;
      border-radius: var(--r-pill);
      border:1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
    }
    html[data-theme="dark"] .segmented{ background: rgba(255,255,255,.06); }
    .segmented button{
      border:1px solid transparent;
      background: transparent;
      border-radius: var(--r-pill);
      padding:.6rem .9rem;
      font-weight:950;
      font-size: var(--sm);
      color: var(--text);
      cursor:pointer;
      transition: background var(--t-fast), border-color var(--t-fast), transform var(--t-fast), opacity var(--t-fast);
    }
    @media (hover:hover){
      .segmented button:hover{ transform: translateY(-1px); }
    }
    .segmented button[aria-pressed="true"]{
      background: var(--primary-soft);
      border-color: rgba(29,78,216,.55);
    }
    .segmented button[aria-disabled="true"]{ opacity:.55; cursor:not-allowed; }

    .help{ font-size: var(--sm); color: var(--muted); }
    .checks{ display:grid; gap:.65rem; }
    .check{ display:flex; gap:.6rem; align-items:flex-start; font-size: var(--sm); color: var(--muted); }
    .check input{ width:18px;height:18px; margin-top:.12rem; }

    .alert{
      border:1px solid rgba(239,68,68,.35);
      background: rgba(239,68,68,.10);
      color: var(--text);
      padding:.9rem .95rem;
      border-radius: var(--r-md);
      font-size: var(--sm);
    }

    .gifts{ display:grid; gap:.6rem; margin-top: var(--s-3); }
    .gift{
      display:flex;
      justify-content:space-between;
      gap: var(--s-2);
      padding:.75rem .85rem;
      border-radius: var(--r-md);
      border:1px solid var(--border);
      background: var(--surface-3);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .gift .who{ font-weight:950; color: var(--text); }
    .gift .when{ font-size:.82rem; color: var(--muted); }
    .gift .amt{ font-weight:950; color: var(--text); white-space:nowrap; }

    footer{
      padding: var(--s-6) 0;
      border-top:1px solid var(--border);
      color: var(--muted);
    }
    .footer-links{ display:flex; flex-wrap:wrap; gap: 1rem; list-style:none; padding:0; margin:0; }
    .footer-links a{
      color: var(--muted);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    @media (hover:hover){
      .footer-links a:hover{ color: var(--text); }
    }
    .footer-legal{ text-decoration: underline; text-underline-offset: 3px; }

    .sticky{
      position: fixed;
      left:0; right:0;
      bottom: calc(.75rem + env(safe-area-inset-bottom));
      z-index: 120;
      display:flex;
      justify-content:center;
      pointer-events:none;
    }
    .sticky-inner{
      pointer-events:auto;
      width: min(100% - 1.5rem, 860px);
      border-radius: var(--r-lg);
      border:1px solid var(--border);
      background: rgba(255,255,255,.66);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      box-shadow: var(--shadow-3);
      padding:.75rem .9rem;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: var(--s-2);
      transform: translateY(140%);
      opacity:0;
      transition: transform var(--t-med), opacity var(--t-med);
    }
    html[data-theme="dark"] .sticky-inner{ background: rgba(14,20,38,.74); }
    .sticky[data-show="true"] .sticky-inner{ transform: translateY(0); opacity:1; }
    .sticky-mini{ display:grid; gap:.1rem; min-width:0; }
    .sticky-top{ font-size:.78rem; letter-spacing:.14em; text-transform:uppercase; font-weight:900; color: var(--muted); }
    .sticky-bot{ font-size: var(--sm); color: var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    .modal{
      position: fixed;
      inset: 0;
      z-index: 300;
      display:none;
      padding: 1rem;
      background: rgba(0,0,0,.55);
    }
    .modal[data-open="true"]{ display:grid; place-items:center; }
    .modal-panel{
      width: min(940px, 100%);
      border-radius: calc(var(--r-lg) + .2rem);
      border:1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-3);
      overflow:hidden;
    }
    html[data-theme="dark"] .modal-panel{ background: rgba(14,20,38,.96); }
    .modal-body{ padding: var(--s-4); display:grid; gap: var(--s-3); }
    .modal-head{ display:flex; align-items:flex-start; justify-content:space-between; gap: var(--s-2); }
    .modal-title{ font-size: var(--xl); font-weight: 950; color: var(--text); }

    #paymentElementWrap{
      border-radius: var(--r-md);
      border:1px solid var(--border);
      background: rgba(255,255,255,.62);
      overflow:hidden;
      padding: .85rem;
    }
    html[data-theme="dark"] #paymentElementWrap{ background: rgba(255,255,255,.06); }

    .modal-actions{
      display:flex;
      gap:.6rem;
      flex-wrap:wrap;
      align-items:center;
    }

    .toast-host{
      position: fixed;
      inset-inline:0;
      top: calc(.85rem + env(safe-area-inset-top));
      z-index: 350;
      display:flex;
      justify-content:center;
      pointer-events:none;
      padding-inline: 1rem;
    }
    .toast{
      pointer-events:auto;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:.75rem;
      width: min(740px, 100%);
      padding:.8rem .9rem;
      border-radius: var(--r-lg);
      border:1px solid var(--border);
      background: rgba(255,255,255,.72);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      box-shadow: var(--shadow-3);
      transform: translateY(-12px);
      opacity:0;
      transition: transform var(--t-med), opacity var(--t-med);
    }
    html[data-theme="dark"] .toast{ background: rgba(14,20,38,.80); }
    .toast[data-show="true"]{ transform: translateY(0); opacity:1; }
    .toast-text{ color: var(--text); font-weight: 950; }
    .toast-close{
      width:44px;height:44px;
      border-radius:16px;
      border:1px solid var(--border);
      background: transparent;
      cursor:pointer;
      display:grid;
      place-items:center;
      color: var(--text);
    }

    .back-to-top{
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      z-index: 1000;
      display: none;
      width: 44px;
      height: 44px;
      border-radius: 16px;
      border: 1px solid var(--border);
      background: var(--surface-3);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      cursor: pointer;
      font-weight: 950;
      color: var(--text);
      transition: transform var(--t-fast), border-color var(--t-fast);
    }
    @media (hover:hover){
      .back-to-top:hover{ transform: translateY(-1px); border-color: rgba(29,78,216,.35); }
    }

    /* Minimal helpers for donate/footer BEM classes used in markup */
    .donate__actions{ display:flex; gap:.6rem; flex-wrap:wrap; }
    .site-footer__top{ display:flex; flex-direction:column; gap: var(--s-3); }
    @media (min-width: 860px){
      .site-footer__top{ flex-direction:row; align-items:flex-start; justify-content:space-between; }
    }
    .site-footer__contact{ display:grid; gap:.15rem; margin-top:.75rem; font-style:normal; }
    .site-footer__support{ font-weight:950; text-decoration: underline; text-underline-offset:3px; }
    .site-footer__trust-inner{ display:flex; flex-direction:column; gap: var(--s-3); }
    @media (min-width: 860px){
      .site-footer__trust-inner{ flex-direction:row; align-items:center; justify-content:space-between; }
    }
    .site-footer__trust-list{ margin:.6rem 0 0; padding-left:1.1rem; }
    .site-footer__legal{ margin-top: var(--s-3); display:grid; gap:.25rem; }

    @media (max-width: 640px){
      h1{ font-size: 1.9rem; line-height: 1.15; }
      h2{ font-size: 1.35rem; }
      .pad{ padding: 1.05rem; }
      .chip{ min-height: 42px; }
    }
  </style>
</head>

<body>
  <a class="sr-only" href="#content">Skip to main content</a>

  <!-- Top announcement -->
  <div class="topbar" role="region" aria-label="Fundraiser announcement" id="topbar">
    <div class="container">
      <div class="topbar-row">
        <div class="topbar-left" aria-label="Trust signals">
          <span class="pill pill-live" aria-label="Live fundraiser">
            <span class="pill-dot" aria-hidden="true"></span>
            <span>LIVE</span>
          </span>

          <span class="pill pill-muted" id="matchPill" hidden>Match active</span>
          <span class="pill pill-muted">Secure checkout</span>
          <span class="pill pill-muted">Instant receipts</span>

          <span class="pill pill-accent" id="countdownPill" aria-live="polite">Ends soon</span>
        </div>

        <div class="topbar-right">
          <button class="btn btn-secondary btn-sm" type="button" id="shareBtnTop">Share</button>
          <a class="btn btn-primary btn-sm" href="#donate">Donate</a>

          <button class="icon-btn" type="button" id="topbarDismiss" aria-label="Dismiss announcement">
            ✕
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Header -->
  <header class="site-header" id="top" role="banner">
    <div class="container">
      <div class="header-row">
        <a class="brand" href="#top" aria-label="Fundraiser home">
          <div class="brand-mark" aria-hidden="true" id="brandMark">FF</div>
          <div class="brand-text">
            <div class="brand-title" id="orgName">Program</div>
            <div class="brand-sub" id="orgMeta">Season fundraiser</div>
          </div>
        </a>

        <nav class="nav-links" aria-label="Primary navigation" id="navLinks">
          <a href="#progress" data-spy="progress">Progress</a>
          <a href="#impact" data-spy="impact">Impact</a>
          <a href="#teams" data-spy="teams">Teams</a>
          <a href="#sponsors" data-spy="sponsors">Sponsors</a>
          <a href="#donate" data-spy="donate" class="nav-cta">Donate</a>
        </nav>

        <div class="header-actions" aria-label="Header actions">
          <span class="pill pill-verified" aria-label="Verified fundraiser">Verified</span>

          <button class="icon-btn" type="button" id="themeToggle" aria-label="Toggle dark mode" aria-pressed="false">
            ☾
          </button>

          <button class="icon-btn menu-toggle" type="button" id="menuOpen" aria-label="Open menu" aria-expanded="false" aria-controls="mobileDrawer">
            ≡
          </button>

          <a class="btn btn-primary btn-sm hide-mobile" href="#donate">Donate</a>
        </div>
      </div>
    </div>
  </header>

  <!-- Mobile nav drawer -->
  <div class="drawer" id="mobileDrawer" data-open="false" role="dialog" aria-modal="true" aria-label="Mobile navigation">
    <div class="drawer-backdrop" data-close="true" aria-hidden="true"></div>

    <div class="drawer-panel" role="document">
      <div class="kicker">Navigate</div>

      <div class="drawer-list" role="list">
        <a class="drawer-link" role="listitem" href="#progress">Progress <span aria-hidden="true">→</span></a>
        <a class="drawer-link" role="listitem" href="#impact">Impact <span aria-hidden="true">→</span></a>
        <a class="drawer-link" role="listitem" href="#teams">Teams <span aria-hidden="true">→</span></a>
        <a class="drawer-link" role="listitem" href="#sponsors">Sponsors <span aria-hidden="true">→</span></a>
        <a class="drawer-link drawer-primary" role="listitem" href="#donate">Donate <span aria-hidden="true">→</span></a>
      </div>

      <div class="divider" aria-hidden="true"></div>

      <div style="display:flex; gap:.6rem; flex-wrap:wrap;">
        <button class="btn btn-secondary" type="button" id="shareBtnDrawer">Share</button>
        <button class="btn btn-ghost" type="button" id="copyLinkBtn">Copy link</button>
        <button class="btn btn-ghost btn-sm" type="button" data-close="true" aria-label="Close menu">Close</button>
      </div>
    </div>
  </div>

  <main id="content" tabindex="-1">
    <!-- Hero -->
    <section class="hero" aria-labelledby="heroTitle">
      <div class="container hero-grid">
        <div>
          <div class="hero-badges" aria-label="Fundraiser context">
            <span class="pill" id="seasonPill">Season Fund</span>
            <span class="pill">Live progress</span>
            <span class="pill" id="sportPill">Youth sports</span>
          </div>

          <h1 id="heroTitle" style="margin-top: var(--s-3);">
            Fuel the season.<br />
            <span class="accent">Fund the future.</span>
          </h1>

          <p class="measure" id="heroCopy" style="margin-top: var(--s-3);">
            This fund keeps the program accessible — covering <strong>uniforms &amp; gear</strong>,
            <strong>hydration &amp; snacks</strong>, <strong>travel + tournament fees</strong>, and
            <strong>scholarships</strong> so kids don’t get priced out of high-level competition.
          </p>

          <p class="measure" style="margin-top: var(--s-2);" id="heroCopy2">
            Every gift reduces the burden and keeps more athletes on the same schedule.
          </p>

          <div class="hero-actions" role="group" aria-label="Primary actions">
            <a class="btn btn-primary" href="#donate">Donate</a>
            <a class="btn btn-secondary" href="#sponsors">View sponsors</a>
            <button class="btn btn-ghost" type="button" id="copyLinkBtn2">Copy link</button>
          </div>

          <div class="hero-subgrid" aria-label="Highlights">
            <div class="mini">
              <div class="kicker">Trust</div>
              <h3 style="margin-top:.35rem;">Receipt-ready + privacy-first</h3>
              <p class="help" style="margin-top:.35rem;">
                Receipts email instantly. Donor info is used for receipts and optional updates — never sold.
              </p>
            </div>
            <div class="mini">
              <div class="kicker">Next up</div>
              <h3 style="margin-top:.35rem;" id="eventTitle">Upcoming event</h3>
              <p class="help" style="margin-top:.35rem;" id="eventCountdown">Loading…</p>
            </div>
          </div>

          <div class="divider" aria-hidden="true"></div>

          <article class="card pad lift" aria-label="Recent gifts" id="recentGiftsCard">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:var(--s-2); flex-wrap:wrap;">
              <div>
                <div class="kicker">Momentum</div>
                <h3 style="margin-top:.35rem;">Recent gifts</h3>
                <p class="help measure" style="margin-top:.35rem;">
                  Social proof matters. Enable anonymous gifts in your backend to turn this into a conversion engine.
                </p>
              </div>
              <button class="btn btn-secondary btn-sm" type="button" id="shareBtnGifts">Share</button>
            </div>
            <div class="gifts" id="giftsList" aria-label="Recent gifts list"></div>
          </article>
        </div>

        <aside aria-label="Progress and quick donate">
          <article class="card pad lift" id="progress" aria-labelledby="progressTitle">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: var(--s-2); flex-wrap:wrap;">
              <div>
                <div class="kicker">Progress</div>
                <h2 id="progressTitle" class="sr-only">Fundraising progress</h2>
                <div class="big-raise num" id="raisedBig">$0</div>
                <div class="help">
                  <span class="num" id="remainingText">$0</span> to go •
                  <span class="num" id="deadlineText">—</span>
                </div>
              </div>
              <span class="pill" aria-label="Goal amount">Goal <span class="num" id="goalPill">$0</span></span>
            </div>

            <div class="divider" aria-hidden="true"></div>

            <div class="meter" role="progressbar" aria-label="Overall fundraising progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0% funded">
              <div class="milestones" aria-hidden="true">
                <i style="left:25%"></i>
                <i style="left:50%"></i>
                <i style="left:75%"></i>
                <i style="left:100%"></i>
              </div>
              <span id="overallBar"></span>
            </div>

            <div class="stat-row" aria-label="Raised and goal numbers">
              <span>Raised: <span class="num" id="raisedRow">$0</span></span>
              <span>Goal: <span class="num" id="goalRow">$0</span></span>
              <span><strong class="num" id="pctText">0</strong>%</span>
            </div>

            <div class="divider" aria-hidden="true"></div>

            <div class="grid" style="gap:.6rem;">
              <div class="mini" style="display:flex; justify-content:space-between; gap:var(--s-2); align-items:center;">
                <div>
                  <div class="kicker">Donors</div>
                  <div style="font-weight:950; color:var(--text);" class="num" id="donorsText">0</div>
                </div>
                <div style="text-align:right;">
                  <div class="kicker">Avg gift</div>
                  <div style="font-weight:950; color:var(--text);" class="num" id="avgGiftText">$0</div>
                </div>
              </div>

              <div class="mini" style="display:flex; justify-content:space-between; gap:var(--s-2); align-items:center;">
                <div>
                  <div class="kicker">Days left</div>
                  <div style="font-weight:950; color:var(--text);" class="num" id="daysLeftText">—</div>
                </div>
                <div style="text-align:right;">
                  <div class="kicker">Next milestone</div>
                  <div style="font-weight:950; color:var(--text);" class="num" id="nextMilestoneText">—</div>
                </div>
              </div>
            </div>

            <div class="divider" aria-hidden="true"></div>

            <div class="kicker">Quick gifts</div>
            <p class="help" style="margin-top:.35rem;">Pick an amount. We’ll prefill checkout in one tap.</p>

            <div class="chip-row" role="group" aria-label="Quick gift buttons" style="margin-top:.65rem;">
              <button class="chip" type="button" data-quick-amount="25" aria-pressed="false">$25</button>
              <button class="chip" type="button" data-quick-amount="75" aria-pressed="false">$75</button>
              <button class="chip" type="button" data-quick-amount="150" aria-pressed="false">$150</button>
              <button class="chip" type="button" data-quick-amount="500" aria-pressed="false">$500</button>
              <button class="chip" type="button" data-quick-amount="1000" aria-pressed="false">Sponsor $1,000</button>
            </div>

            <div class="divider" aria-hidden="true"></div>

            <div style="display:flex; gap:.6rem; flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" type="button" id="shareBtn2">Share</button>
              <button class="btn btn-ghost btn-sm" type="button" id="copyLinkBtn3">Copy link</button>
              <a class="btn btn-primary btn-sm" href="#donate">Donate</a>
            </div>
          </article>
        </aside>
      </div>
    </section>

    <!-- Impact -->
    <section id="impact" class="section" aria-labelledby="impactTitle">
      <div class="container">
        <header class="section-head">
          <div class="kicker">How your donation helps</div>
          <h2 id="impactTitle">Every dollar has a job.</h2>
          <p class="measure">
            Transparent use of funds — <strong>uniforms &amp; gear</strong>, <strong>gym time</strong>,
            <strong>travel + tournament fees</strong>, <strong>hydration &amp; snacks</strong>, and <strong>scholarships</strong>.
            Choose an option below to prefill a secure donation.
          </p>
          <div class="sr-only" id="impactStatus" aria-live="polite" aria-atomic="true"></div>
        </header>

        <article class="card pad lift" aria-label="Typical allocation">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: var(--s-2); flex-wrap:wrap;">
            <div>
              <div class="kicker">Transparency</div>
              <h3 style="margin-top:.25rem;">Where funds typically go</h3>
              <p class="help measure" style="margin-top:.35rem;">
                These categories reflect real, recurring season expenses. Exact allocations adjust week-to-week.
              </p>
            </div>
            <a class="btn btn-secondary btn-sm" href="#donate">Support the season</a>
          </div>

          <div style="display:grid; gap: var(--s-3); margin-top: var(--s-3);" id="allocationBars" aria-label="Typical fund allocation bars"></div>
        </article>

        <div class="divider" aria-hidden="true"></div>

        <div class="grid grid-3" id="impactGrid" role="list" aria-label="Impact options"></div>

        <div style="display:flex; gap:.75rem; flex-wrap:wrap; margin-top: var(--s-3);" role="group" aria-label="Impact actions">
          <a class="btn btn-primary" href="#donate">Make a donation</a>
          <a class="btn btn-secondary" href="#sponsors">Explore sponsorships</a>
        </div>
      </div>
    </section>

    <!-- Teams -->
    <section id="teams" class="section" aria-labelledby="teamsTitle">
      <div class="container">
        <header class="section-head">
          <div class="kicker">Teams</div>
          <h2 id="teamsTitle">Spotlight a squad. Support the program.</h2>
          <p class="measure">
            Tagging helps reporting — funds still support the full program unless your organization chooses to restrict allocations.
          </p>
        </header>

        <article class="card pad lift" aria-label="Team selection tools">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:var(--s-2); flex-wrap:wrap;">
            <div>
              <h3>Find a team <span class="help">(optional)</span></h3>
              <p class="help measure" style="margin-top:.35rem;">
                Choose a team to support directly, or leave it as “All teams” for maximum flexibility.
              </p>
            </div>

            <div class="segmented" role="tablist" aria-label="Team filter">
              <button type="button" data-team-filter="all" aria-pressed="true">All teams</button>
              <button type="button" data-team-filter="featured" aria-pressed="false">Featured</button>
              <button type="button" data-team-filter="needs" aria-pressed="false">Needing support</button>
            </div>
          </div>

          <div class="field" style="margin-top:var(--s-3);">
            <label for="teamSearch">Search teams</label>
            <input id="teamSearch" type="search" placeholder="Type a team name…" autocomplete="off" />
            <div class="help">
              Tip: rotating a “team of the week” story can rally families and unlock momentum.
            </div>
          </div>
        </article>

        <div aria-hidden="true" style="height:var(--s-3);"></div>

        <div id="teamsGrid" class="grid grid-3" role="list" aria-label="Team cards"></div>
      </div>
    </section>

    <!-- Sponsors -->
    <section id="sponsors" class="section" aria-labelledby="sponsorsTitle">
      <div class="container">
        <header class="section-head">
          <div class="kicker">Sponsors</div>
          <h2 id="sponsorsTitle">A sponsor wall kids can point to.</h2>
          <p class="measure">
            Families and local businesses that step up get pride-of-place — online and at key events.
            Sponsor tiers below prefill instantly.
          </p>

          <div style="display:flex; gap:.75rem; flex-wrap:wrap; margin-top:.5rem;" role="group" aria-label="Sponsor actions">
            <a class="btn btn-secondary" href="#donate">Make a donation</a>
            <button class="btn btn-primary" type="button" data-prefill-amount="1000">Become a sponsor →</button>
          </div>
        </header>

        <div class="grid grid-2" style="align-items:start;">
          <aside class="card pad lift" aria-label="Sponsor leaderboard">
            <div class="kicker">VIP sponsor leaderboard</div>
            <h3 style="margin-top:.35rem;">Top sponsors</h3>
            <p class="help measure" style="margin-top:.35rem;">
              Big gifts keep scholarships real and weekends affordable.
            </p>

            <div id="sponsorWall" class="leaderboard" aria-label="Sponsor wall list"></div>

            <div class="divider" aria-hidden="true"></div>

            <article class="mini" aria-label="Sponsor spotlight">
              <div class="kicker">Spotlight</div>
              <h3 style="margin-top:.35rem;" id="spotlightTitle">Sponsor spotlight</h3>
              <p class="help measure" style="margin-top:.35rem;" id="spotlightCopy">
                Sponsors receive shareable recognition. Ask about the optional Sponsor Kit.
              </p>
              <div style="display:flex; gap:.6rem; flex-wrap:wrap; margin-top:.75rem;">
                <button class="btn btn-secondary btn-sm" type="button" id="copySponsorBadgeBtn">Copy sponsor badge</button>
                <button class="btn btn-ghost btn-sm" type="button" data-prefill-amount="250">Bronze $250</button>
              </div>
            </article>
          </aside>

          <div id="sponsorTiers" style="display:grid; gap:var(--s-3);" aria-label="Sponsor tiers"></div>
        </div>
      </div>
    </section>

    <!-- Donate -->
    <section id="donate" class="section donate" aria-labelledby="donateTitle">
      <div class="container">
        <header class="section-head donate__head">
          <p class="kicker">Donate</p>
          <h2 id="donateTitle">Make a gift in under a minute.</h2>
          <p class="measure help">
            Secure checkout powered by Stripe. Your payment form opens in a modal and you stay on this page.
          </p>
        </header>

        <article class="card pad lift donate__card" aria-label="Donation form">
          <form id="donationForm" class="donate__form" novalidate>
            <div class="donate__top" style="display:flex; gap:var(--s-3); flex-wrap:wrap; align-items:flex-start;">
              <div class="donate__intro" style="flex:1 1 340px;">
                <h3 class="donate__h3">Donation details</h3>
                <p class="help donate__sub">
                  Choose an amount, optionally tag a team, then continue to secure payment.
                </p>
              </div>

              <aside class="mini donate__summary" aria-label="Donation summary" style="flex:0 0 min(340px,100%);">
                <p class="kicker">Your gift</p>
                <p id="summaryAmount" class="big-raise num donate__summary-amount" aria-live="polite" aria-atomic="true">$0</p>
                <p id="summaryFreq" class="help" aria-live="polite" aria-atomic="true">One-time</p>
                <p id="summaryFeeLine" class="help donate__fee" style="display:none;"></p>
              </aside>
            </div>

            <div id="formError" class="alert" role="alert" aria-live="polite" aria-atomic="true" style="display:none;"></div>

            <input type="hidden" id="ffTotalHidden" name="ff_total" value="0" />
            <input type="hidden" id="ffIdemHidden" name="ff_idem" value="" />

            <fieldset class="field" aria-labelledby="amountLegend">
              <legend id="amountLegend" class="label">Amount</legend>

              <div class="chip-row" role="group" aria-label="Quick amounts">
                <button class="chip" type="button" data-form-amount="25" aria-pressed="false">$25</button>
                <button class="chip" type="button" data-form-amount="50" aria-pressed="false">$50</button>
                <button class="chip" type="button" data-form-amount="100" aria-pressed="false">$100</button>
                <button class="chip" type="button" data-form-amount="250" aria-pressed="false">$250</button>
                <button class="chip" type="button" data-form-amount="500" aria-pressed="false">$500</button>
              </div>

              <label class="sr-only" for="amountInput">Custom amount</label>
              <input
                id="amountInput"
                name="amount"
                type="number"
                inputmode="decimal"
                min="1"
                max="50000"
                step="1"
                placeholder="Custom amount"
                required
                aria-describedby="amountHelp"
              />
              <p id="amountHelp" class="help">Receipts are emailed after successful payment.</p>
            </fieldset>

            <fieldset class="field" aria-labelledby="freqLegend">
              <legend id="freqLegend" class="label">Frequency</legend>

              <div class="segmented" role="group" aria-label="Donation frequency">
                <button type="button" data-frequency="once" aria-pressed="true">One-time</button>
                <button
                  type="button"
                  data-frequency="monthly"
                  aria-pressed="false"
                  aria-disabled="true"
                  title="Monthly donations require subscriptions to be enabled"
                >
                  Monthly (not enabled)
                </button>
              </div>

              <input type="hidden" id="frequencyHidden" name="frequency" value="once" />
              <p class="help">Monthly support can be enabled when subscription billing is configured.</p>
            </fieldset>

            <div class="field">
              <label for="teamSelect">Tag a team <span class="help">(optional)</span></label>
              <select id="teamSelect" name="team_focus" aria-describedby="teamHelp">
                <option value="all">All teams • Support the full program</option>
              </select>
              <p id="teamHelp" class="help">Team tags help reporting and attribution.</p>
            </div>

            <div class="grid grid-2 donate__identity">
              <div class="field">
                <label for="nameInput">Name</label>
                <input id="nameInput" name="name" autocomplete="name" placeholder="Your name" required />
              </div>

              <div class="field">
                <label for="emailInput">Email</label>
                <input
                  id="emailInput"
                  name="email"
                  type="email"
                  autocomplete="email"
                  inputmode="email"
                  placeholder="you@example.com"
                  required
                  aria-describedby="emailHelp"
                />
                <p id="emailHelp" class="help">Used for receipts and optional updates you opt into.</p>
              </div>
            </div>

            <div class="field">
              <label for="noteInput">Optional note</label>
              <textarea id="noteInput" name="note" placeholder="Share a message…"></textarea>
              <p class="help">Notes may be shared with staff or the team.</p>
            </div>

            <fieldset class="checks" aria-label="Donation options">
              <legend class="sr-only">Donation options</legend>

              <label class="check">
                <input type="checkbox" id="coverFees" />
                <span>Cover processing fees so more reaches the program</span>
              </label>

              <label class="check">
                <input type="checkbox" id="roundUp" />
                <span>Round up my gift</span>
              </label>

              <label class="check">
                <input type="checkbox" id="updatesOptIn" checked />
                <span>Send me program updates</span>
              </label>
            </fieldset>

            <button class="btn btn-primary" type="submit" id="submitBtn" aria-disabled="true" disabled>
              Continue to secure payment
            </button>

            <div class="donate__actions">
              <button class="btn btn-secondary" type="button" id="paypalBtn" aria-disabled="true" disabled title="PayPal is not connected yet">
                PayPal (coming soon)
              </button>
              <button class="btn btn-ghost" type="button" id="copyLinkBtn4">Copy link</button>
            </div>

            <p class="help donate__trust">
              Payments are processed securely by Stripe. <strong>Card details never touch our servers.</strong>
            </p>

            <noscript>
              <div class="alert" role="alert">
                JavaScript is required to complete secure checkout. Please enable JavaScript or contact support.
              </div>
            </noscript>
          </form>
        </article>
      </div>
    </section>

    <!-- Payment Modal -->
    <div
      class="modal"
      id="checkoutModal"
      data-open="false"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkoutTitle"
      aria-describedby="checkoutDesc"
      aria-hidden="true"
    >
      <div class="modal-panel" role="document" tabindex="-1">
        <div class="modal-body">
          <div class="modal-head">
            <div class="modal-head__copy">
              <p class="kicker">Secure checkout</p>
              <h3 class="modal-title" id="checkoutTitle">Complete your donation</h3>
              <p class="help measure" id="checkoutDesc">
                This payment is encrypted and processed securely by Stripe. You’ll stay on this page.
              </p>
            </div>

            <button class="icon-btn" type="button" id="checkoutClose" aria-label="Close secure checkout">✕</button>
          </div>

          <div id="checkoutModalError" class="alert" role="alert" aria-live="polite" aria-atomic="true" style="display:none;"></div>

          <div
            class="mini"
            id="checkoutLoading"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style="display:none;"
          >
            <strong>Loading secure payment form…</strong><br />
            This usually takes a moment.
          </div>

          <div id="paymentElementWrap" aria-label="Secure payment form">
            <div id="paymentElement"></div>
          </div>

          <div class="modal-actions" aria-label="Checkout actions">
            <button class="btn btn-primary" type="button" id="payNowBtn" disabled aria-disabled="true">Pay now</button>
            <button class="btn btn-secondary" type="button" id="checkoutClose2">Cancel</button>
            <button class="btn btn-ghost" type="button" id="checkoutHelp">Need help?</button>
          </div>

          <p class="help">
            Receipts are emailed after successful payment. <strong>Card details never touch our servers.</strong>
          </p>
        </div>
      </div>
    </div>

    <!-- Success Modal -->
    <div
      class="modal"
      id="successModal"
      data-open="false"
      role="dialog"
      aria-modal="true"
      aria-labelledby="successTitle"
      aria-describedby="successDesc"
      aria-hidden="true"
    >
      <div class="modal-panel" role="document" tabindex="-1">
        <div class="modal-body">
          <div class="modal-head">
            <div class="modal-head__copy">
              <p class="kicker">Donation confirmed</p>
              <h3 class="modal-title" id="successTitle">Thank you for supporting the program.</h3>
              <p id="successDesc" class="help measure">
                A receipt has been sent to <strong id="successEmail">your email</strong>.
              </p>
            </div>

            <button class="icon-btn" type="button" id="successClose" aria-label="Close donation confirmation">✕</button>
          </div>

          <div class="grid grid-3" aria-label="Donation summary">
            <div class="mini">
              <p class="kicker">Amount</p>
              <p class="big-raise num" id="successAmount" style="font-size:1.35rem;">$0</p>
              <p class="help">Thank you</p>
            </div>

            <div class="mini">
              <p class="kicker">Frequency</p>
              <p id="successFrequency" class="num" style="font-weight:950;">One-time</p>
              <p class="help">Monthly can be enabled later</p>
            </div>

            <div class="mini">
              <p class="kicker">Tagged</p>
              <p id="successTeam" class="num" style="font-weight:950;">All teams</p>
              <p class="help">Helps reporting</p>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-primary" type="button" id="successShare">Share this fundraiser</button>
            <button class="btn btn-secondary" type="button" id="successCopy">Copy link</button>
            <button class="btn btn-ghost" type="button" id="successBack">Back to fundraiser</button>
            <button class="btn btn-primary btn-sm" type="button" data-prefill-amount="250">Become a sponsor ($250)</button>
          </div>

          <p class="help">
            Your support directly helps with season costs like gym time, travel, and scholarships.
          </p>
        </div>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="site-footer" role="contentinfo" aria-label="Site footer">
    <div class="container site-footer__container">
      <div class="site-footer__top">
        <div class="site-footer__brand" aria-label="Footer brand">
          <div class="brand">
            <div class="brand-mark" aria-hidden="true">FF</div>
            <div class="brand-text">
              <div class="brand-title">FutureFunded</div>
              <div class="brand-sub">Fundraising infrastructure for teams, schools, and nonprofits.</div>
            </div>
          </div>

          <address class="site-footer__contact">
            <a class="site-footer__support" href="mailto:support@getfuturefunded.com">support@getfuturefunded.com</a>
            <span class="site-footer__contact-meta help">Support &amp; receipts</span>
          </address>
        </div>

        <nav class="site-footer__nav" aria-label="Footer navigation">
          <ul class="footer-links">
            <li><a href="#donate">Donate</a></li>
            <li><a href="#impact">Impact</a></li>
            <li><a href="#teams">Teams</a></li>
            <li><a href="#sponsors">Sponsors</a></li>
          </ul>
        </nav>

        <div class="site-footer__cta" aria-label="Footer actions" style="display:flex; gap:.6rem; flex-wrap:wrap;">
          <a class="btn btn-secondary btn-sm" href="#donate">Give again</a>
          <a class="btn btn-ghost btn-sm" href="mailto:support@getfuturefunded.com">Contact support</a>
        </div>
      </div>

      <article class="card pad site-footer__trust" aria-label="Payment transparency and trust">
        <div class="site-footer__trust-inner">
          <div class="site-footer__trust-copy">
            <div class="kicker">Trust &amp; Transparency</div>

            <p class="help site-footer__trust-p" style="margin-top:.45rem;">
              Payments are encrypted and processed securely by <strong>Stripe</strong>. Receipts are emailed after successful donation.
            </p>

            <ul class="site-footer__trust-list">
              <li class="help">Card details never touch our servers.</li>
              <li class="help">Donor info is used only for receipts and optional updates.</li>
              <li class="help">We do not sell personal data.</li>
            </ul>
          </div>

          <div class="site-footer__trust-actions" style="display:flex; gap:.6rem; flex-wrap:wrap;">
            <a class="btn btn-secondary btn-sm" href="#donate">Donate now</a>
            <a class="btn btn-ghost btn-sm" href="/privacy">Privacy</a>
          </div>
        </div>
      </article>

      <div class="site-footer__legal">
        <p class="help">© <span id="year"></span> FutureFunded. Built for teams, schools, nonprofits, and community programs.</p>
        <p class="help">Organizations are responsible for their programs and use of funds.</p>
        <p class="help">
          <a href="/privacy" class="footer-legal">Privacy Policy</a>
          <span aria-hidden="true"> · </span>
          <a href="/terms" class="footer-legal">Terms of Service</a>
        </p>
      </div>
    </div>
  </footer>

  <!-- Sticky donate bar -->
  <section class="sticky" id="sticky" data-show="false" role="region" aria-label="Quick donate bar" hidden>
    <div class="sticky-inner">
      <div class="sticky-mini" aria-live="polite" aria-atomic="true">
        <div class="sticky-top">Live fundraiser</div>
        <div class="sticky-bot">
          <span class="num" id="stickyRaised">$0</span> raised
          <span aria-hidden="true">•</span>
          <span class="num" id="stickyPct">0</span>% funded
          <span aria-hidden="true">•</span>
          Goal <span class="num" id="stickyGoal">$0</span>
        </div>
      </div>

      <div class="sticky-actions" aria-label="Quick actions" style="display:flex; gap:.6rem; flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" type="button" data-prefill-amount="1000" aria-label="Prefill sponsor donation of $1,000">
          Sponsor
        </button>
        <a class="btn btn-primary btn-sm" href="#donate" aria-label="Make a donation">Donate</a>
      </div>
    </div>
  </section>

  <!-- Toast -->
  <div class="toast-host" aria-live="polite" aria-atomic="true" aria-relevant="additions text">
    <div class="toast" id="toast" role="status" data-show="false" hidden>
      <span class="toast-text" id="toastText">Saved.</span>
      <button type="button" class="toast-close" id="toastClose" aria-label="Dismiss notification">✕</button>
    </div>
  </div>

  <!-- Back to Top -->
  <button id="backToTop" class="back-to-top" type="button" aria-label="Scroll back to top" hidden>
    <span aria-hidden="true">↑</span>
    <span class="sr-only">Back to top</span>
  </button>


  <!-- SINGLE FILE: v43 flagship (Stripe Elements safe lifecycle) -->
  <script>
  (() => {
    "use strict";

    /* ============================================================
      FutureFunded Flagship — v43 (single-file replacement)
      - Stripe Elements-safe lifecycle: no null elements, hard-gated confirm
      - Reads publishable key from:
          1) server response (preferred)
          2) meta[name="ff-stripe-pk"] or meta[name="stripe-pk"]
      - Reads config overrides from:
          1) window.FF_CONFIG (optional)
          2) #ffConfig JSON (optional)
          3) /api/status refresh (optional)
      - Drawer, scroll spy, sticky offsets, topbar dismiss
      - Share/copy, team filtering/search
    ============================================================ */

    if (window.__ff_flagship_v43_initialized) return;
    window.__ff_flagship_v43_initialized = true;

    /* -------------------------
      Helpers
    ------------------------- */
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

    const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || "";
    const getCsrfToken = () => meta("csrf-token") || meta("csrf") || meta("x-csrf-token");
    const getCheckoutEndpoint = () => meta("ff-checkout-endpoint") || meta("ff-embedded-endpoint") || "/payments/stripe/intent";
    const getStatusEndpoint = () => meta("ff-status-endpoint") || "/api/status";
    const getStripePkFromMeta = () => meta("ff-stripe-pk") || meta("stripe-pk") || "";

    const isPlainObject = (v) => !!v && typeof v === "object" && Object.prototype.toString.call(v) === "[object Object]";
    const safeClone = (obj) => {
      try { return structuredClone(obj); } catch { return JSON.parse(JSON.stringify(obj)); }
    };
    const deepMerge = (target, ...sources) => {
      for (const src of sources) {
        if (!isPlainObject(src)) continue;
        for (const [k, v] of Object.entries(src)) {
          if (isPlainObject(v) && isPlainObject(target[k])) target[k] = deepMerge(target[k], v);
          else target[k] = v;
        }
      }
      return target;
    };
    const readJsonScript = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      try {
        const txt = String(el.textContent || "").trim();
        if (!txt) return null;
        return JSON.parse(txt);
      } catch { return null; }
    };
    const escapeHtml = (s) => String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

    const setShown = (el, show) => {
      if (!el) return;
      const on = !!show;
      el.hidden = !on;
      el.setAttribute("data-show", on ? "true" : "false");
      el.setAttribute("aria-hidden", on ? "false" : "true");
    };

    const uuid = () => {
      if (window.crypto?.randomUUID) return crypto.randomUUID();
      return "ff_" + Date.now().toString(16) + "_" + Math.random().toString(16).slice(2);
    };

    async function fetchJson(url, { method = "GET", payload, headers = {}, timeoutMs = 15000 } = {}) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            ...(payload ? { "Content-Type": "application/json" } : {}),
            ...headers,
          },
          body: payload ? JSON.stringify(payload) : undefined,
          signal: ctrl.signal,
          redirect: "follow",
        });

        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("application/json")) {
          if (!res.ok) throw new Error(`Request failed (${res.status}).`);
          throw new Error("Expected JSON but received HTML. Check endpoint routing/redirects.");
        }

        const data = await res.json().catch(() => null);
        if (!res.ok || data?.ok === false) {
          const msg = data?.error?.message || data?.message || `Request failed (${res.status})`;
          throw new Error(msg);
        }
        return data;
      } finally {
        clearTimeout(t);
      }
    }

    /* -------------------------
      Default Config
    ------------------------- */
    const DEFAULT_CONFIG = {
      brand: {
        markText: "FF",
        logoUrl: "",
        primary: "#1D4ED8",
        primaryStrong: "#163BB3",
        accent: "#FF3D2E",
      },
      org: {
        shortName: "Connect ATX Elite",
        metaLine: "Youth Basketball • Austin, TX",
        seasonLabel: "2025–2026",
        sportLabel: "Youth basketball",
      },
      fundraiser: {
        currency: "USD",
        goal: 25000,
        raised: 0,
        donors: 0,
        deadlineISO: "2026-02-28T23:59:59-06:00",
        match: { active: false, copy: "Match active: gifts are doubled up to $2,500." },
      },
      events: [{ title: "Next tournament weekend", startISO: "2026-01-17T09:00:00-06:00" }],
      allocation: [
        { label: "Travel + tournament fees", pct: 35 },
        { label: "Gym time", pct: 30 },
        { label: "Uniforms + gear", pct: 20 },
        { label: "Hydration + snacks", pct: 10 },
        { label: "Scholarships", pct: 5 },
      ],
      impact: [
        { amount: 25, tag: "Foundation", title: "Hydration & snacks", desc: "Covers drinks and light snacks for a practice or weekend run." },
        { amount: 75, tag: "Game Day", title: "Game day fuel", desc: "Supports a full day of hydration + snacks for a roster." },
        { amount: 150, tag: "Operations", title: "Gym time covered", desc: "Offsets gym rentals so practices stay consistent." },
        { amount: 300, tag: "Travel", title: "Travel + tournament boost", desc: "Helps reduce weekend spikes: travel, fees, and essentials." },
        { amount: 500, tag: "Gear", title: "Uniforms & player gear", desc: "Helps cover jerseys and gear so athletes aren’t paying out-of-pocket." },
        { amount: 1000, tag: "Scholarship", title: "Program anchor", desc: "Protects scholarships + stabilizes travel, gear, and tournament costs.", badge: "Best value" },
      ],
      recentGifts: [
        { who: "Anonymous", amount: 75, minutesAgo: 18 },
        { who: "J. Carter", amount: 25, minutesAgo: 44 },
        { who: "Local Business", amount: 250, minutesAgo: 120 },
        { who: "Anonymous", amount: 50, minutesAgo: 240 },
      ],
      teams: [
        { key: "6g", name: "6th Grade Gold", blurb: "First AAU reps — learning sets, defense, and communication.", goal: 5000, raised: 3420, image: "/static/images/connect-atx-team.jpg", tag: "Featured" },
        { key: "7g", name: "7th Grade Gold", blurb: "Speed + spacing — film, fundamentals, and pressure reps.", goal: 6000, raised: 4680, image: "/static/images/7thGold.jpg" },
        { key: "7b", name: "7th Grade Black", blurb: "Defense travels — effort and stops into transition.", goal: 5000, raised: 2210, image: "/static/images/7thBlack.webp" },
        { key: "8g", name: "8th Grade Gold", blurb: "Finish strong — high-intensity reps and leadership.", goal: 6000, raised: 4680, image: "/static/images/8thGold.jpg" },
        { key: "8b", name: "8th Grade Black", blurb: "Next gym ready — advanced reads and competitive weekends.", goal: 5000, raised: 2210, image: "/static/images/connect-atx-team_3.jpg" },
      ],
      sponsors: {
        wall: [
          { name: "River City Dental", meta: "Tournament Sponsor", amount: 1000 },
          { name: "ATX Alumni", meta: "Game Day Sponsor", amount: 500 },
          { name: "Carter Family", meta: "Community Sponsor", amount: 250 },
        ],
        tiers: [
          { name: "Community Sponsor", amount: 250, desc: "Great for families and small businesses.", badges: ["Receipt-ready", "Shareable"] },
          { name: "Game Day Sponsor", amount: 500, desc: "Visible support that families notice.", badges: ["Popular", "High visibility"] },
          { name: "Tournament Sponsor", amount: 1000, desc: "Top placement + sponsor spotlight.", badges: ["Top placement", "Best value"] },
        ],
        spotlight: {
          title: "Tournament Sponsor",
          copy: "Top sponsors get pride-of-place on the wall plus a shareable sponsor badge (easy marketing for local businesses).",
        },
      },
      supportEmail: "support@getfuturefunded.com",
      liveRefreshMs: 20000,
      payments: { stripe: true, paypal: false }
    };

    const CONFIG = deepMerge(
      safeClone(DEFAULT_CONFIG),
      (window.FF_CONFIG && isPlainObject(window.FF_CONFIG)) ? window.FF_CONFIG : {},
      (readJsonScript("ffConfig") && isPlainObject(readJsonScript("ffConfig"))) ? readJsonScript("ffConfig") : {}
    );

    const state = {
      goal: Number(CONFIG.fundraiser?.goal) || 0,
      raised: Number(CONFIG.fundraiser?.raised) || 0,
      donors: Number(CONFIG.fundraiser?.donors) || 0,
      teams: (CONFIG.teams || []).map((t) => ({ ...t })),
      teamFilter: "all",
      teamQuery: "",
      featuredKey: "",
      needsSet: new Set(),
      bound: false,
    };

    /* -------------------------
      Formatting
    ------------------------- */
    const currencyCode = () => String(CONFIG.fundraiser?.currency || "USD").toUpperCase();
    const fmtMoney = (n, maxDigits = 0) => {
      const v = Number(n) || 0;
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currencyCode(),
          minimumFractionDigits: 0,
          maximumFractionDigits: maxDigits,
        }).format(v);
      } catch {
        const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDigits });
        return "$" + nf.format(v);
      }
    };
    const money0 = (n) => fmtMoney(n, 0);
    const money2 = (n) => fmtMoney(n, 2);

    const pct = (raised, goal) => {
      const g = Number(goal) || 0;
      if (!g) return 0;
      return clamp(Math.round((Number(raised) / g) * 100), 0, 999);
    };
    const daysLeft = (deadlineISO) => {
      const d = new Date(deadlineISO);
      if (Number.isNaN(d.getTime())) return null;
      const ms = d.getTime() - Date.now();
      if (ms <= 0) return 0;
      return Math.max(0, Math.ceil(ms / 86400000));
    };

    /* -------------------------
      Toast
    ------------------------- */
    const toastEls = { host: $("#toast"), text: $("#toastText"), close: $("#toastClose") };
    let toastTimer = null;
    const toast = (msg) => {
      if (!toastEls.host || !toastEls.text) return;
      toastEls.text.textContent = String(msg || "");
      setShown(toastEls.host, true);
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => setShown(toastEls.host, false), 2600);
    };
    toastEls.close?.addEventListener("click", () => setShown(toastEls.host, false));

    /* -------------------------
      Theme + Brand
    ------------------------- */
    const THEME_KEY = "ff_flagship_theme_v43";

    function applyBrand() {
      const r = document.documentElement;
      if (CONFIG.brand?.primary) r.style.setProperty("--primary", CONFIG.brand.primary);
      if (CONFIG.brand?.primaryStrong) r.style.setProperty("--primary-2", CONFIG.brand.primaryStrong);
      if (CONFIG.brand?.accent) r.style.setProperty("--accent", CONFIG.brand.accent);

      const mark = $("#brandMark");
      if (!mark) return;

      const logo = String(CONFIG.brand?.logoUrl || "").trim();
      if (logo) mark.innerHTML = `<img class="brand-logo" alt="" src="${escapeHtml(logo)}" />`;
      else mark.textContent = CONFIG.brand?.markText || "FF";
    }

    function applyTheme(theme) {
      const t = theme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", t);
      const btn = $("#themeToggle");
      if (btn) {
        btn.setAttribute("aria-pressed", String(t === "dark"));
        btn.textContent = t === "dark" ? "☀" : "☾";
      }
    }

    function initTheme() {
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      let theme = prefersDark ? "dark" : "light";
      try {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored) theme = stored;
      } catch {}
      applyTheme(theme);

      $("#themeToggle")?.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme") || "light";
        const next = cur === "dark" ? "light" : "dark";
        applyTheme(next);
        try { localStorage.setItem(THEME_KEY, next); } catch {}
      });
    }

    /* -------------------------
      Sticky offsets + header shadow + topbar dismiss
    ------------------------- */
    const TOPBAR_KEY = "ff_topbar_dismissed_v1";

    function measureStickyOffsets() {
      const topbar = $("#topbar");
      const header = $("#top");
      const topbarH = topbar && !topbar.hidden ? Math.ceil(topbar.getBoundingClientRect().height) : 0;
      const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      const offset = topbarH + headerH + 14;

      const r = document.documentElement;
      r.style.setProperty("--topbar-h", topbarH + "px");
      r.style.setProperty("--header-h", headerH + "px");
      r.style.setProperty("--scroll-offset", offset + "px");
    }

    function initTopbarDismiss() {
      const topbar = $("#topbar");
      const btn = $("#topbarDismiss");
      if (!topbar || !btn) return;

      let dismissed = false;
      try { dismissed = localStorage.getItem(TOPBAR_KEY) === "1"; } catch {}
      if (dismissed) {
        topbar.hidden = true;
        measureStickyOffsets();
      }

      btn.addEventListener("click", () => {
        topbar.hidden = true;
        try { localStorage.setItem(TOPBAR_KEY, "1"); } catch {}
        measureStickyOffsets();
      });
    }

    function initHeaderShadow() {
      const header = $("#top");
      if (!header) return;
      const onScroll = () => {
        const y = window.scrollY || 0;
        header.setAttribute("data-scrolled", y > 8 ? "true" : "false");
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    /* -------------------------
      Drawer
    ------------------------- */
    function initDrawer() {
      const drawer = $("#mobileDrawer");
      const openBtn = $("#menuOpen");
      if (!drawer || !openBtn) return;

      const setOpen = (open) => {
        drawer.setAttribute("data-open", open ? "true" : "false");
        openBtn.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
          drawer.querySelector("a,button")?.focus?.();
          document.documentElement.style.overflow = "hidden";
          document.body.style.overflow = "hidden";
        } else {
          document.documentElement.style.overflow = "";
          document.body.style.overflow = "";
          openBtn.focus?.();
        }
      };

      openBtn.addEventListener("click", () => setOpen(true));
      drawer.addEventListener("click", (e) => {
        const close = e.target?.closest?.('[data-close="true"]');
        if (close || e.target === drawer) setOpen(false);
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && drawer.getAttribute("data-open") === "true") setOpen(false);
      });

      // Close drawer on nav click
      $$('a[href^="#"]', drawer).forEach((a) => {
        a.addEventListener("click", () => setOpen(false));
      });
    }

    /* -------------------------
      Scroll spy
    ------------------------- */
    function initScrollSpy() {
      const nav = $("#navLinks");
      if (!nav || !("IntersectionObserver" in window)) return;

      const links = $$("a[data-spy]", nav);
      const map = new Map();
      links.forEach((a) => {
        const id = a.getAttribute("href")?.replace("#", "");
        if (id) map.set(id, a);
      });

      const sections = ["progress", "impact", "teams", "sponsors", "donate"]
        .map((id) => document.getElementById(id))
        .filter(Boolean);

      const setActive = (id) => {
        links.forEach((a) => a.setAttribute("data-active", "false"));
        const a = map.get(id);
        if (a) a.setAttribute("data-active", "true");
      };

      const io = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      }, { threshold: [0.18, 0.28, 0.38] });

      sections.forEach((s) => io.observe(s));
      setActive("progress");
    }

    /* -------------------------
      Meta social tags
    ------------------------- */
    function setSocialMeta() {
      const title = `FutureFunded • ${CONFIG.org?.shortName || "Fundraiser"}`;
      const desc = `Support ${CONFIG.org?.shortName || "the program"} with secure checkout and instant receipts.`;
      document.title = title;

      const set = (sel, val) => {
        const el = document.querySelector(sel);
        if (el) el.setAttribute("content", val);
      };
      set('meta[property="og:title"]', title);
      set('meta[property="og:description"]', desc);
      set('meta[name="description"]', desc);
      set('meta[name="twitter:card"]', "summary_large_image");
    }

    /* -------------------------
      Renderers
    ------------------------- */
    function renderTop() {
      $("#orgName") && ($("#orgName").textContent = CONFIG.org.shortName);
      $("#orgMeta") && ($("#orgMeta").textContent = CONFIG.org.metaLine);
      $("#seasonPill") && ($("#seasonPill").textContent = `Season Fund • ${CONFIG.org.seasonLabel}`);
      $("#sportPill") && ($("#sportPill").textContent = CONFIG.org.sportLabel || "Youth sports");
      $("#year") && ($("#year").textContent = String(new Date().getFullYear()));

      const m = CONFIG.fundraiser?.match;
      const matchPill = $("#matchPill");
      if (matchPill && m?.active) {
        matchPill.hidden = false;
        matchPill.textContent = m.copy || "Match active";
      } else if (matchPill) {
        matchPill.hidden = true;
      }

      if (CONFIG.sponsors?.spotlight) {
        $("#spotlightTitle") && ($("#spotlightTitle").textContent = CONFIG.sponsors.spotlight.title || "Sponsor spotlight");
        $("#spotlightCopy") && ($("#spotlightCopy").textContent = CONFIG.sponsors.spotlight.copy || "");
      }

      const dl = daysLeft(CONFIG.fundraiser?.deadlineISO);
      const pill = $("#countdownPill");
      if (pill) pill.textContent = dl === null ? "Ends soon" : (dl <= 0 ? "Ended" : `${dl} day${dl === 1 ? "" : "s"} left`);

      const dlText = $("#deadlineText");
      if (dlText) dlText.textContent = dl === null ? "—" : (dl <= 0 ? "Ended" : `Ends in ${dl} day${dl === 1 ? "" : "s"}`);

      setSocialMeta();
    }

    function renderProgress() {
      const p = pct(state.raised, state.goal);
      const barPct = clamp(p, 0, 100);
      const remaining = Math.max(state.goal - state.raised, 0);

      $("#raisedBig") && ($("#raisedBig").textContent = money0(state.raised));
      $("#raisedRow") && ($("#raisedRow").textContent = money0(state.raised));
      $("#goalRow") && ($("#goalRow").textContent = money0(state.goal));
      $("#goalPill") && ($("#goalPill").textContent = money0(state.goal));
      $("#remainingText") && ($("#remainingText").textContent = money0(remaining));
      $("#pctText") && ($("#pctText").textContent = String(p));

      const meter = $("#overallBar")?.parentElement;
      const bar = $("#overallBar");
      if (bar) bar.style.width = barPct + "%";
      if (meter) {
        meter.setAttribute("aria-valuenow", String(barPct));
        meter.setAttribute("aria-valuetext", `${barPct}% funded`);
      }

      const avg = state.donors > 0 ? (state.raised / state.donors) : 0;
      $("#donorsText") && ($("#donorsText").textContent = String(state.donors));
      $("#avgGiftText") && ($("#avgGiftText").textContent = money0(avg));

      const dl = daysLeft(CONFIG.fundraiser?.deadlineISO);
      $("#daysLeftText") && ($("#daysLeftText").textContent = dl === null ? "—" : String(dl));

      const checkpoints = [25, 50, 75, 100];
      const next = checkpoints.find((c) => c > clamp(p, 0, 100)) || 100;
      const nextAmt = Math.round((next / 100) * state.goal);
      $("#nextMilestoneText") && ($("#nextMilestoneText").textContent = next >= 100 ? money0(state.goal) : money0(nextAmt));

      $("#stickyRaised") && ($("#stickyRaised").textContent = money0(state.raised));
      $("#stickyGoal") && ($("#stickyGoal").textContent = money0(state.goal));
      $("#stickyPct") && ($("#stickyPct").textContent = String(p));
    }

    function renderAllocation() {
      const host = $("#allocationBars");
      if (!host) return;
      host.innerHTML = "";
      (CONFIG.allocation || []).forEach((row) => {
        const pctVal = clamp(Number(row.pct) || 0, 0, 100);
        const wrap = document.createElement("div");
        wrap.innerHTML = `
          <div class="stat-row"><span>${escapeHtml(row.label)}</span><span class="num">${pctVal}%</span></div>
          <div class="meter" aria-hidden="true"><span style="width:${pctVal}%"></span></div>
        `;
        host.appendChild(wrap);
      });
    }

    function renderImpact() {
      const host = $("#impactGrid");
      if (!host) return;
      host.innerHTML = "";
      (CONFIG.impact || []).forEach((it) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "impact-card lift";
        btn.setAttribute("role", "listitem");
        btn.setAttribute("data-prefill-amount", String(it.amount));
        btn.setAttribute("aria-pressed", "false");
        btn.innerHTML = `
          <div class="impact-top">
            <span class="tag">${escapeHtml(it.tag)}</span>
            ${it.badge ? `<span class="badge">${escapeHtml(it.badge)}</span>` : ""}
          </div>
          <div class="impact-amt num">${money0(it.amount)}</div>
          <div class="impact-title">${escapeHtml(it.title)}</div>
          <div class="impact-desc">${escapeHtml(it.desc)}</div>
          <div class="impact-hint">Prefill ${money0(it.amount)} →</div>
        `;
        host.appendChild(btn);
      });
    }

    function renderRecentGifts() {
      const host = $("#giftsList");
      if (!host) return;

      const gifts = Array.isArray(CONFIG.recentGifts) ? CONFIG.recentGifts.slice(0, 5) : [];
      if (!gifts.length) {
        const card = $("#recentGiftsCard");
        if (card) card.style.display = "none";
        return;
      }

      host.innerHTML = "";
      gifts.forEach((g) => {
        const row = document.createElement("div");
        row.className = "gift";
        const mins = Number(g.minutesAgo) || 0;
        row.innerHTML = `
          <div>
            <div class="who">${escapeHtml(g.who || "Anonymous")}</div>
            <div class="when">${mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`}</div>
          </div>
          <div class="amt num">${money0(g.amount || 0)}</div>
        `;
        host.appendChild(row);
      });
    }

    function computeFeaturedAndNeeds() {
      // featured = highest progress; needs = bottom 2 by progress
      let featuredKey = state.teams[0]?.key || "";
      let best = -1;

      const scored = state.teams.map((t) => {
        const p = t.goal > 0 ? (t.raised / t.goal) : 0;
        if (p > best) { best = p; featuredKey = t.key; }
        return { key: t.key, p };
      });

      scored.sort((a, b) => a.p - b.p);
      const needs = scored.slice(0, Math.min(2, scored.length)).map((x) => x.key);

      state.featuredKey = featuredKey;
      state.needsSet = new Set(needs);
    }

    function renderTeams() {
      const host = $("#teamsGrid");
      const sel = $("#teamSelect");
      if (!host) return;

      if (sel && sel.options.length <= 1) {
        state.teams.forEach((t) => {
          const opt = document.createElement("option");
          opt.value = t.key;
          opt.textContent = t.name;
          sel.appendChild(opt);
        });
      }

      computeFeaturedAndNeeds();

      host.innerHTML = "";
      state.teams.forEach((t) => {
        const p = t.goal > 0 ? clamp(Math.round((t.raised / t.goal) * 100), 0, 100) : 0;

        const card = document.createElement("article");
        card.className = "team-card lift";
        card.setAttribute("data-team", t.key);
        card.setAttribute("data-featured", String(t.key === state.featuredKey));
        card.setAttribute("data-needs", String(state.needsSet.has(t.key)));
        card.setAttribute("data-name", (t.name || "").toLowerCase());

        card.innerHTML = `
          <div class="team-media">
            <img class="team-img" alt="Team image — ${escapeHtml(t.name)}" loading="lazy" decoding="async"
                 src="${escapeHtml(t.image || "")}">
          </div>
          <div class="team-body">
            <div class="team-head">
              <div style="min-width:0;">
                <div class="team-name">${escapeHtml(t.name)}</div>
                <div class="team-blurb">${escapeHtml(t.blurb || "")}</div>
              </div>
              <div class="team-raise num">${money0(t.raised)}</div>
            </div>
            <div aria-label="${escapeHtml(t.name)} progress">
              <div class="stat-row">
                <span>${money0(t.raised)} raised</span>
                <span>${money0(t.goal)} goal</span>
              </div>
              <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100"
                   aria-valuenow="${p}" aria-valuetext="${p}% funded">
                <span style="width:${p}%"></span>
              </div>
              <div class="stat-row">
                <span class="num"><strong>${p}%</strong> funded</span>
                <span>Tap to prefill</span>
              </div>
            </div>
            <div class="chip-row" role="group" aria-label="Quick gifts for ${escapeHtml(t.name)}">
              <button class="chip" type="button" data-prefill-amount="50" data-prefill-team="${escapeHtml(t.key)}">+$50</button>
              <button class="chip" type="button" data-prefill-amount="100" data-prefill-team="${escapeHtml(t.key)}">+$100</button>
              <button class="chip" type="button" data-prefill-amount="200" data-prefill-team="${escapeHtml(t.key)}">+$200</button>
              <a class="btn btn-secondary btn-sm" href="#donate" data-set-team="${escapeHtml(t.key)}" style="margin-left:auto;">Donate</a>
            </div>
          </div>
        `;
        host.appendChild(card);
      });

      applyTeamFilters();
    }

    function applyTeamFilters() {
      const host = $("#teamsGrid");
      if (!host) return;

      const q = String(state.teamQuery || "").trim().toLowerCase();
      const filter = state.teamFilter;

      $$("#teamsGrid .team-card").forEach((card) => {
        const name = card.getAttribute("data-name") || "";
        const isFeatured = card.getAttribute("data-featured") === "true";
        const isNeeds = card.getAttribute("data-needs") === "true";

        const okQuery = !q || name.includes(q);
        const okFilter = filter === "all" || (filter === "featured" && isFeatured) || (filter === "needs" && isNeeds);

        card.style.display = (okQuery && okFilter) ? "" : "none";
      });
    }

    function renderSponsors() {
      const wall = $("#sponsorWall");
      const tiers = $("#sponsorTiers");
      if (!wall || !tiers) return;

      wall.innerHTML = "";
      (CONFIG.sponsors?.wall || [])
        .slice()
        .sort((a, b) => (b.amount || 0) - (a.amount || 0))
        .forEach((s, idx) => {
          const row = document.createElement("div");
          row.className = "leader";
          row.innerHTML = `
            <div class="leader-left">
              <div class="rank">#${idx + 1}</div>
              <div style="min-width:0;">
                <div class="leader-name">${escapeHtml(s.name)}</div>
                <div class="leader-meta">${escapeHtml(s.meta || "")}</div>
              </div>
            </div>
            <div class="leader-amt num">${money0(s.amount || 0)}</div>
          `;
          wall.appendChild(row);
        });

      tiers.innerHTML = "";
      (CONFIG.sponsors?.tiers || []).forEach((t) => {
        const card = document.createElement("article");
        card.className = "tier lift";
        card.innerHTML = `
          <div class="tier-row">
            <div>
              <div class="kicker">Tier</div>
              <h3 style="margin-top:.2rem;">${escapeHtml(t.name)}</h3>
            </div>
            <div class="tier-price num">${money0(t.amount)}</div>
          </div>
          <p class="tier-desc">${escapeHtml(t.desc || "")}</p>
          <div style="display:flex; gap:.5rem; flex-wrap:wrap;">
            ${(t.badges || []).slice(0, 3).map((b) => `<span class="badge">${escapeHtml(b)}</span>`).join("")}
          </div>
          <div style="display:flex; gap:.6rem; flex-wrap:wrap; margin-top:.25rem;">
            <button class="btn btn-secondary btn-sm" type="button" data-prefill-amount="${t.amount}">Claim this tier</button>
            <a class="btn btn-primary btn-sm" href="#donate">Sponsor</a>
          </div>
        `;
        tiers.appendChild(card);
      });
    }

    function renderEventCountdown() {
      const ev = (CONFIG.events || [])[0];
      const title = $("#eventTitle");
      const countdown = $("#eventCountdown");
      if (!ev || !title || !countdown) return;

      title.textContent = ev.title || "Upcoming event";
      const start = new Date(ev.startISO);
      if (Number.isNaN(start.getTime())) {
        countdown.textContent = "Details coming soon.";
        return;
      }

      const tick = () => {
        const ms = start.getTime() - Date.now();
        if (ms <= 0) {
          countdown.textContent = "Happening now / soon.";
          return;
        }
        const d = Math.floor(ms / 86400000);
        const h = Math.floor((ms % 86400000) / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        countdown.textContent = d > 0 ? `${d}d ${h}h away` : `${h}h ${m}m away`;
      };

      tick();
      setInterval(tick, 30000);
    }

    /* -------------------------
      Refresh from backend (optional)
    ------------------------- */
    async function refreshFromBackend() {
      const url = getStatusEndpoint();
      if (!url) return;

      try {
        const data = await fetchJson(url, { method: "GET", timeoutMs: 8000 });

        const goal   = Number(data.goal ?? data.fundraiser_goal ?? data?.fundraiser?.goal);
        const raised = Number(data.raised ?? data.fundraiser_raised ?? data?.fundraiser?.raised);
        const donors = Number(data.donors ?? data.fundraiser_donors ?? data?.fundraiser?.donors);

        if (Number.isFinite(goal) && goal > 0) state.goal = goal;
        if (Number.isFinite(raised) && raised >= 0) state.raised = raised;
        if (Number.isFinite(donors) && donors >= 0) state.donors = donors;

        const orgName = data.org_name ?? data?.org?.name ?? data?.org?.short_name;
        const orgMeta = data.org_meta ?? data?.org?.meta;
        if (orgName) CONFIG.org.shortName = String(orgName);
        if (orgMeta) CONFIG.org.metaLine = String(orgMeta);

        const currency = data.currency ?? data?.fundraiser?.currency;
        if (currency) CONFIG.fundraiser.currency = String(currency).toUpperCase();

        const deadline = data.deadlineISO ?? data.deadline ?? data?.fundraiser?.deadlineISO ?? data?.fundraiser?.deadline;
        if (deadline) CONFIG.fundraiser.deadlineISO = String(deadline);

        renderTop();
        renderProgress();
      } catch {
        // silent in production
      }
    }

    /* -------------------------
      Sticky + Back-to-top
    ------------------------- */
    function initChrome() {
      const sticky = $("#sticky");
      const donate = $("#donate");
      const backToTop = $("#backToTop");

      const onScroll = () => {
        const y = window.scrollY || 0;
        // back-to-top
        if (backToTop) {
          if (y > 900) { backToTop.style.display = "grid"; backToTop.hidden = false; }
          else { backToTop.style.display = "none"; backToTop.hidden = true; }
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();

      backToTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

      if (!sticky) return;

      const updateSticky = (donateInView) => {
        const shouldShow = !donateInView && (window.scrollY || 0) > 500;
        setShown(sticky, shouldShow);
      };

      if (donate && "IntersectionObserver" in window) {
        let donateInView = false;
        const io = new IntersectionObserver((entries) => {
          donateInView = !!entries?.[0]?.isIntersecting;
          updateSticky(donateInView);
        }, { threshold: 0.15 });
        io.observe(donate);

        window.addEventListener("scroll", () => updateSticky(donateInView), { passive: true });
        updateSticky(false);
      } else {
        window.addEventListener("scroll", () => setShown(sticky, (window.scrollY || 0) > 500), { passive: true });
        setShown(sticky, false);
      }
    }

    /* -------------------------
      Donation + Checkout
    ------------------------- */
    const els = {
      form: $("#donationForm"),
      amountInput: $("#amountInput"),
      freqHidden: $("#frequencyHidden"),
      teamSelect: $("#teamSelect"),
      nameInput: $("#nameInput"),
      emailInput: $("#emailInput"),
      noteInput: $("#noteInput"),
      coverFees: $("#coverFees"),
      roundUp: $("#roundUp"),
      updatesOptIn: $("#updatesOptIn"),
      summaryAmount: $("#summaryAmount"),
      summaryFreq: $("#summaryFreq"),
      summaryFeeLine: $("#summaryFeeLine"),
      submitBtn: $("#submitBtn"),
      formError: $("#formError"),
      idemHidden: $("#ffIdemHidden"),
      totalHidden: $("#ffTotalHidden"),

      checkoutModal: $("#checkoutModal"),
      checkoutLoading: $("#checkoutLoading"),
      checkoutError: $("#checkoutModalError"),
      checkoutClose: $("#checkoutClose"),
      checkoutClose2: $("#checkoutClose2"),
      checkoutHelp: $("#checkoutHelp"),
      payNowBtn: $("#payNowBtn"),
      paymentElementHost: $("#paymentElement"),

      successModal: $("#successModal"),
      successAmount: $("#successAmount"),
      successEmail: $("#successEmail"),
      successFrequency: $("#successFrequency"),
      successTeam: $("#successTeam"),
      successClose: $("#successClose"),
      successBack: $("#successBack"),
      successShare: $("#successShare"),
      successCopy: $("#successCopy"),
    };

    const showFormError = (msg) => {
      if (!els.formError) return;
      const m = String(msg || "");
      els.formError.style.display = m ? "block" : "none";
      els.formError.textContent = m;
    };
    const showCheckoutError = (msg) => {
      if (!els.checkoutError) return;
      const m = String(msg || "");
      els.checkoutError.style.display = m ? "block" : "none";
      els.checkoutError.textContent = m;
    };

    const setBtnBusy = (btn, busy, text) => {
      if (!btn) return;
      btn.disabled = !!busy;
      btn.setAttribute("aria-disabled", String(!!busy));
      if (text) btn.textContent = text;
    };

    const parseAmountInput = () => {
      const raw = String(els.amountInput?.value ?? "").trim();
      const cleaned = raw.replace(/[^\d.]/g, "");
      const num = Number.parseFloat(cleaned);
      if (!Number.isFinite(num)) return 0;

      const min = Number(els.amountInput?.min || 1);
      const max = Number(els.amountInput?.max || 50000);
      const rounded = Math.round(num * 100) / 100;
      return clamp(rounded, min, max);
    };

    const computeDonationTotal = (base) => {
      let adjusted = Number(base) || 0;

      if (els.roundUp?.checked && adjusted > 0) {
        adjusted = Math.ceil(adjusted / 5) * 5;
      }

      let fee = 0;
      if (els.coverFees?.checked && adjusted > 0) {
        const pctFee = 0.029;
        const fixed = 0.30;
        fee = Math.max(((adjusted + fixed) / (1 - pctFee)) - adjusted, 0);
        fee = Math.round(fee * 100) / 100;
      }

      const total = Math.round((adjusted + fee) * 100) / 100;
      return { adjusted, fee, total };
    };

    const validateReadyToDonate = ({ showErrors = false } = {}) => {
      const amount = parseAmountInput();
      const name = String(els.nameInput?.value || "").trim();
      const email = String(els.emailInput?.value || "").trim();

      const okAmount = amount >= 1;
      const okName = name.length >= 2;
      const okEmail = isEmail(email);
      const ok = okAmount && okName && okEmail;

      if (els.submitBtn) {
        els.submitBtn.disabled = !ok;
        els.submitBtn.setAttribute("aria-disabled", String(!ok));
      }

      if (showErrors && !ok) {
        if (!okAmount) showFormError("Please enter a donation amount of at least $1.");
        else if (!okName) showFormError("Please enter your name.");
        else if (!okEmail) showFormError("Please enter a valid email (used for your receipt).");
      }

      return ok;
    };

    const updateSummary = () => {
      showFormError("");

      const base = parseAmountInput();
      const freq = els.freqHidden?.value === "monthly" ? "Monthly" : "One-time";
      const { fee, total } = computeDonationTotal(base);

      if (els.totalHidden) els.totalHidden.value = String(total);
      if (els.summaryAmount) els.summaryAmount.textContent = money2(total || 0);
      if (els.summaryFreq) els.summaryFreq.textContent = freq;

      if (els.summaryFeeLine) {
        if (fee > 0) {
          els.summaryFeeLine.style.display = "block";
          els.summaryFeeLine.textContent = `Includes an estimated ${money2(fee)} to cover processing fees.`;
        } else {
          els.summaryFeeLine.style.display = "none";
          els.summaryFeeLine.textContent = "";
        }
      }

      validateReadyToDonate();
    };

    const setFrequency = (freq) => {
      const f = freq === "monthly" ? "monthly" : "once";
      if (els.freqHidden) els.freqHidden.value = f;

      $$("[data-frequency]").forEach((btn) => {
        const key = btn.getAttribute("data-frequency");
        const disabled = btn.getAttribute("aria-disabled") === "true";
        btn.setAttribute("aria-pressed", String(key === f && !disabled));
      });

      if (els.summaryFreq) els.summaryFreq.textContent = f === "monthly" ? "Monthly" : "One-time";
      updateSummary();
    };

    const setAmount = (v, { scroll = false } = {}) => {
      if (!els.amountInput) return;

      const min = Number(els.amountInput.min || 1);
      const max = Number(els.amountInput.max || 50000);
      const amt = clamp(Math.round((Number(v) || 0) * 100) / 100, min, max);

      els.amountInput.value = String(amt);

      const btns = [...$$("[data-quick-amount]"), ...$$("[data-form-amount]"), ...$$("[data-prefill-amount]")];
      btns.forEach((btn) => {
        const bAmt = Number(
          btn.getAttribute("data-quick-amount") ||
          btn.getAttribute("data-form-amount") ||
          btn.getAttribute("data-prefill-amount")
        ) || 0;
        btn.setAttribute("aria-pressed", String(bAmt === amt && amt > 0));
      });

      updateSummary();
      if (scroll) $("#donate")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const setTeam = (key) => {
      if (!els.teamSelect) return;
      const k = String(key || "all");
      const opt = Array.from(els.teamSelect.options).find((o) => o.value === k);
      els.teamSelect.value = opt ? k : "all";
      updateSummary();
    };

    /* -------------------------
      Modals (checkout/success)
    ------------------------- */
    let lastActiveEl = null;

    const lockScroll = (lock) => {
      const docEl = document.documentElement;
      const body = document.body;

      if (lock) {
        const scrollBarWidth = window.innerWidth - docEl.clientWidth;
        docEl.style.overflow = "hidden";
        body.style.overflow = "hidden";
        if (scrollBarWidth > 0) body.style.paddingRight = scrollBarWidth + "px";
      } else {
        docEl.style.overflow = "";
        body.style.overflow = "";
        body.style.paddingRight = "";
      }
    };

    const openModal = (modalEl) => {
      if (!modalEl) return;
      lastActiveEl = document.activeElement;
      modalEl.setAttribute("data-open", "true");
      modalEl.setAttribute("aria-hidden", "false");
      lockScroll(true);
      setTimeout(() => modalEl.querySelector('[tabindex="-1"],button,a,input,select,textarea')?.focus?.(), 0);
    };

    const closeModal = (modalEl) => {
      if (!modalEl) return;
      modalEl.setAttribute("data-open", "false");
      modalEl.setAttribute("aria-hidden", "true");
      lockScroll(false);
      if (lastActiveEl && typeof lastActiveEl.focus === "function") setTimeout(() => lastActiveEl.focus(), 0);
    };

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (els.successModal?.getAttribute("data-open") === "true") closeModal(els.successModal);
      if (els.checkoutModal?.getAttribute("data-open") === "true") closeModal(els.checkoutModal);
    });

    /* -------------------------
      Stripe.js loader (single instance)
    ------------------------- */
    let stripeJsPromise = null;
    const ensureStripeJs = () => {
      if (window.Stripe) return Promise.resolve();
      if (stripeJsPromise) return stripeJsPromise;

      stripeJsPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-stripe-js="true"]');
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("Stripe.js failed to load.")), { once: true });
          return;
        }
        const s = document.createElement("script");
        s.src = "https://js.stripe.com/v3/";
        s.async = true;
        s.setAttribute("data-stripe-js", "true");
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Stripe.js failed to load."));
        document.head.appendChild(s);
      });

      return stripeJsPromise;
    };

    /* -------------------------
      Checkout state (Stripe Elements safe lifecycle)
    ------------------------- */
    const checkout = {
      stripe: null,
      elements: null,
      paymentEl: null,
      clientSecret: "",
      publishableKey: "",
      mounted: false,
      inflight: false,
      confirming: false,
    };

    const resetCheckoutUi = () => {
      showCheckoutError("");
      if (els.checkoutLoading) els.checkoutLoading.style.display = "none";
      setBtnBusy(els.payNowBtn, true, "Pay now");
    };

    const teardownPaymentElementOnly = () => {
      if (checkout.paymentEl) {
        try { checkout.paymentEl.unmount(); } catch {}
      }
      checkout.paymentEl = null;
      checkout.mounted = false;
    };

    const resetCheckoutSession = () => {
      teardownPaymentElementOnly();
      checkout.elements = null;
      checkout.clientSecret = "";
    };

      async function createIntentFromServer({ totalDollars, idemKey, donor }) {
      const endpoint = getCheckoutEndpoint();
      const csrf = getCsrfToken();

      const cents = Math.max(0, Math.round((Number(totalDollars) || 0) * 100));
      if (!cents) throw new Error("Donation total must be at least $1.");

      const payload = {
        amount: cents,                            // cents
        currency: currencyCode(),                 // "USD"
        idem_key: idemKey,
        idempotency_key: idemKey,
        _token: csrf || undefined,
        // keep both nested + flat for backend compatibility
        donor: donor || {},
        name: donor?.name || "",
        email: donor?.email || "",
        note: donor?.note || "",
        team_focus: donor?.team_focus || "all",
        frequency: donor?.frequency || "once",
        cover_fees: !!donor?.cover_fees,
        round_up: !!donor?.round_up,
        updates_opt_in: !!donor?.updates_opt_in,
        page_url: window.location.href,
      };

      const headers = {};
      if (csrf) headers["X-CSRF-TOKEN"] = csrf;
      // optional but helpful if your backend reads headers for idempotency
      headers["X-Idempotency-Key"] = idemKey;

      return fetchJson(endpoint, { method: "POST", payload, headers, timeoutMs: 15000 });
    }

    const extractStripeInfo = (data) => {
      // Accept common shapes
      const clientSecret =
        data?.clientSecret ||
        data?.client_secret ||
        data?.payment_intent_client_secret ||
        data?.paymentIntent?.client_secret ||
        data?.payment_intent?.client_secret ||
        "";

      const publishableKey =
        data?.publishableKey ||
        data?.stripePublishableKey ||
        data?.stripe_pk ||
        data?.stripePk ||
        data?.pk ||
        "";

      return { clientSecret: String(clientSecret || ""), publishableKey: String(publishableKey || "") };
    };

    const canonicalUrl = () => {
      const u = new URL(window.location.href);
      u.hash = "";
      return u.toString();
    };

    async function copyText(text) {
      const t = String(text || "");
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(t);
          return true;
        }
      } catch {}
      // fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }

    async function shareFundraiser() {
      const url = canonicalUrl();
      const title = `Support ${CONFIG.org?.shortName || "our program"} • FutureFunded`;
      const text = `Donate securely and help fund the season.`;

      if (navigator.share) {
        try {
          await navigator.share({ title, text, url });
          return true;
        } catch {
          // user canceled or share failed; fall back to copy
        }
      }
      const ok = await copyText(url);
      toast(ok ? "Link copied." : "Couldn’t copy link.");
      return ok;
    }

    function buildDonorFromForm() {
      const base = parseAmountInput();
      const { adjusted, fee, total } = computeDonationTotal(base);

      const donor = {
        name: String(els.nameInput?.value || "").trim(),
        email: String(els.emailInput?.value || "").trim(),
        note: String(els.noteInput?.value || "").trim(),
        team_focus: String(els.teamSelect?.value || "all"),
        frequency: String(els.freqHidden?.value || "once"),
        cover_fees: !!els.coverFees?.checked,
        round_up: !!els.roundUp?.checked,
        updates_opt_in: !!els.updatesOptIn?.checked,
        // informational only (backend can ignore)
        base_amount: adjusted,
        fee_estimate: fee,
      };

      return { donor, total };
    }

    function showSuccess({ amountTotal, donor }) {
      if (els.successAmount) els.successAmount.textContent = money2(amountTotal || 0);
      if (els.successEmail) els.successEmail.textContent = donor?.email || "your email";
      if (els.successFrequency) els.successFrequency.textContent = donor?.frequency === "monthly" ? "Monthly" : "One-time";

      const teamKey = donor?.team_focus || "all";
      const teamName =
        teamKey === "all"
          ? "All teams"
          : (state.teams.find((t) => t.key === teamKey)?.name || "Selected team");
      if (els.successTeam) els.successTeam.textContent = teamName;

      openModal(els.successModal);
    }

    async function ensureStripeReady(publishableKey) {
      await ensureStripeJs();

      const pk = String(publishableKey || "").trim() || checkout.publishableKey || getStripePkFromMeta();
      if (!pk) throw new Error("Stripe publishable key is missing. Set meta ff-stripe-pk or return it from the intent endpoint.");

      checkout.publishableKey = pk;

      if (!checkout.stripe) {
        checkout.stripe = window.Stripe(pk);
      }
      if (!checkout.stripe) throw new Error("Stripe failed to initialize.");
    }

    async function openCheckoutFlow() {
      if (checkout.inflight) return;
      checkout.inflight = true;

      showFormError("");

      const ok = validateReadyToDonate({ showErrors: true });
      if (!ok) { checkout.inflight = false; return; }

      const { donor, total } = buildDonorFromForm();
      if (!total || total < 1) {
        showFormError("Please enter a donation amount of at least $1.");
        checkout.inflight = false;
        return;
      }

      // idempotency
      const idemKey = uuid();
      if (els.idemHidden) els.idemHidden.value = idemKey;

      // Open modal immediately, show loading state
      resetCheckoutUi();
      if (els.checkoutLoading) els.checkoutLoading.style.display = "block";
      openModal(els.checkoutModal);

      try {
        resetCheckoutSession();

        const intentRes = await createIntentFromServer({ totalDollars: total, idemKey, donor });
        const { clientSecret, publishableKey } = extractStripeInfo(intentRes);

        if (!clientSecret) throw new Error("Payment session did not return a clientSecret.");
        checkout.clientSecret = clientSecret;

        // Must init stripe AFTER we know PK (preferred from server)
        await ensureStripeReady(publishableKey);

        checkout.elements = checkout.stripe.elements({ clientSecret: checkout.clientSecret });

        // Build & mount Payment Element safely
        teardownPaymentElementOnly();
        checkout.paymentEl = checkout.elements.create("payment");
        checkout.paymentEl.mount(els.paymentElementHost);

        checkout.mounted = true;

        // Enable pay button only when payment element says it's complete
        setBtnBusy(els.payNowBtn, true, "Pay now");
        checkout.paymentEl.on("change", (ev) => {
          if (checkout.confirming) return;
          const complete = !!ev.complete;
          els.payNowBtn.disabled = !complete;
          els.payNowBtn.setAttribute("aria-disabled", String(!complete));
          if (ev.error?.message) showCheckoutError(ev.error.message);
          else showCheckoutError("");
        });

        // Hide loading and let user proceed
        if (els.checkoutLoading) els.checkoutLoading.style.display = "none";
        // If user already completed instantly (rare), allow payment
        els.payNowBtn.disabled = false;
        els.payNowBtn.setAttribute("aria-disabled", "false");

      } catch (err) {
        const msg = err?.message || "Unable to start checkout. Please try again.";
        showCheckoutError(msg);
        if (els.checkoutLoading) els.checkoutLoading.style.display = "none";
      } finally {
        checkout.inflight = false;
      }
    }

    async function confirmStripePayment() {
      if (!checkout.stripe || !checkout.elements || !checkout.clientSecret) {
        showCheckoutError("Payment form isn’t ready yet. Please wait a moment.");
        return;
      }
      if (checkout.confirming) return;

      checkout.confirming = true;
      showCheckoutError("");
      setBtnBusy(els.payNowBtn, true, "Processing…");

      const { donor, total } = buildDonorFromForm();

      try {
        const result = await checkout.stripe.confirmPayment({
          elements: checkout.elements,
          confirmParams: {
            payment_method_data: {
              billing_details: {
                name: donor.name || undefined,
                email: donor.email || undefined,
              },
            },
          },
          redirect: "if_required",
        });

        if (result?.error) {
          throw new Error(result.error.message || "Payment failed. Please try again.");
        }

        const pi = result?.paymentIntent;
        const status = pi?.status || "";

        if (status === "succeeded" || status === "processing" || status === "requires_capture") {
          // Close checkout, reset
          closeModal(els.checkoutModal);
          resetCheckoutSession();
          resetCheckoutUi();

          // Optimistic UI update; backend refresh will reconcile
          state.raised = (Number(state.raised) || 0) + Number(total || 0);
          state.donors = (Number(state.donors) || 0) + 1;
          renderProgress();

          showSuccess({ amountTotal: total, donor });
          toast("Donation confirmed.");

          // Pull authoritative numbers shortly after
          setTimeout(() => refreshFromBackend(), 1200);
        } else {
          throw new Error("Payment wasn’t completed. Please try again.");
        }
      } catch (err) {
        showCheckoutError(err?.message || "Payment failed. Please try again.");
        // allow retry
        els.payNowBtn.disabled = false;
        els.payNowBtn.setAttribute("aria-disabled", "false");
      } finally {
        checkout.confirming = false;
      }
    }

    function closeCheckout() {
      // If confirming, do not hard-close to avoid weird states
      if (checkout.confirming) return;

      closeModal(els.checkoutModal);
      resetCheckoutSession();
      resetCheckoutUi();
    }

    function bindCheckoutModal() {
      if (!els.checkoutModal) return;

      // backdrop click
      els.checkoutModal.addEventListener("click", (e) => {
        if (e.target === els.checkoutModal) closeCheckout();
      });

      els.checkoutClose?.addEventListener("click", closeCheckout);
      els.checkoutClose2?.addEventListener("click", closeCheckout);

      els.checkoutHelp?.addEventListener("click", () => {
        const email = CONFIG.supportEmail || "support@getfuturefunded.com";
        window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("FutureFunded checkout help")}`;
      });

      els.payNowBtn?.addEventListener("click", () => confirmStripePayment());
    }

    function bindSuccessModal() {
      if (!els.successModal) return;

      els.successModal.addEventListener("click", (e) => {
        if (e.target === els.successModal) closeModal(els.successModal);
      });

      els.successClose?.addEventListener("click", () => closeModal(els.successModal));
      els.successBack?.addEventListener("click", () => closeModal(els.successModal));
      els.successShare?.addEventListener("click", () => shareFundraiser());
      els.successCopy?.addEventListener("click", async () => {
        const ok = await copyText(canonicalUrl());
        toast(ok ? "Link copied." : "Couldn’t copy link.");
      });
    }

    /* -------------------------
      Bindings: donation form + prefill
    ------------------------- */
    function bindDonationForm() {
      if (!els.form || state.bound) return;
      state.bound = true;

      // amount chips (inside donate card)
      $$("[data-form-amount]").forEach((btn) => {
        btn.addEventListener("click", () => setAmount(btn.getAttribute("data-form-amount"), { scroll: false }));
      });

      // quick gifts (progress card)
      $$("[data-quick-amount]").forEach((btn) => {
        btn.addEventListener("click", () => setAmount(btn.getAttribute("data-quick-amount"), { scroll: true }));
      });

      // general prefill buttons
      document.addEventListener("click", (e) => {
        const prefill = e.target?.closest?.("[data-prefill-amount]");
        if (prefill) {
          e.preventDefault();
          const amt = prefill.getAttribute("data-prefill-amount");
          const team = prefill.getAttribute("data-prefill-team");
          setAmount(amt, { scroll: true });
          if (team) setTeam(team);
          $("#impactStatus") && ($("#impactStatus").textContent = `Prefilled ${money0(Number(amt) || 0)}.`); // a11y
          return;
        }

        const setTeamLink = e.target?.closest?.("[data-set-team]");
        if (setTeamLink) {
          e.preventDefault();
          const team = setTeamLink.getAttribute("data-set-team");
          setTeam(team);
          $("#donate")?.scrollIntoView({ behavior: "smooth", block: "start" });
          toast("Team selected.");
        }
      });

      // fee/rounding changes
      els.coverFees?.addEventListener("change", updateSummary);
      els.roundUp?.addEventListener("change", updateSummary);
      els.teamSelect?.addEventListener("change", updateSummary);

      // validation inputs
      const onInput = () => { updateSummary(); };
      els.amountInput?.addEventListener("input", onInput);
      els.nameInput?.addEventListener("input", () => validateReadyToDonate());
      els.emailInput?.addEventListener("input", () => validateReadyToDonate());
      els.noteInput?.addEventListener("input", () => {}); // no-op; keeps future extension easy

      // frequency segmented
      $$("[data-frequency]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (btn.getAttribute("aria-disabled") === "true") return;
          setFrequency(btn.getAttribute("data-frequency"));
        });
      });

      // form submit => open modal + create intent + mount element
      els.form.addEventListener("submit", async (e) => {
        e.preventDefault();
        await openCheckoutFlow();
      });

      // Default amount if empty (helps conversions)
      if (els.amountInput && !String(els.amountInput.value || "").trim()) {
        const params = new URLSearchParams(window.location.search);
        const urlAmt = Number(params.get("amount"));
        const urlTeam = params.get("team");
        if (Number.isFinite(urlAmt) && urlAmt > 0) setAmount(urlAmt, { scroll: false });
        else setAmount(50, { scroll: false });
        if (urlTeam) setTeam(urlTeam);
      } else {
        updateSummary();
      }

      validateReadyToDonate();
    }

    /* -------------------------
      Team filter/search bindings
    ------------------------- */
    function bindTeamTools() {
      const search = $("#teamSearch");
      const segBtns = $$("[data-team-filter]");

      segBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.getAttribute("data-team-filter") || "all";
          state.teamFilter = key;
          segBtns.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
          applyTeamFilters();
        });
      });

      search?.addEventListener("input", () => {
        state.teamQuery = String(search.value || "");
        applyTeamFilters();
      });

      // Clicking a team card preselects team + scrolls to donate (conversion)
      document.addEventListener("click", (e) => {
        const card = e.target?.closest?.(".team-card");
        if (!card) return;
        // Avoid hijacking if they clicked an interactive element inside
        if (e.target?.closest?.("button,a,input,select,textarea")) return;

        const key = card.getAttribute("data-team");
        if (key) {
          setTeam(key);
          $("#donate")?.scrollIntoView({ behavior: "smooth", block: "start" });
          toast("Team selected.");
        }
      });
    }

    /* -------------------------
      Share + copy bindings
    ------------------------- */
    function bindShareCopy() {
      const shareBtns = [
        $("#shareBtnTop"),
        $("#shareBtnDrawer"),
        $("#shareBtnGifts"),
        $("#shareBtn2"),
      ].filter(Boolean);

      shareBtns.forEach((b) => b.addEventListener("click", () => shareFundraiser()));

      const copyBtns = [
        $("#copyLinkBtn"),
        $("#copyLinkBtn2"),
        $("#copyLinkBtn3"),
        $("#copyLinkBtn4"),
      ].filter(Boolean);

      copyBtns.forEach((b) =>
        b.addEventListener("click", async () => {
          const ok = await copyText(canonicalUrl());
          toast(ok ? "Link copied." : "Couldn’t copy link.");
        })
      );

      $("#copySponsorBadgeBtn")?.addEventListener("click", async () => {
        const url = canonicalUrl();
        const org = CONFIG.org?.shortName || "our program";
        const badge = `Proud Sponsor of ${org} • Donate: ${url}`;
        const ok = await copyText(badge);
        toast(ok ? "Sponsor badge copied." : "Couldn’t copy badge.");
      });

      $("#successShare")?.addEventListener("click", () => shareFundraiser());
    }

    /* -------------------------
      Boot
    ------------------------- */
    function boot() {
      applyBrand();
      initTheme();
      initTopbarDismiss();
      initHeaderShadow();
      initDrawer();
      initScrollSpy();

      renderTop();
      renderProgress();
      renderAllocation();
      renderImpact();
      renderRecentGifts();
      renderTeams();
      renderSponsors();
      renderEventCountdown();

      bindDonationForm();
      bindCheckoutModal();
      bindSuccessModal();
      bindTeamTools();
      bindShareCopy();

      initChrome();

      measureStickyOffsets();
      window.addEventListener("resize", () => measureStickyOffsets(), { passive: true });

      // periodic refresh (optional)
      const ms = Number(CONFIG.liveRefreshMs) || 0;
      if (ms >= 8000) {
        setInterval(() => refreshFromBackend(), ms);
      } else {
        // one refresh shortly after load
        setTimeout(() => refreshFromBackend(), 1400);
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }

  })();
  </script>
   
</body>
</html>
