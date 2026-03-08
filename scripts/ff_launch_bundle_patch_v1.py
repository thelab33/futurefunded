#!/usr/bin/env python3
"""
FutureFunded Launch Bundle Patch V1

Adds:
• zero-state fundraising UX
• sponsor wall product copy
• team image fallback state
• CSS polish bundle
• JS runtime helpers

Safe behavior:
• creates timestamped backups
• only patches if original anchors exist
• fails loudly if structure changed
"""

from pathlib import Path
import time
import sys

ROOT = Path(".")
INDEX = ROOT / "app/templates/index.html"
CSS   = ROOT / "app/static/css/ff.css"
JS    = ROOT / "app/static/js/ff-app.js"

# ------------------------------------------------------------------
# Validate files exist
# ------------------------------------------------------------------

for p in (INDEX, CSS, JS):
    if not p.exists():
        sys.exit(f"❌ Missing required file: {p}")

ts = time.strftime("%Y%m%d-%H%M%S")

def backup(path: Path) -> Path:
    bak = path.with_suffix(path.suffix + f".bak-launch-bundle-{ts}")
    bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return bak

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        sys.exit(f"❌ Could not safely patch: {label}")
    return text.replace(old, new, 1)

# ------------------------------------------------------------------
# Backup files
# ------------------------------------------------------------------

index_bak = backup(INDEX)
css_bak   = backup(CSS)
js_bak    = backup(JS)

index = INDEX.read_text(encoding="utf-8")
css   = CSS.read_text(encoding="utf-8")
js    = JS.read_text(encoding="utf-8")

# ------------------------------------------------------------------
# INDEX PATCHES
# ------------------------------------------------------------------

progress_anchor_old = """
<div class="ff-row ff-row--between ff-ais ff-wrap ff-gap-2 ff-mt-2">
<p class="ff-help ff-muted ff-m-0">Progress</p>
<p class="ff-help ff-num ff-m-0" data-ff-percent="">{{ _pct_i }}%</p>
</div>
"""

progress_anchor_new = """
<div class="ff-row ff-row--between ff-ais ff-wrap ff-gap-2 ff-mt-2">
<p class="ff-help ff-muted ff-m-0">Progress</p>
<p class="ff-help ff-num ff-m-0" data-ff-percent="">{{ _pct_i }}%</p>
</div>

{% set _ff_launch_empty_totals = (_goal_effective|float <= 0 and _raised_effective|float <= 0) %}
{% set _remaining_to_goal = ((_goal_effective - _raised_effective) if (_goal_effective|float > _raised_effective|float) else 0) %}

{% if _ff_launch_empty_totals %}
<div class="ff-launchNotice" role="status" aria-live="polite" aria-label="Organizer update pending">
<p class="ff-launchNotice__title ff-m-0">Organizer update pending</p>
<p class="ff-launchNotice__text ff-help ff-mt-1 ff-mb-0">
This page is live and ready to accept support. Verified totals and the season goal will appear as soon as the organizer publishes them.
</p>
</div>
{% else %}
<div class="ff-progressCompact__pulse" aria-label="Goal tracking highlights">

<article class="ff-progressMini ff-progressMini--remaining">
<p class="ff-progressMini__label ff-m-0">Still to goal</p>
<p class="ff-progressMini__value ff-num ff-mt-1 ff-mb-0">{{ money(_remaining_to_goal) }}</p>
<p class="ff-progressMini__note ff-help ff-muted ff-mt-1 ff-mb-0">
What the program still needs to close the gap.
</p>
</article>

<article class="ff-progressMini">
<p class="ff-progressMini__label ff-m-0">Momentum move</p>
<p class="ff-progressMini__value ff-num ff-mt-1 ff-mb-0">$250</p>
<p class="ff-progressMini__note ff-help ff-muted ff-mt-1 ff-mb-0">
A partner-size gift moves the board fast.
</p>
</article>

</div>
{% endif %}
"""

index = replace_once(index, progress_anchor_old, progress_anchor_new, "progress block")

# ------------------------------------------------------------------
# Sponsor copy
# ------------------------------------------------------------------

sponsor_empty_old = """
<p class="ff-help ff-muted ff-m-0">
Sponsors appear here after confirmation.
Want to be the first?
<a class="ff-link" href="#sponsor-interest" aria-controls="sponsor-interest" data-ff-open-sponsor="">Become a sponsor</a>.
</p>
"""

sponsor_empty_new = """
<p class="ff-help ff-muted ff-m-0">
This wall becomes visible social proof after the first confirmed sponsor.
<a class="ff-link" href="#sponsor-interest" aria-controls="sponsor-interest" data-ff-open-sponsor="">Claim the founding spot</a>.
</p>
"""

index = replace_once(index, sponsor_empty_old, sponsor_empty_new, "sponsor copy")

# ------------------------------------------------------------------
# Team image wrapper
# ------------------------------------------------------------------

team_media_old = """
<figure class="ff-teamCard__media">
"""

team_media_new = """
{% set _team_media = (t.photo|default(_fallback_team_photo, true))|string|trim %}
<figure class="ff-teamCard__media{% if not _team_media %} is-media-missing{% endif %}"
{% if not _team_media %}data-ff-fallback-label="{{ tname|e }}"{% endif %}>
"""

index = replace_once(index, team_media_old, team_media_new, "team media")

INDEX.write_text(index, encoding="utf-8")

# ------------------------------------------------------------------
# CSS PATCH
# ------------------------------------------------------------------

marker = "FF_LAUNCH_BUNDLE_PATCH_V1"

if marker not in css:

    css_patch = """
@layer ff.overrides {

/* FF_LAUNCH_BUNDLE_PATCH_V1 */

.ff-launchNotice{
margin-top:1rem;
padding:0.95rem 1rem;
border-radius:var(--ff-r-3);
border:1px solid rgba(14,165,233,.18);
box-shadow:var(--ff-shadow-1);
}

.ff-progressCompact__pulse{
display:grid;
grid-template-columns:repeat(2,minmax(0,1fr));
gap:.75rem;
margin-top:1rem;
}

.ff-progressMini{
padding:.9rem .95rem;
border-radius:var(--ff-r-3);
border:1px solid var(--ff-border-subtle);
box-shadow:var(--ff-shadow-1);
}

.ff-teamCard__media{
position:relative;
min-height:12rem;
overflow:hidden;
border-radius:calc(var(--ff-r-3) - 2px);
border:1px solid var(--ff-border-subtle);
}

.ff-teamCard__img{
width:100%;
height:100%;
min-height:12rem;
object-fit:cover;
}

.ff-teamCard__media.is-media-missing > img{
opacity:0;
}

}

"""

    css = css.rstrip() + "\n" + css_patch + "\n"
    CSS.write_text(css, encoding="utf-8")

# ------------------------------------------------------------------
# JS PATCH
# ------------------------------------------------------------------

marker = "FF_LAUNCH_BUNDLE_PATCH_V1"

if marker not in js:

    js_patch = """
/* FF_LAUNCH_BUNDLE_PATCH_V1 */

(() => {

if(window.__FFLaunchBundlePatchV1)return;
window.__FFLaunchBundlePatchV1=true;

const q=(s,r=document)=>r.querySelector(s)
const qa=(s,r=document)=>Array.from(r.querySelectorAll(s))

const parseMoney=(v)=>{
const n=Number(String(v||'').replace(/[^0-9.\\-]/g,''))
return Number.isFinite(n)?n:0
}

function syncZeroTotals(){

const goal=q('[data-ff-goal]')
const raised=q('[data-ff-raised]')

if(!goal||!raised)return

const g=parseMoney(goal.textContent)
const r=parseMoney(raised.textContent)

document.body.classList.toggle('ff-has-empty-totals',g<=0&&r<=0)

}

function bindImageFallbacks(){

qa('.ff-teamCard__img').forEach(img=>{

if(!(img instanceof HTMLImageElement))return

img.addEventListener('error',()=>{
const media=img.closest('.ff-teamCard__media')
if(!media)return
media.classList.add('is-media-missing')
})

})

}

function run(){
syncZeroTotals()
bindImageFallbacks()
}

if(document.readyState==="loading"){
document.addEventListener("DOMContentLoaded",run,{once:true})
}else{
run()
}

window.addEventListener("load",run)

})()
"""

    js = js.rstrip() + "\n" + js_patch + "\n"
    JS.write_text(js, encoding="utf-8")

print("✅ Launch bundle patch applied")
print("Backup index:", index_bak.name)
print("Backup css  :", css_bak.name)
print("Backup js   :", js_bak.name)

