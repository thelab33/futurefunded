# FutureFunded Launch War Room

**Verdict:** RED

**Reason:** Critical blockers still open. Do not launch publicly.

**Updated at:** 2026-03-11T18:40:34+00:00

## Summary

- PASS: 0
- FAIL: 5
- BLOCKED: 0
- PENDING: 139
- N/A: 0

## Critical open items

- **CB-01** — Production root domain serves successfully (no Cloudflare 530)
  - Status: FAIL
  - Owner: Angel
  - Note: Cloudflare 530 on root domain
  - Evidence: curl returned HTTP/2 530
- **CB-02** — Production static CSS and JS assets serve successfully
  - Status: FAIL
  - Owner: Angel
  - Note: Static ff.css / ff-app.js returning 530
  - Evidence: curl -I static assets returned HTTP/2 530
- **CB-03** — Production Socket.IO / WebSocket behavior is non-fatal or correctly configured
  - Status: FAIL
  - Owner: Angel
  - Note: Socket.IO still trying localhost ws://127.0.0.1:5000 in smoke path
  - Evidence: Playwright smoke console error
- **CB-04** — UI/UX gate has no missing CSS id selector for ffLiveFeedTitle
  - Status: FAIL
  - Owner: Angel
  - Note: Missing CSS id selector coverage for #ffLiveFeedTitle
  - Evidence: pw:ux failed in dark and light
- **CB-05** — Smoke test has no fatal console errors
  - Status: FAIL
  - Owner: Angel
  - Note: Smoke test failed on fatal console error
  - Evidence: pw:smoke failed
- **AN-05** — Successful donation event is tracked
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **DI-04** — Goal amount is correct
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **DI-05** — Raised amount source is correct
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **DI-06** — Progress percentage is correct
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **FI-16** — Sponsor email lands where expected
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **MO-10** — Checkout sheet is fully usable on mobile
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-01** — Stripe is using live publishable key
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-02** — Stripe is using live secret key
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-03** — PayPal is using live client credentials
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-04** — Production webhook endpoints are configured correctly
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-05** — Stripe webhook events are received successfully
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-06** — PayPal callback / approval / cancel flows return correctly
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-07** — Custom donation amount works
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-08** — Preset donation buttons preload the amount correctly
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-09** — Team-specific donation buttons pass the correct team id
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-10** — Player-specific donation buttons pass the correct player id
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-11** — Successful payment updates totals correctly
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-12** — Failed payment shows a clean error state
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-13** — Cancelled payment returns the user safely
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-14** — Receipt / confirmation email sends after successful payment
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **RC-18** — QR code opens the production donation URL
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **SE-01** — HTTPS is active everywhere
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **SE-02** — Production environment variables are correct
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **SE-03** — No test keys in source or rendered HTML
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **SE-06** — Error pages do not leak stack traces
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **SE-10** — Domain, DNS, SSL, and redirects are correct
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —
- **TC-12** — The page feels safe enough for a first-time donor to complete payment
  - Status: PENDING
  - Owner: —
  - Note: —
  - Evidence: —

## 0) Current blockers

| ID | Severity | Check | PASS | FAIL | BLOCKED | N/A | Status | Owner | Notes | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CB-01 | critical | Production root domain serves successfully (no Cloudflare 530) |  | X |  |  | fail | Angel | Cloudflare 530 on root domain | curl returned HTTP/2 530 |
| CB-02 | critical | Production static CSS and JS assets serve successfully |  | X |  |  | fail | Angel | Static ff.css / ff-app.js returning 530 | curl -I static assets returned HTTP/2 530 |
| CB-03 | critical | Production Socket.IO / WebSocket behavior is non-fatal or correctly configured |  | X |  |  | fail | Angel | Socket.IO still trying localhost ws://127.0.0.1:5000 in smoke path | Playwright smoke console error |
| CB-04 | critical | UI/UX gate has no missing CSS id selector for ffLiveFeedTitle |  | X |  |  | fail | Angel | Missing CSS id selector coverage for #ffLiveFeedTitle | pw:ux failed in dark and light |
| CB-05 | critical | Smoke test has no fatal console errors |  | X |  |  | fail | Angel | Smoke test failed on fatal console error | pw:smoke failed |

## 1) Revenue-critical launch blockers

| ID | Severity | Check | PASS | FAIL | BLOCKED | N/A | Status | Owner | Notes | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RC-01 | critical | Stripe is using live publishable key |  |  |  |  | pending | — | — | — |
| RC-02 | critical | Stripe is using live secret key |  |  |  |  | pending | — | — | — |
| RC-03 | critical | PayPal is using live client credentials |  |  |  |  | pending | — | — | — |
| RC-04 | critical | Production webhook endpoints are configured correctly |  |  |  |  | pending | — | — | — |
| RC-05 | critical | Stripe webhook events are received successfully |  |  |  |  | pending | — | — | — |
| RC-06 | critical | PayPal callback / approval / cancel flows return correctly |  |  |  |  | pending | — | — | — |
| RC-07 | critical | Custom donation amount works |  |  |  |  | pending | — | — | — |
| RC-08 | critical | Preset donation buttons preload the amount correctly |  |  |  |  | pending | — | — | — |
| RC-09 | critical | Team-specific donation buttons pass the correct team id |  |  |  |  | pending | — | — | — |
| RC-10 | critical | Player-specific donation buttons pass the correct player id |  |  |  |  | pending | — | — | — |
| RC-11 | critical | Successful payment updates totals correctly |  |  |  |  | pending | — | — | — |
| RC-12 | critical | Failed payment shows a clean error state |  |  |  |  | pending | — | — | — |
| RC-13 | critical | Cancelled payment returns the user safely |  |  |  |  | pending | — | — | — |
| RC-14 | critical | Receipt / confirmation email sends after successful payment |  |  |  |  | pending | — | — | — |
| RC-18 | critical | QR code opens the production donation URL |  |  |  |  | pending | — | — | — |
| RC-15 | important | Currency is correct everywhere |  |  |  |  | pending | — | — | — |
| RC-16 | important | Apple Pay / Google Pay behavior is acceptable on supported devices |  |  |  |  | pending | — | — | — |
| RC-17 | important | Refund / dispute support path is real and tested |  |  |  |  | pending | — | — | — |
| RC-19 | important | Share button uses the correct title, text, and canonical URL |  |  |  |  | pending | — | — | — |
| RC-20 | important | Shared link preview looks correct in iMessage / SMS / Facebook / X |  |  |  |  | pending | — | — | — |

## 2) Data integrity checklist

| ID | Severity | Check | PASS | FAIL | BLOCKED | N/A | Status | Owner | Notes | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DI-04 | critical | Goal amount is correct |  |  |  |  | pending | — | — | — |
| DI-05 | critical | Raised amount source is correct |  |  |  |  | pending | — | — | — |
| DI-06 | critical | Progress percentage is correct |  |  |  |  | pending | — | — | — |
| DI-01 | important | Organization name is final everywhere |  |  |  |  | pending | — | — | — |
| DI-02 | important | Campaign name is final everywhere |  |  |  |  | pending | — | — | — |
| DI-03 | important | Logo is correct and crisp |  |  |  |  | pending | — | — | — |
| DI-07 | important | Deadline is correct |  |  |  |  | pending | — | — | — |
| DI-08 | important | Location is correct |  |  |  |  | pending | — | — | — |
| DI-09 | important | Team list is accurate |  |  |  |  | pending | — | — | — |
| DI-10 | important | Team photos are correct and not broken |  |  |  |  | pending | — | — | — |
| DI-11 | important | Sponsor tiers and copy are accurate |  |  |  |  | pending | — | — | — |
| DI-12 | important | Contact email is correct |  |  |  |  | pending | — | — | — |
| DI-13 | important | Terms URL is real |  |  |  |  | pending | — | — | — |
| DI-14 | important | Privacy URL is real |  |  |  |  | pending | — | — | — |
| DI-15 | important | Refund / policy copy is real |  |  |  |  | pending | — | — | — |
| DI-16 | important | No lorem ipsum, fake names, placeholder copy, or preview-only language |  |  |  |  | pending | — | — | — |
| DI-17 | normal | No stale preview / demo badges visible unless intentional |  |  |  |  | pending | — | — | — |

## 3) Form and interaction checklist

| ID | Severity | Check | PASS | FAIL | BLOCKED | N/A | Status | Owner | Notes | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FI-16 | critical | Sponsor email lands where expected |  |  |  |  | pending | — | — | — |
| FI-01 | important | Click donate from hero |  |  |  |  | pending | — | — | — |
| FI-02 | important | Click donate from sticky nav |  |  |  |  | pending | — | — | — |
| FI-03 | important | Click donate from team cards |  |  |  |  | pending | — | — | — |
| FI-04 | important | Click donate from player sponsor cards |  |  |  |  | pending | — | — | — |
| FI-05 | important | Click donate from footer |  |  |  |  | pending | — | — | — |
| FI-06 | important | Open checkout, close checkout, reopen checkout |  |  |  |  | pending | — | — | — |
| FI-07 | important | Checkout traps focus correctly |  |  |  |  | pending | — | — | — |
| FI-09 | important | Backdrop click closes overlays correctly |  |  |  |  | pending | — | — | — |
| FI-10 | important | No body scroll-lock bugs |  |  |  |  | pending | — | — | — |
| FI-11 | important | No double-scroll inside modal / sheet on mobile |  |  |  |  | pending | — | — | — |
| FI-12 | important | Sponsor modal opens and closes correctly |  |  |  |  | pending | — | — | — |
| FI-13 | important | Sponsor required validation works |  |  |  |  | pending | — | — | — |
| FI-14 | important | Sponsor success state works |  |  |  |  | pending | — | — | — |
| FI-15 | important | Sponsor error state works |  |  |  |  | pending | — | — | — |
| FI-17 | important | Sponsor tier selection is passed correctly |  |  |  |  | pending | — | — | — |
| FI-18 | important | Spam protection / rate limiting exists |  |  |  |  | pending | — | — | — |
| FI-19 | important | Video opens only on demand |  |  |  |  | pending | — | — | — |
| FI-20 | important | Video closes cleanly |  |  |  |  | pending | — | — | — |
| FI-21 | important | Video does not continue playing after close |  |  |  |  | pending | — | — | — |
| FI-22 | important | Focus returns correctly after video close |  |  |  |  | pending | — | — | — |
| FI-29 | important | Hide or disable onboarding for launch if it is not public |  |  |  |  | pending | — | — | — |
| FI-08 | normal | ESC closes overlays if JS supports it |  |  |  |  | pending | — | — | — |
| FI-23 | normal | Onboarding wizard opens and closes correctly if public |  |  |  |  | pending | — | — | — |
| FI-24 | normal | Onboarding step navigation works if public |  |  |  |  | pending | — | — | — |
| FI-25 | normal | Onboarding copy brief works if public |  |  |  |  | pending | — | — | — |
| FI-26 | normal | Onboarding create draft works if public |  |  |  |  | pending | — | — | — |
| FI-27 | normal | Onboarding endpoint is production-safe if public |  |  |  |  | pending | — | — | — |
| FI-28 | normal | You actually want onboarding visible on a public fundraiser launch |  |  |  |  | pending | — | — | — |

## 4) Mobile-first launch checklist

| ID | Severity | Check | PASS | FAIL | BLOCKED | N/A | Status | Owner | Notes | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-10 | critical | Checkout sheet is fully usable on mobile |  |  |  |  | pending | — | — | — |
| MO-01 | important | Test completed on iPhone Safari |  |  |  |  | pending | — | — | — |
| MO-02 | important | Test completed on Android Chrome |  |  |  |  | pending | — | — | — |
| MO-05 | important | No horizontal scrolling anywhere |  |  |  |  | pending | — | — | — |
| MO-06 | important | Hero headline wraps cleanly |  |  |  |  | pending | — | — | — |
| MO-07 | important | Buttons do not overflow cards |  |  |  |  | pending | — | — | — |
| MO-08 | important | Sticky bottom tabs do not block primary content |  |  |  |  | pending | — | — | — |
| MO-09 | important | Back-to-top button does not collide with sticky nav |  |  |  |  | pending | — | — | — |
| MO-11 | important | Keyboard opening does not break input fields |  |  |  |  | pending | — | — | — |
| MO-12 | important | Safe-area spacing works near the bottom on iPhone |  |  |  |  | pending | — | — | — |
| MO-14 | important | Team cards remain legible and not cramped |  |  |  |  | pending | — | — | — |
| MO-15 | important | Contrast remains strong outdoors / high brightness |  |  |  |  | pending | — | — | — |
| MO-03 | normal | Test completed on one small / older phone viewport |  |  |  |  | pending | — | — | — |
| MO-04 | normal | Test completed on one large modern phone viewport |  |  |  |  | pending | — | — | — |
| MO-13 | normal | QR code is readable on mobile |  |  |  |  | pending | — | — | — |

## 5) Accessibility checklist

| ID | Severity | Check | PASS | FAIL | BLOCKED | N/A | Status | Owner | Notes | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AX-01 | important | Keyboard-only navigation works across the page |  |  |  |  | pending | — | — | — |
| AX-02 | important | Skip links work |  |  |  |  | pending | — | — | — |
| AX-03 | important | Focus states are visible |  |  |  |  | pending | — | — | — |
| AX-04 | important | Focus trap works inside drawer / modal / checkout |  |  |  |  | pending | — | — | — |
| AX-05 | important | Screen-reader labels make sense |  |  |  |  | pending | — | — | — |
| AX-06 | important | Buttons vs links are used appropriately |  |  |  |  | pending | — | — | — |
| AX-07 | important | Progress bars have meaningful labels |  |  |  |  | pending | — | — | — |
| AX-08 | important | Form inputs have labels and helpful error text |  |  |  |  | pending | — | — | — |
| AX-09 | important | Color contrast passes for body text, pills, buttons, and muted copy |  |  |  |  | pending | — | — | — |
| AX-10 | important | Images have appropriate alt text |  |  |  |  | pending | — | — | — |
| AX-11 | important | Decorative images have empty alt where correct |  |  |  |  | pending | — | — | — |
| AX-12 | normal | No autoplay audio / video surprises |  |  |  |  | pending | — | — | — |
| AX-13 | normal | Reduced motion behavior is acceptable |  |  |  |  | pending | — | — | — |

## 6) Performance checklist

| ID | Severity | Check | PASS | FAIL | BLOCKED | N/A | Status | Owner | Notes | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PF-01 | important | First load feels fast on mobile |  |  |  |  | pending | — | — | — |
| PF-02 | important | Hero image is optimized |  |  |  |  | pending | — | — | — |
| PF-03 | important | Team images are optimized |  |  |  |  | pending | — | — | — |
| PF-04 | important | Video is lazy-loaded |  |  |  |  | pending | — | — | — |
| PF-05 | important | Stripe / PayPal are lazy-loaded as intended |  |  |  |  | pending | — | — | — |
| PF-06 | important | No giant uncompressed assets |  |  |  |  | pending | — | — | — |
| PF-07 | important | No layout shift when payment widgets load |  |  |  |  | pending | — | — | — |
| PF-10 | important | No obvious jank when opening checkout / drawer / modals |  |  |  |  | pending | — | — | — |
| PF-08 | normal | Fonts are not blocking rendering badly |  |  |  |  | pending | — | — | — |
| PF-09 | normal | Lighthouse mobile score is acceptable |  |  |  |  | pending | — | — | — |

## 7) Security and production hygiene checklist

| ID | Severity | Check | PASS | FAIL | BLOCKED | N/A | Status | Owner | Notes | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SE-01 | critical | HTTPS is active everywhere |  |  |  |  | pending | — | — | — |
| SE-02 | critical | Production environment variables are correct |  |  |  |  | pending | — | — | — |
| SE-03 | critical | No test keys in source or rendered HTML |  |  |  |  | pending | — | — | — |
| SE-06 | critical | Error pages do not leak stack traces |  |  |  |  | pending | — | — | — |
| SE-10 | critical | Domain, DNS, SSL, and redirects are correct |  |  |  |  | pending | — | — | — |
| SE-04 | important | CSRF protection is active where needed |  |  |  |  | pending | — | — | — |
| SE-05 | important | Forms have spam protection or rate limiting |  |  |  |  | pending | — | — | — |
| SE-07 | important | Console has no secrets or debug dumps |  |  |  |  | pending | — | — | — |
| SE-08 | important | Cookies / settings are production-safe |  |  |  |  | pending | — | — | — |
| SE-09 | important | CSP behavior is stable in production |  |  |  |  | pending | — | — | — |
| SE-13 | important | Backup / rollback path exists |  |  |  |  | pending | — | — | — |
| SE-11 | normal | www vs non-www canonical behavior is intentional |  |  |  |  | pending | — | — | — |
| SE-12 | normal | noindex is removed if public discovery is desired |  |  |  |  | pending | — | — | — |

## 8) Analytics and business visibility checklist

| ID | Severity | Check | PASS | FAIL | BLOCKED | N/A | Status | Owner | Notes | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AN-05 | critical | Successful donation event is tracked |  |  |  |  | pending | — | — | — |
| AN-01 | important | Analytics is installed |  |  |  |  | pending | — | — | — |
| AN-02 | important | Page view tracking works |  |  |  |  | pending | — | — | — |
| AN-03 | important | Donate CTA clicks are tracked |  |  |  |  | pending | — | — | — |
| AN-04 | important | Checkout open is tracked |  |  |  |  | pending | — | — | — |
| AN-06 | important | Sponsor inquiry submit is tracked |  |  |  |  | pending | — | — | — |
| AN-07 | important | Share click is tracked |  |  |  |  | pending | — | — | — |
| AN-09 | important | Error logging is installed |  |  |  |  | pending | — | — | — |
| AN-10 | important | Production failures are visible quickly |  |  |  |  | pending | — | — | — |
| AN-08 | normal | QR usage has a measurable destination URL |  |  |  |  | pending | — | — | — |

## 9) Trust and conversion checklist

| ID | Severity | Check | PASS | FAIL | BLOCKED | N/A | Status | Owner | Notes | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-12 | critical | The page feels safe enough for a first-time donor to complete payment |  |  |  |  | pending | — | — | — |
| TC-01 | important | The first screen explains what the money is for |  |  |  |  | pending | — | — | — |
| TC-02 | important | The first donate CTA is visible immediately |  |  |  |  | pending | — | — | — |
| TC-03 | important | Donation presets feel practical and believable |  |  |  |  | pending | — | — | — |
| TC-04 | important | Trust signals are present near checkout |  |  |  |  | pending | — | — | — |
| TC-05 | important | Sponsor value is clear |  |  |  |  | pending | — | — | — |
| TC-06 | important | The page feels credible to families and sponsors |  |  |  |  | pending | — | — | — |
| TC-07 | important | Refund / support path is easy to find |  |  |  |  | pending | — | — | — |
| TC-08 | important | Footer contact path is real |  |  |  |  | pending | — | — | — |
| TC-09 | important | No section feels like internal demoware |  |  |  |  | pending | — | — | — |
| TC-10 | important | No overly dense copy blocks create scroll fatigue |  |  |  |  | pending | — | — | — |
| TC-11 | normal | The page holds up visually in grayscale |  |  |  |  | pending | — | — | — |

## Final signoff

| Function | Owner |
| --- | --- |
| engineering | — |
| product | — |
| payments | — |
| qa | — |
| ops | — |

**Final go decision:** —

**Final go note:** —

**Final go at:** —
