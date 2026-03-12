# FutureFunded — Launch Day Runbook

**Owner:** Angel  
**Product:** FutureFunded  
**Primary URL:** https://getfuturefunded.com  
**Runbook Version:** 1.2  
**Launch Decision:** [ ] NO-GO  [x] SOFT LAUNCH  [ ] GO LIVE

---

## 1) Launch state

Use this rule:

- **NO-GO** = core product, payment, routing, or trust is broken
- **SOFT LAUNCH** = engineering is green, production is healthy, but real-money, real-device, and final founder verification are still in progress
- **GO LIVE** = engineering, payment, support, share, mobile, and trust checks are complete

**Current recommended state:** **SOFT LAUNCH**

Reason:
- Engineering gates are green
- Production boot is healthy
- Asset/version checks are healthy
- A real payment + receipt + dashboard verification still need founder confirmation
- Real-device mobile and QR/share verification still need founder confirmation

---

## 2) Engineering gates

### Required automated gates
- [x] `audit:no-slashsemi`
- [x] `audit:layers`
- [x] `audit:dom`
- [x] `audit:hooks`
- [x] `lint:js`
- [x] `lint:css`
- [x] `lint:html`
- [x] `pw:smoke`
- [x] `pw:contracts`
- [x] `pw:flows`
- [x] `pw:integration`
- [x] `pw:ux`
- [x] `pw:assets`
- [x] `npm run qa:fast`
- [x] `npm run qa:full`
- [x] deploy sanity passed
- [x] live asset/version check passed

### Required evidence
- [x] checkout open/close path verified in automation
- [x] production homepage boot verified in automation
- [x] production contract tests verified
- [x] production asset trace verified
- [x] local launch-candidate path verified
- [x] public launch-candidate path verified

---

## 3) Release hygiene

These should be true before public announcement:

- [ ] working tree clean
- [x] release commit created
- [x] rollback tag created
- [ ] rollback command verified
- [ ] production environment reviewed one last time
- [ ] final founder sign-off completed

### Release references
- Release commit: `79747f7`
- Launch candidate tag: `v1.0.0-launch-candidate`

---

## 4) Hard stop / NO-GO rules

If any item below fails, do **not** publicly launch:

- [x] homepage returns HTTP 200
- [x] core CSS loads
- [x] core JS loads
- [x] checkout opens
- [x] no fatal runtime errors in core automation
- [ ] one real production payment completes successfully
- [ ] receipt / confirmation email is received
- [ ] payment dashboard reflects the transaction
- [ ] support / contact path is visible and real
- [ ] payment mode is confirmed as intentional and truthful

---

## 5) Payment truth gate

This section matters more than design polish.

### Environment + mode
- [ ] Stripe is confirmed in **live** mode
- [ ] Stripe publishable key is live
- [ ] Stripe secret key is live
- [ ] webhook endpoint is configured
- [ ] webhook secret is configured
- [ ] no test keys visible in rendered source
- [ ] PayPal is either intentionally disabled or fully configured
- [ ] page copy does not promise payment methods that are not active

### Functional payment checks
- [ ] fundraiser goal is correct
- [ ] organization/team name is correct
- [ ] amount presets make sense
- [ ] custom amount field works
- [x] `team_id` hidden input exists and posts correctly in tested flow
- [ ] `player_id` path works if used

---

## 6) Real donation gate

### Before payment
- [ ] hero CTA opens checkout
- [ ] preset amount path works
- [ ] custom amount path works
- [ ] cancel path behaves cleanly
- [ ] failure path behaves cleanly

### Run one real transaction
- [ ] submit one real production payment
- [ ] success state becomes visible
- [ ] donor sees a believable, polished finish state

### After payment
- [ ] confirmation UI visible
- [ ] receipt email received
- [ ] Stripe / PayPal dashboard event visible
- [ ] internal totals reflect the intended update path
- [ ] donor trust finish state looks calm and premium

### Transaction notes
__________________________________________________  
__________________________________________________

---

## 7) Public promise check

The page must not promise what operations cannot support.

- [ ] if PayPal is disabled, copy does not imply PayPal is active
- [ ] if Stripe is the only live path, wording remains accurate
- [ ] support response expectation is realistic
- [ ] sponsor inquiry path goes somewhere monitored
- [ ] no “live totals” claims are misleading
- [ ] no “demo” or “preview” residue remains in visible UI

---

## 8) QR / share / routing verification

### QR
- [ ] QR opens the exact live production URL
- [ ] QR is scannable from a real phone
- [ ] QR lands on a healthy page
- [ ] mobile page is readable on first load

### Share
- [ ] share button uses the correct URL
- [ ] share title is correct
- [ ] share text is correct
- [ ] OG / social preview is acceptable
- [ ] iMessage preview looks clean
- [ ] SMS preview looks clean

### Canonical / routing
- [x] canonical domain is intentional
- [ ] `www` vs non-`www` behavior is intentional
- [x] no broken redirects detected in current production path

---

## 9) Mobile verification

### Devices
- [ ] iPhone Safari
- [ ] Android Chrome
- [ ] one smaller viewport
- [ ] one larger modern viewport

### Manual mobile checks
- [x] no horizontal scroll in automated UX checks
- [ ] hero headline wraps cleanly
- [ ] CTA visible above the fold
- [ ] sticky UI does not cover content
- [ ] checkout usable with keyboard open
- [ ] safe-area spacing acceptable
- [ ] cards remain legible
- [ ] sponsor blocks remain legible
- [ ] FAQ remains readable
- [ ] footer remains usable
- [ ] contrast feels strong in bright conditions

---

## 10) Accessibility sanity pass

- [x] keyboard-only navigation works in automated coverage paths
- [x] skip links work
- [x] focus ring visible
- [ ] focus returns after modal / sheet close
- [ ] buttons vs links are sensible everywhere
- [ ] important images have correct alt text
- [ ] decorative imagery stays quiet to assistive tech
- [ ] forms have labels and sensible errors
- [x] no surprise autoplay audio
- [ ] reduced-motion experience is acceptable

---

## 11) Content / trust / accuracy

- [ ] logo is final and crisp
- [ ] team / program name is final
- [ ] campaign title is final
- [ ] copy is typo-checked
- [ ] no lorem ipsum
- [ ] no fake content remains
- [ ] no preview / demo residue remains
- [ ] support email is correct
- [ ] terms link is real
- [ ] privacy link is real
- [ ] refund / support path is real
- [ ] sponsor tiers are accurate
- [ ] goal / raised values are correct

---

## 12) Founder final glance

This is the proud-sister test.

- [ ] homepage reviewed top-to-bottom on desktop
- [ ] homepage reviewed top-to-bottom on phone
- [ ] no obvious spacing, clipping, duplicate CTA, or broken icon
- [ ] sponsor section reads credibly to a local business owner
- [ ] checkout feels calm and trustworthy to a parent
- [ ] page feels safe to text to families right now

---

## 13) Support readiness

- [ ] support inbox checked
- [ ] support email tested
- [ ] who responds to donor issues is known
- [ ] refund / escalation path is known
- [ ] launch-day point person is identified

---

## 14) Rollback notes

### Rollback triggers
Rollback immediately if:
- homepage stops serving correctly
- checkout fails for real donors
- receipts fail
- runtime errors become user-visible
- payment config is wrong
- trust is compromised by broken content

### Rollback readiness
- [x] previous release / tag identified
- [ ] deployment rollback command verified
- [ ] old env values available if needed
- [ ] cache / CDN purge plan known
- [ ] post-rollback smoke check defined

### Rollback references
- Rollback tag / commit: `v1.0.0-launch-candidate` / `79747f7`
- Rollback command / path: ________________________
- Owner: Angel

---

## 15) GO LIVE rule

Only mark **GO LIVE** when all items below are true:

- [x] engineering gates are green
- [ ] Stripe mode is confirmed intentional
- [ ] one real payment succeeds
- [ ] receipt is received
- [ ] dashboard entry is visible
- [ ] one real-device phone pass is complete
- [ ] QR works from a real phone
- [ ] share preview is acceptable
- [ ] support path is verified
- [ ] founder final glance is complete

---

## 16) Status line

### NO-GO
> FutureFunded launch is paused. Core revenue, routing, or trust checks are not fully passing yet. Public release remains blocked until production issues are cleared.

### SOFT LAUNCH
> FutureFunded is approved for controlled release. Core automation is green, production boot is healthy, and launch-candidate checks are passing. Limited live usage is allowed while final payment, mobile, QR/share, and verification checks finish.

### GO LIVE
> FutureFunded is approved for public launch. Core QA, production readiness, payment verification, and trust checks are complete. Public distribution is now cleared.

**Selected status line:**  
FutureFunded is approved for controlled release. Core automation is green, production boot is healthy, and launch-candidate checks are passing. Limited live usage is allowed while final payment, mobile, QR/share, and verification checks finish.

---

## 17) Final decision

- [ ] NO-GO
- [x] SOFT LAUNCH
- [ ] GO LIVE

**Approved by:** Angel  
**Time:** ________________________  

### Final notes
Automation is green across local and public production readiness.  
Public go-live is pending:
- one real production donation
- receipt confirmation
- payment dashboard verification
- QR / share verification
- one real-device mobile pass
- payment-mode truth confirmation

Do not reopen broad styling or structure changes before these checks are done.

---

## 18) Immediate next actions

### Highest priority
- [ ] confirm Stripe mode is truly live
- [ ] run one real production donation
- [ ] confirm receipt email
- [ ] confirm payment provider dashboard entry
- [ ] scan QR from a real phone
- [ ] verify share preview
- [ ] complete one iPhone or Android pass
- [ ] verify support email

### When those pass
- [ ] mark **GO LIVE**
- [ ] update selected status line
- [ ] announce publicly
