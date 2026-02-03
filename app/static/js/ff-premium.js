// ff-premium.js — non-invasive premium overlay
(function(){
  if (window.__FF_PREMIUM_LOADED__) return;
  window.__FF_PREMIUM_LOADED__ = true;

  function $(sel, root=document){ return root.querySelector(sel); }
  function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  // Add verified badge if not present
  function addVerifiedBadge(){
    var badge = document.getElementById('ff-verified-badge');
    if(badge) return;
    var org = document.getElementById('org-name') || document.getElementById('ff-org-title') || document.querySelector('.org-name') || document.querySelector('h1');
    if(!org) return;
    badge = document.createElement('span');
    badge.id = 'ff-verified-badge';
    badge.className = 'ff-verified-badge';
    badge.title = 'Verified organizer — EIN/school ID on file';
    badge.textContent = 'Verified Organizer';
    org.appendChild(document.createTextNode(' '));
    org.appendChild(badge);
  }

  // Trust strip and activity ticker population (demo-only)
  function hydrateActivityTicker(){
    var ticker = document.getElementById('ff-activity-ticker');
    if(!ticker) return;
    var items = [
      {text: 'Maria donated $25 • 2 min ago'},
      {text: 'Team A reached 50% of goal • 10 min ago'},
      {text: 'Sponsor X claimed a leaderboard spot • 1h ago'}
    ];
    ticker.innerHTML = '';
    items.forEach(function(it){
      var d = document.createElement('div');
      d.className = 'ff-activity-item';
      d.textContent = it.text;
      ticker.appendChild(d);
    });
  }

  // Progress card simple upgrade: find elements with class .progress and append percent if missing
  function upgradeProgressCards(){
    $all('.progress').forEach(function(p){
      if(p.querySelector('.ff-percent')) return;
      var bar = document.createElement('div');
      bar.className = 'ff-percent';
      bar.textContent = (p.getAttribute('data-percent') || '0') + '% funded';
      p.appendChild(bar);
    });
  }

  // Add admin screenshot box somewhere near footer for "platform" proof
  function addAdminProofShot(){
    if(document.getElementById('ff-admin-screenshot')) return;
    var main = document.querySelector('main') || document.body;
    var box = document.createElement('div');
    box.id = 'ff-admin-screenshot';
    box.className = 'ff-admin-screenshot';
    box.innerHTML = '<strong>Admin preview</strong><div style="margin-top:8px">Campaign editor • Upload logo/colors • View donations • Export CSV</div>';
    main.insertBefore(box, main.firstChild);
  }

  // Initialize
  function init(){
    addVerifiedBadge();
    hydrateActivityTicker();
    upgradeProgressCards();
    addAdminProofShot();
    // Poll /api/activity if available
    if(window.fetch){
      fetch('/api/activity').then(function(r){ if(r.ok) return r.json(); }).then(function(j){
        if(!j || !j.items) return;
        var ticker = document.getElementById('ff-activity-ticker');
        if(!ticker) return;
        ticker.innerHTML = '';
        j.items.forEach(function(it){
          var d = document.createElement('div');
          d.className = 'ff-activity-item';
          d.textContent = it.text;
          ticker.appendChild(d);
        });
      }).catch(function(){});
    }
  }
  if(document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(init, 50);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
