#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from datetime import datetime, timezone
from pathlib import Path
import sys

MARKER_START = "/* FF_LAUNCH_FORTUNE_POLISH_V1_START */"
MARKER_END = "/* FF_LAUNCH_FORTUNE_POLISH_V1_END */"


RUNBOOK_MD = """# FutureFunded — Launch Day Runbook

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
"""


CSS_POLISH = f"""{MARKER_START}
@layer ff.overrides {{
  .ff-root,
  :root {{
    --ff-launch-bg: #f5f8fc;
    --ff-launch-bg-soft: #eef3f9;
    --ff-launch-surface: rgba(255, 255, 255, 0.9);
    --ff-launch-surface-strong: rgba(255, 255, 255, 0.96);
    --ff-launch-border: rgba(15, 23, 42, 0.08);
    --ff-launch-border-strong: rgba(15, 23, 42, 0.14);
    --ff-launch-text: #0f172a;
    --ff-launch-text-strong: #091224;
    --ff-launch-text-muted: #4c5b73;
    --ff-launch-text-soft: #64748b;
    --ff-launch-blue: #0f5fe8;
    --ff-launch-blue-strong: #0849b8;
    --ff-launch-blue-soft: rgba(15, 95, 232, 0.12);
    --ff-launch-shadow-sm: 0 10px 24px rgba(15, 23, 42, 0.06);
    --ff-launch-shadow-md: 0 18px 40px rgba(15, 23, 42, 0.08);
    --ff-launch-shadow-lg: 0 26px 60px rgba(15, 23, 42, 0.11);
    --ff-launch-radius-xl: 1.5rem;
    --ff-launch-radius-lg: 1.125rem;
    --ff-launch-reading: 70ch;
  }}

  html {{
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    hanging-punctuation: first last;
  }}

  body,
  .ff-body,
  .ff-root,
  .ff-shell {{
    color: var(--ff-launch-text);
    background:
      radial-gradient(1200px 600px at 50% -10%, rgba(15, 95, 232, 0.08), transparent 60%),
      linear-gradient(180deg, var(--ff-launch-bg) 0%, #f8fbff 100%);
  }}

  .ff-shellBg {{
    background:
      radial-gradient(900px 440px at 20% 0%, rgba(15, 95, 232, 0.07), transparent 60%),
      radial-gradient(760px 360px at 100% 0%, rgba(59, 130, 246, 0.05), transparent 55%);
    opacity: 1;
  }}

  .ff-body,
  .ff-body p,
  .ff-body li,
  .ff-body dd,
  .ff-body dt,
  .ff-body label,
  .ff-body small {{
    color: var(--ff-launch-text-muted);
  }}

  .ff-body strong,
  .ff-body b,
  .ff-body h1,
  .ff-body h2,
  .ff-body h3,
  .ff-body h4,
  .ff-body h5,
  .ff-body h6,
  .ff-hero h1,
  .ff-story h2,
  .ff-sponsors h2,
  .ff-teams h2,
  .ff-impact h2,
  .ff-faq h2,
  .ff-section h2 {{
    color: var(--ff-launch-text-strong);
    letter-spacing: -0.035em;
    text-wrap: balance;
  }}

  .ff-body h1,
  .ff-hero h1 {{
    font-weight: 800;
    line-height: 0.96;
    max-width: 10ch;
  }}

  .ff-body h2,
  .ff-section h2 {{
    font-weight: 760;
    line-height: 1.04;
    font-size: clamp(1.7rem, 1.2rem + 1.7vw, 2.6rem);
    margin-bottom: 0.5rem;
  }}

  .ff-body h3 {{
    font-weight: 720;
    line-height: 1.12;
    font-size: clamp(1.05rem, 0.95rem + 0.45vw, 1.32rem);
  }}

  .ff-body p,
  .ff-body li {{
    line-height: 1.62;
  }}

  .ff-body a {{
    text-underline-offset: 0.16em;
    text-decoration-thickness: 0.08em;
  }}

  .ff-body :focus-visible {{
    outline: 3px solid rgba(15, 95, 232, 0.45);
    outline-offset: 2px;
    box-shadow: 0 0 0 6px rgba(15, 95, 232, 0.12);
  }}

  .ff-chrome,
  .ff-topbar,
  .ff-topbar__capsule--flagship,
  .ff-heroPanel--flagship,
  .ff-card,
  .ff-story,
  .ff-sponsors,
  .ff-teams,
  .ff-impact,
  .ff-faqItem,
  .ff-callout,
  .ff-callout--flagship,
  .ff-drawer__block,
  .ff-teamCard--flagship,
  .ff-sponsorCell,
  .ff-checkoutShell,
  .ff-checkoutShell--flagship,
  .ff-checkoutShell--layout,
  .ff-checkoutBody,
  .ff-modal__panel,
  .ff-sheet__panel,
  .ff-sheet__viewport,
  .ff-sheet__scroll,
  .ff-paymentMount--flagship,
  .ff-paypalMount--flagship,
  .ff-storyPoster__play,
  .ff-disclosure--flagship {{
    background: var(--ff-launch-surface);
    border: 1px solid var(--ff-launch-border);
    box-shadow: var(--ff-launch-shadow-sm);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
  }}

  .ff-heroPanel--flagship,
  .ff-checkoutShell,
  .ff-checkoutShell--flagship,
  .ff-checkoutShell--layout,
  .ff-teamCard--flagship,
  .ff-sponsorCell,
  .ff-story,
  .ff-impactPick,
  .ff-impactTier--flagship,
  .ff-faqItem {{
    border-radius: var(--ff-launch-radius-xl);
  }}

  .ff-callout,
  .ff-callout--flagship,
  .ff-disclosure--flagship,
  .ff-drawer__block,
  .ff-topbar__capsule--flagship,
  .ff-storyPoster__play {{
    border-radius: var(--ff-launch-radius-lg);
  }}

  .ff-topbar,
  .ff-chrome {{
    background: rgba(255, 255, 255, 0.82);
    border-color: rgba(15, 23, 42, 0.06);
    box-shadow: 0 8px 30px rgba(15, 23, 42, 0.05);
    backdrop-filter: blur(18px) saturate(145%);
    -webkit-backdrop-filter: blur(18px) saturate(145%);
  }}

  .ff-topbar *,
  .ff-chrome *,
  .ff-hero *,
  .ff-story *,
  .ff-impact *,
  .ff-sponsors *,
  .ff-teams *,
  #checkout * {{
    text-wrap: pretty;
  }}

  .ff-section,
  [id="story"],
  [id="impact"],
  [id="teams"],
  [id="faq"],
  [id="sponsors"] {{
    scroll-margin-top: 6rem;
  }}

  .ff-hero,
  .ff-story,
  .ff-sponsors,
  .ff-impact,
  .ff-teams,
  .ff-faq,
  .ff-footer {{
    position: relative;
  }}

  .ff-heroPanel--flagship,
  .ff-checkoutShell,
  .ff-teamCard--flagship,
  .ff-sponsorCell {{
    overflow: clip;
  }}

  .ff-teamCard--flagship,
  .ff-sponsorCell,
  .ff-impactPick,
  .ff-impactTier--flagship,
  .ff-faqItem,
  .ff-storyPoster__play {{
    transition:
      transform 180ms ease,
      box-shadow 180ms ease,
      border-color 180ms ease,
      background-color 180ms ease;
  }}

  .ff-teamCard--flagship:hover,
  .ff-sponsorCell:hover,
  .ff-impactPick:hover,
  .ff-impactTier--flagship:hover,
  .ff-faqItem:hover {{
    transform: translateY(-2px);
    border-color: var(--ff-launch-border-strong);
    box-shadow: var(--ff-launch-shadow-md);
  }}

  .ff-body .ff-btn,
  .ff-body button,
  .ff-body [type="button"],
  .ff-body [type="submit"],
  .ff-body [role="button"] {{
    font-weight: 700;
    letter-spacing: -0.015em;
    border-radius: 999px;
  }}

  .ff-btn,
  .ff-navPill,
  .ff-tabs__item,
  .ff-storyPoster__play {{
    box-shadow:
      0 10px 24px rgba(15, 95, 232, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }}

  .ff-btn:hover,
  .ff-navPill:hover,
  .ff-tabs__item:hover,
  .ff-storyPoster__play:hover {{
    transform: translateY(-1px);
  }}

  .ff-body input,
  .ff-body select,
  .ff-body textarea {{
    background: rgba(255, 255, 255, 0.98);
    color: var(--ff-launch-text);
    border: 1px solid rgba(15, 23, 42, 0.12);
    box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
  }}

  .ff-body input::placeholder,
  .ff-body textarea::placeholder {{
    color: var(--ff-launch-text-soft);
  }}

  .ff-progress,
  .ff-progress--anchor,
  [role="progressbar"] {{
    border-radius: 999px;
  }}

  .ff-body .ff-sep,
  .ff-body .ff-topbarGoal__sep {{
    opacity: 0.5;
  }}

  .ff-story p,
  .ff-impact p,
  .ff-sponsors p,
  .ff-teams p,
  .ff-faqItem p {{
    max-width: var(--ff-launch-reading);
  }}

  .ff-footer,
  .ff-footerBrand--flagship,
  .ff-footerGrid--flagship,
  .ff-footerGrid--compact,
  .ff-footerTray--compact {{
    color: #42506a;
  }}

  .ff-footer a {{
    color: #15356c;
  }}

  .ff-body .ff-skip,
  .ff-body .ff-skiplink {{
    border-radius: 999px;
    box-shadow: var(--ff-launch-shadow-sm);
  }}

  @media (max-width: 47.99rem) {{
    .ff-body h1,
    .ff-hero h1 {{
      line-height: 0.99;
      max-width: 12ch;
    }}

    .ff-heroPanel--flagship,
    .ff-checkoutShell,
    .ff-teamCard--flagship,
    .ff-sponsorCell,
    .ff-impactPick,
    .ff-impactTier--flagship,
    .ff-faqItem {{
      border-radius: 1.2rem;
    }}
  }}

  @media (min-width: 64rem) {{
    .ff-heroPanel--flagship,
    .ff-story,
    .ff-sponsors,
    .ff-impact,
    .ff-teams,
    .ff-checkoutShell {{
      box-shadow: var(--ff-launch-shadow-lg);
    }}

    .ff-body h1,
    .ff-hero h1 {{
      max-width: 9ch;
    }}
  }}
}}
{MARKER_END}
"""


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def backup(path: Path) -> Path:
    backup_path = path.with_name(f"{path.name}.bak-{timestamp()}")
    shutil.copy2(path, backup_path)
    return backup_path


def upsert_marked_block(original: str, new_block: str) -> str:
    start_idx = original.find(MARKER_START)
    end_idx = original.find(MARKER_END)

    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        end_idx += len(MARKER_END)
        before = original[:start_idx].rstrip()
        after = original[end_idx:].lstrip()
        merged = before + "\n\n" + new_block.strip() + "\n"
        if after:
            merged += "\n" + after
        return merged

    text = original.rstrip() + "\n\n" + new_block.strip() + "\n"
    return text


def write_runbook(root: Path) -> Path:
    runbook_path = root / "docs" / "launch" / "ff_launch_war_room.md"
    runbook_path.parent.mkdir(parents=True, exist_ok=True)

    if runbook_path.exists():
        backup(runbook_path)

    runbook_path.write_text(RUNBOOK_MD, encoding="utf-8")
    return runbook_path


def patch_css(root: Path) -> Path:
    css_path = root / "app" / "static" / "css" / "ff.css"
    if not css_path.exists():
        raise FileNotFoundError(f"CSS file not found: {css_path}")

    backup(css_path)
    original = css_path.read_text(encoding="utf-8")
    patched = upsert_marked_block(original, CSS_POLISH)
    css_path.write_text(patched, encoding="utf-8")
    return css_path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create launch-day runbook and apply safe Fortune-500 polish layer to ff.css."
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Project root directory. Defaults to current directory.",
    )
    parser.add_argument(
        "--runbook-only",
        action="store_true",
        help="Write only the launch runbook.",
    )
    parser.add_argument(
        "--css-only",
        action="store_true",
        help="Patch only the CSS file.",
    )
    args = parser.parse_args()

    if args.runbook_only and args.css_only:
        print("Choose only one of --runbook-only or --css-only.")
        return 2

    root = Path(args.root).resolve()
    if not root.exists():
        print(f"Root does not exist: {root}")
        return 2

    wrote: list[Path] = []

    try:
        if not args.css_only:
            wrote.append(write_runbook(root))

        if not args.runbook_only:
            wrote.append(patch_css(root))

    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1

    print("Done.")
    for item in wrote:
        print(f" - {item}")

    print("\\nNext recommended commands:")
    if not args.runbook_only:
        print(" - python tools/ff_no_slashsemi_gate.py")
        print(" - npm run qa:full")
        print(" - PLAYWRIGHT_BASE_URL=https://getfuturefunded.com npm run pw:production")
    return 0


if __name__ == "__main__":
    sys.exit(main())
