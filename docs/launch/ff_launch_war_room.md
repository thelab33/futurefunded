# FutureFunded — Launch Day Runbook

**Owner:** Angel  
**Product:** FutureFunded  
**Primary URL:** https://getfuturefunded.com  
**Runbook Version:** 1.0  
**Date:** __________  
**Launch Decision:** [ ] NO-GO  [ ] SOFT LAUNCH  [ ] GO LIVE

---

## 1) Release snapshot

### Automated engineering gates
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
- [x] `pw:production` local
- [x] `pw:production` public

### Evidence
- [x] `npm run qa:full` passed
- [x] launch-readiness Playwright test passed
- [x] checkout open/close path verified in automation
- [x] production homepage boot verified in automation

### Release hygiene
- [ ] working tree clean
- [ ] release commit created
- [ ] rollback point tagged
- [ ] production env reviewed one last time

---

## 2) Hard stop / no-go rules

If **any** item below fails, launch result is **NO-GO**:

- [ ] homepage returns HTTP 200
- [ ] core CSS loads
- [ ] core JS loads
- [ ] checkout opens
- [ ] no fatal console/runtime errors
- [ ] one real payment completes successfully
- [ ] receipt/confirmation is received
- [ ] payment dashboard reflects the transaction
- [ ] support / contact path is visible and real

---

## 3) Live donation checklist

### Before payment
- [ ] live Stripe publishable key confirmed
- [ ] live Stripe secret key confirmed
- [ ] live PayPal credentials confirmed
- [ ] webhook endpoints configured
- [ ] webhook secrets configured
- [ ] no test keys visible in rendered source
- [ ] fundraiser goal is correct
- [ ] organization/team name is correct
- [ ] amount presets make sense
- [ ] custom amount field works
- [ ] `team_id` hidden input exists and posts correctly
- [ ] `player_id` path works if used

### Run one real transaction
- [ ] open checkout from hero CTA
- [ ] preset amount path tested
- [ ] custom amount path tested
- [ ] submit real payment
- [ ] success state visible
- [ ] cancel path behaves cleanly
- [ ] failure path behaves cleanly

### After payment
- [ ] confirmation UI visible
- [ ] receipt email received
- [ ] Stripe/PayPal dashboard event visible
- [ ] internal totals reflect the update path
- [ ] donor sees a believable, polished finish state

**Transaction notes:**  
__________________________________________________  
__________________________________________________

---

## 4) QR / share / link verification

### QR
- [ ] QR code opens the live production URL
- [ ] QR is scannable from a phone in normal room light
- [ ] QR lands on a healthy page
- [ ] mobile page is readable on first load

### Share
- [ ] share button uses the correct URL
- [ ] share title is correct
- [ ] share text is correct
- [ ] OG/social preview is acceptable
- [ ] iMessage preview looks clean
- [ ] SMS preview looks clean

### Canonical / routing
- [ ] canonical domain is intentional
- [ ] `www` vs non-`www` behavior is intentional
- [ ] no broken redirects

**Notes:**  
__________________________________________________  
__________________________________________________

---

## 5) Mobile verification

### Devices
- [ ] iPhone Safari
- [ ] Android Chrome
- [ ] one smaller viewport
- [ ] one larger modern viewport

### Checks
- [ ] no horizontal scroll
- [ ] hero headline wraps cleanly
- [ ] CTA visible above the fold
- [ ] topbar/sticky UI does not cover content
- [ ] checkout usable with keyboard open
- [ ] safe-area spacing acceptable
- [ ] cards remain legible
- [ ] sponsor blocks remain legible
- [ ] FAQ remains readable
- [ ] footer remains usable
- [ ] contrast is strong in bright conditions

---

## 6) Accessibility sanity pass

- [ ] keyboard-only navigation works
- [ ] skip links work
- [ ] focus ring visible
- [ ] focus returns after modal/sheet close
- [ ] buttons vs links are sensible
- [ ] important images have correct alt text
- [ ] decorative imagery is not noisy to assistive tech
- [ ] forms have labels and sensible errors
- [ ] no surprise autoplay audio
- [ ] reduced-motion experience is acceptable

---

## 7) Content / trust / accuracy

- [ ] logo is final and crisp
- [ ] team/program name is final
- [ ] campaign title is final
- [ ] copy is typo-checked
- [ ] no lorem ipsum
- [ ] no preview/demo residue
- [ ] no fake content remains
- [ ] support email is correct
- [ ] terms link is real
- [ ] privacy link is real
- [ ] refund/support path is real
- [ ] sponsor tiers are accurate
- [ ] goal / raised values are correct

---

## 8) Rollback notes

### Rollback trigger
Rollback immediately if any of the following happens:
- homepage stops serving correctly
- checkout fails for real donors
- receipts fail
- console/runtime errors become user-visible
- payment provider config is wrong
- donor trust is compromised by broken content

### Rollback plan
- [ ] previous release/tag identified
- [ ] deployment rollback command/path known
- [ ] old env values available if needed
- [ ] cache/CDN purge plan known
- [ ] post-rollback smoke check defined

**Rollback tag / commit:** ________________________  
**Rollback command/path:** ________________________  
**Owner:** ________________________

---

## 9) Launch status line

Use one of these in your notes / internal comms:

### NO-GO
> FutureFunded launch is paused. Core revenue, routing, or trust checks are not fully passing yet. Public release remains blocked until production issues are cleared.

### SOFT LAUNCH
> FutureFunded is approved for controlled release. Core automation is green and production boot is healthy. Limited live usage is allowed while final payment, mobile, and verification checks finish.

### GO LIVE
> FutureFunded is approved for public launch. Core QA, production readiness, payment verification, and trust checks are complete. Public distribution is now cleared.

**Selected status line:**  
__________________________________________________

---

## 10) Final decision

- [ ] NO-GO
- [ ] SOFT LAUNCH
- [ ] GO LIVE

**Approved by:** ________________________  
**Time:** ________________________  
**Final notes:**  
__________________________________________________  
__________________________________________________  
__________________________________________________
