# FutureFunded — Launch War Room

Owner: Angel  
Environment: Production  
Primary URL: https://getfuturefunded.com  
Date: __________  
Decision: [ ] NO-GO  [ ] SOFT LAUNCH  [ ] GO LIVE

---

## A. Release snapshot

### Local engineering gates
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

### Evidence
- [x] `npm run qa:full` passed locally
- [x] hidden `team_id` input restored
- [x] optional local `/api/activity-feed` 404 handled in QA guards
- [x] asset trace passed
- [x] UX gate passed
- [x] contracts passed

### Git / release
- [ ] working tree clean
- [ ] release commit created
- [ ] rollback point tagged
- [ ] production env reviewed

---

## B. Production domain health

### Required
- [ ] `https://getfuturefunded.com` returns 200
- [ ] homepage renders correctly
- [ ] main CSS loads
- [ ] main JS loads
- [ ] favicon / manifest / primary static assets load
- [ ] no 530 / 5xx on root or core assets
- [ ] HTTPS valid
- [ ] canonical domain behavior intentional

### Evidence
- Notes: ________________________________________
- Screenshot captured: [ ]
- Console checked: [ ]

### Decision rule
If any item in this section fails, result = **NO-GO**.

---

## C. Payments

### Stripe / PayPal config
- [ ] Stripe publishable key is live
- [ ] Stripe secret key is live
- [ ] PayPal credentials are live
- [ ] webhook endpoints configured
- [ ] webhook signing secrets correct
- [ ] test/dev credentials not exposed in rendered source

### Checkout behavior
- [ ] hero donate opens checkout
- [ ] sticky/nav donate opens checkout
- [ ] team donate opens checkout
- [ ] preset amount selection works
- [ ] custom amount works
- [ ] `team_id` posts correctly
- [ ] `player_id` posts correctly if used
- [ ] close / reopen checkout works
- [ ] keyboard focus remains sane
- [ ] mobile sheet usable

### Real payment verification
- [ ] one real production payment completed
- [ ] success state shown
- [ ] cancel path shown cleanly
- [ ] failure path shown cleanly
- [ ] totals update correctly
- [ ] receipt / confirmation email received
- [ ] Stripe dashboard event confirmed
- [ ] PayPal callback behavior confirmed if applicable

### Decision rule
If real payment is not verified, result cannot be **GO LIVE**.

---

## D. Content / trust / accuracy

- [ ] organization name final everywhere
- [ ] campaign title final
- [ ] logo correct
- [ ] fundraiser goal correct
- [ ] raised total source correct
- [ ] sponsor tiers correct
- [ ] contact email correct
- [ ] terms link real
- [ ] privacy link real
- [ ] refund/support path real
- [ ] no placeholder copy
- [ ] no preview/demo residue
- [ ] no fake names/images left behind

Reviewer initials: __________

---

## E. Mobile and UX

### Devices
- [ ] iPhone Safari
- [ ] Android Chrome
- [ ] small viewport
- [ ] large viewport

### Checks
- [ ] no horizontal scroll
- [ ] hero wraps cleanly
- [ ] CTAs visible immediately
- [ ] sticky UI does not cover content
- [ ] checkout usable with keyboard open
- [ ] safe-area spacing acceptable
- [ ] QR code readable
- [ ] team cards legible
- [ ] sponsor blocks legible
- [ ] video modal behaves correctly

---

## F. Accessibility sanity pass

- [ ] keyboard-only navigation works
- [ ] skip links work
- [ ] focus ring visible
- [ ] focus returns after modal close
- [ ] buttons vs links sensible
- [ ] progress UI has labels
- [ ] inputs have labels
- [ ] images have correct alt behavior
- [ ] reduced motion feels acceptable
- [ ] no surprise autoplay audio

---

## G. Analytics / visibility

- [ ] analytics installed
- [ ] page view recorded
- [ ] donate CTA tracked
- [ ] checkout open tracked
- [ ] donation success tracked
- [ ] sponsor inquiry tracked
- [ ] share action tracked
- [ ] error logging visible
- [ ] owner can see failures quickly

---

## H. Manual production notes

### Console / network
- [ ] no fatal console errors
- [ ] no broken websocket behavior
- [ ] no unexpected 4xx/5xx on critical resources

Notes:
__________________________________________________
__________________________________________________
__________________________________________________

---

## I. Launch decision

### NO-GO
Use if:
- production domain broken
- core assets broken
- fatal console/runtime errors
- payment unverified
- receipts/webhooks broken

### SOFT LAUNCH
Use if:
- red items cleared
- one real payment verified
- but device / analytics / manual pass still incomplete

### GO LIVE
Use only if:
- production domain healthy
- assets healthy
- payment verified
- receipt verified
- webhooks verified
- mobile pass done
- no fatal console/runtime errors
- trust/content review complete

Final decision:
- [ ] NO-GO
- [ ] SOFT LAUNCH
- [ ] GO LIVE

Approved by: __________
Time: __________
Notes:
__________________________________________________
__________________________________________________
