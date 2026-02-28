#!/usr/bin/env node
// Minimal smoke_dom stub — hits the homepage and ensures HTTP 200
const url = process.env.SMOKE_URL || 'http://127.0.0.1:5000/'\;

(async () => {
  try {
    const res = await fetch(url, { method: 'GET' });
    if (res && res.status === 200) {
      console.log('DOM smoke test passed');
      process.exit(0);
    }
    console.error('DOM smoke failed: status', res && res.status);
    process.exit(2);
  } catch (e) {
    console.error('DOM smoke error:', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
