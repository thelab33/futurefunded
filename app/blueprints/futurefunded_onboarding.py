from __future__ import annotations

import os
import re
from datetime import datetime, timedelta
from typing import Any

from flask import Blueprint, abort, current_app, jsonify, redirect, render_template, request, session, url_for

try:
    from app.extensions import db
except Exception:  # pragma: no cover
    from app import db  # type: ignore

from app.models.futurefunded_tenanting import OnboardingDraft, Tenant, TenantUser

bp = Blueprint("ff_onboarding", __name__)


def _utc_now() -> datetime:
    return datetime.utcnow()


def _iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.replace(microsecond=0).isoformat() + "Z"


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "futurefunded-draft"


def _clean_text(value: Any, fallback: str = "", limit: int = 180) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    if not text:
        text = fallback
    return text[:limit].strip()


def _clean_email(value: Any, fallback: str = "support@getfuturefunded.com") -> str:
    text = _clean_text(value, fallback=fallback, limit=180).lower()
    return text if "@" in text else fallback


def _clean_hex(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    return text.lower() if re.fullmatch(r"#[0-9a-fA-F]{6}", text) else fallback


def _coerce_goal(value: Any, fallback: int = 12000) -> int:
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        n = fallback
    return max(100, min(n, 1000000))


def _coerce_deadline(value: Any) -> str:
    text = str(value or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    return (datetime.utcnow() + timedelta(days=45)).strftime("%Y-%m-%d")


def _parse_presets(value: Any) -> list[int]:
    raw = str(value or "").strip()
    out: list[int] = []
    seen: set[int] = set()
    for part in raw.split(","):
        part = part.strip().replace("$", "")
        if not part:
            continue
        try:
            n = int(float(part))
        except ValueError:
            continue
        if 1 <= n <= 100000 and n not in seen:
            out.append(n)
            seen.add(n)
    return out[:8] or [25, 50, 100, 250]


def _access_code() -> str:
    return (
        str(current_app.config.get("FF_ONBOARDING_ACCESS_CODE") or "").strip()
        or str(os.getenv("FF_ONBOARDING_ACCESS_CODE") or "").strip()
        or "futurefunded-owner"
    )


def _admin_emails() -> set[str]:
    raw = (
        str(current_app.config.get("FF_ONBOARDING_ADMIN_EMAILS") or "").strip()
        or str(os.getenv("FF_ONBOARDING_ADMIN_EMAILS") or "").strip()
    )
    return {part.strip().lower() for part in raw.split(",") if "@" in part.strip()}


def _session_email() -> str:
    return str(session.get("ff_onboarding_email") or "").strip().lower()


def _is_authenticated() -> bool:
    return bool(session.get("ff_onboarding_auth")) and bool(_session_email())


def _is_admin() -> bool:
    email = _session_email()
    return bool(email) and email in _admin_emails()


def _login_url() -> str:
    next_url = request.full_path if request.query_string else request.path
    return url_for("ff_onboarding.login", next=next_url)


def _login_required_response():
    if request.path.startswith("/api/"):
        return jsonify({"ok": False, "error": "Authentication required.", "login_url": _login_url()}), 403
    return redirect(_login_url())


def _forbidden_json(message: str = "Forbidden."):
    return jsonify({"ok": False, "error": message, "login_url": _login_url()}), 403


def _next_tenant_slug(base_slug: str) -> str:
    slug = base_slug
    n = 2
    while Tenant.query.filter_by(slug=slug).first():
        slug = f"{base_slug}-{n}"
        n += 1
    return slug


def _next_draft_slug(base_slug: str) -> str:
    slug = base_slug
    n = 2
    while OnboardingDraft.query.filter_by(slug=slug).first():
        slug = f"{base_slug}-{n}"
        n += 1
    return slug


def _next_public_slug(base_slug: str) -> str:
    slug = base_slug
    n = 2
    while (
        OnboardingDraft.query.filter_by(public_slug=slug).first()
        or Tenant.query.filter_by(public_slug=slug).first()
    ):
        slug = f"{base_slug}-{n}"
        n += 1
    return slug


def _draft_payload(draft: OnboardingDraft) -> dict[str, Any]:
    payload = dict(draft.payload_json or {})
    payload.update({
        "version": draft.version,
        "source": draft.source,
        "created_at": _iso(draft.created_at),
        "updated_at": _iso(draft.updated_at),
        "published_at": _iso(draft.published_at),
        "status": draft.status,
        "slug": draft.slug,
        "public_slug": draft.public_slug,
        "owner_email": draft.owner_email,
        "org": {
            "type": draft.org_type,
            "name": draft.org_name,
            "logo_url": draft.logo_url or "",
        },
        "contact": {
            "name": draft.contact_name,
            "email": draft.contact_email,
        },
        "brand": {
            "primary": draft.brand_primary,
            "accent": draft.brand_accent,
        },
        "campaign": {
            "headline": draft.headline,
            "goal": draft.goal,
            "deadline": draft.deadline,
            "checkout": draft.checkout,
            "presets": payload.get("campaign", {}).get("presets", [25, 50, 100, 250]),
            "sponsor_tiers": payload.get("campaign", {}).get("sponsor_tiers", "Community / Partner / Champion / VIP"),
            "announcement": payload.get("campaign", {}).get("announcement", ""),
        },
    })
    return payload


def _public_url_for(draft: OnboardingDraft) -> str | None:
    if not draft.public_slug:
        return None
    return url_for("ff_onboarding.public_page", public_slug=draft.public_slug, _external=False)


def _can_manage_draft(draft: OnboardingDraft) -> bool:
    if _is_admin():
        return True
    return _is_authenticated() and _session_email() == _clean_email(draft.owner_email)


def _require_draft_access(draft: OnboardingDraft):
    if not _is_authenticated():
        return _login_required_response()
    if not _can_manage_draft(draft):
        if request.path.startswith("/api/"):
            return _forbidden_json("You do not have permission to manage this draft.")
        abort(403)
    return None


def _visible_drafts():
    if _is_admin():
        return OnboardingDraft.query.order_by(OnboardingDraft.created_at.desc()).all()
    return (
        OnboardingDraft.query
        .filter_by(owner_email=_session_email())
        .order_by(OnboardingDraft.created_at.desc())
        .all()
    )


def _draft_summary(draft: OnboardingDraft) -> dict[str, Any]:
    return {
        "slug": draft.slug,
        "status": draft.status,
        "public_slug": draft.public_slug,
        "created_at": _iso(draft.created_at),
        "updated_at": _iso(draft.updated_at),
        "published_at": _iso(draft.published_at),
        "org_name": draft.org_name,
        "org_type": draft.org_type,
        "contact_email": draft.contact_email,
        "owner_email": draft.owner_email,
        "draft_url": url_for("ff_onboarding.preview_draft", slug=draft.slug, _external=False),
        "json_url": url_for("ff_onboarding.get_draft_json", slug=draft.slug, _external=False),
        "public_url": _public_url_for(draft),
        "can_publish": draft.status != "published",
        "can_unpublish": draft.status == "published",
        "can_archive": draft.status != "archived",
    }


def _normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    org_type = _clean_text(payload.get("org_type"), "Youth team", 40)
    org_name = _clean_text(payload.get("org_name"), "FutureFunded Draft", 100)
    contact_name = _clean_text(payload.get("contact_name"), "Organizer", 100)
    contact_email = _clean_email(payload.get("contact_email"))
    brand_primary = _clean_hex(payload.get("brand_primary"), "#0ea5e9")
    brand_accent = _clean_hex(payload.get("brand_accent"), "#f97316")
    logo_url = _clean_text(payload.get("logo_url"), "", 500)
    headline = _clean_text(payload.get("headline"), "Fuel the season. Fund the future.", 140)
    goal = _coerce_goal(payload.get("goal"))
    deadline = _coerce_deadline(payload.get("deadline"))
    checkout = _clean_text(payload.get("checkout"), "Stripe + PayPal", 60)
    presets = _parse_presets(payload.get("presets"))
    sponsor_tiers = _clean_text(payload.get("sponsor_tiers"), "Community / Partner / Champion / VIP", 120)
    announcement = _clean_text(payload.get("announcement"), "", 180)

    owner_email = _session_email() or contact_email

    return {
        "version": 4,
        "source": "futurefunded_onboarding_wizard",
        "status": "draft",
        "public_slug": None,
        "owner_email": owner_email,
        "org": {
            "type": org_type,
            "name": org_name,
            "logo_url": logo_url,
        },
        "contact": {
            "name": contact_name,
            "email": contact_email,
        },
        "brand": {
            "primary": brand_primary,
            "accent": brand_accent,
        },
        "campaign": {
            "headline": headline,
            "goal": goal,
            "deadline": deadline,
            "checkout": checkout,
            "presets": presets,
            "sponsor_tiers": sponsor_tiers,
            "announcement": announcement,
        },
    }


def _context_from_draft(draft: OnboardingDraft, *, published: bool = False) -> dict[str, Any]:
    payload = _draft_payload(draft)

    org_name = draft.org_name
    org_type = draft.org_type
    contact_name = draft.contact_name
    contact_email = draft.contact_email
    primary = draft.brand_primary
    logo_url = draft.logo_url or ""
    headline = draft.headline
    goal = int(draft.goal)
    deadline = draft.deadline
    announcement = payload.get("campaign", {}).get("announcement", "")
    presets = payload.get("campaign", {}).get("presets", [25, 50, 100, 250])

    fallback_logo = url_for("static", filename="images/logo.webp")
    fallback_media = url_for("static", filename="images/connect-atx-team.jpg")
    org_logo = logo_url or fallback_logo
    media = logo_url or fallback_media
    deadline_iso = f"{deadline}T23:59:59-06:00"

    teams = [
        {
            "id": "alpha",
            "name": f"{org_name} Preview Team",
            "meta": "Configurable program card — replace with your real roster and photos.",
            "goal": goal,
            "raised": 0,
            "featured": True,
            "needs": True,
            "restricted": False,
            "photo": media,
            "ask": "Customize this with your actual team details."
        },
        {
            "id": "beta",
            "name": f"{org_name} Community",
            "meta": "Sponsors, donors, and families can rally here.",
            "goal": goal,
            "raised": 0,
            "featured": False,
            "needs": False,
            "restricted": False,
            "photo": media,
            "ask": "Add your second group, campus, or chapter."
        },
        {
            "id": "gamma",
            "name": f"{org_name} Next Group",
            "meta": "Preview structure for a multi-team rollout.",
            "goal": goal,
            "raised": 0,
            "featured": False,
            "needs": False,
            "restricted": False,
            "photo": media,
            "ask": "Expand this into a full program setup."
        },
    ]

    gallery = {
        "enabled": True,
        "items": [
            {"src": media, "alt": org_name, "caption": org_name},
            {"src": media, "alt": f"{org_name} preview", "caption": "Preview"},
            {"src": media, "alt": f"{org_name} brand", "caption": "Brand"},
        ]
    }

    return {
        "ff_data_mode": "live" if published else "preview",
        "ff_totals_verified": False,
        "theme": "light",
        "org_name": org_name,
        "campaign_name": org_name,
        "organizer_label": contact_name,
        "organizer_email": contact_email,
        "contact_email": contact_email,
        "support_email": contact_email,
        "campaign_headline": headline,
        "campaign_subhead": "Back the community behind",
        "campaign_tagline": (
            f"Launch a branded {org_type.lower()} fundraising page with secure checkout, "
            f"sponsor tiers, and one polished share link."
        ),
        "announcement_text": announcement,
        "proof_blurb": (
            f"This {'published' if published else 'draft'} page shows how {org_name} can launch "
            f"with premium branding, secure checkout, and sponsorship packages."
        ),
        "policy_blurb": (
            "Provisioned from the FutureFunded onboarding flow. Payment, legal, and organizer settings can be refined over time."
        ),
        "fundraiser_goal": goal,
        "goal": goal,
        "amount_raised": 0,
        "raised": 0,
        "fundraiser_deadline_iso": deadline_iso,
        "fundraiser_deadline_human": deadline,
        "theme_color": primary,
        "theme_color_light": primary,
        "theme_color_dark": "#0b0f17",
        "org_logo": org_logo,
        "currency": "USD",
        "FF_CFG": {
            "wizard_draft": not published,
            "provisioned_page": True,
            "draft_slug": draft.slug,
            "public_slug": draft.public_slug,
            "status": draft.status,
            "owner_email": draft.owner_email,
            "campaign": {
                "goal": goal,
                "presets": presets,
                "checkout": draft.checkout,
                "sponsor_tiers": payload.get("campaign", {}).get("sponsor_tiers", "Community / Partner / Champion / VIP"),
            },
        },
        "ff_teams": teams,
        "teams_list": teams,
        "gallery": gallery,
        "page_title": f"{org_name} • {'Live Page' if published else 'Draft Preview'} • FutureFunded",
        "page_description": f"{'Live' if published else 'Preview'} page for {org_name} generated from the FutureFunded onboarding flow.",
        "canonical_url": (
            url_for("ff_onboarding.public_page", public_slug=draft.public_slug, _external=True)
            if published and draft.public_slug
            else url_for("ff_onboarding.preview_draft", slug=draft.slug, _external=True)
        ),
    }


@bp.route("/ops/onboarding/login", methods=["GET", "POST"])
def login():
    if _is_authenticated():
        return redirect(request.args.get("next") or url_for("ff_onboarding.drafts_manager"))

    error = ""
    next_url = request.values.get("next") or request.args.get("next") or url_for("ff_onboarding.drafts_manager")

    if request.method == "POST":
        email = _clean_email(request.form.get("email"))
        code = str(request.form.get("code") or "").strip()

        if "@" not in email:
            error = "Enter a valid email."
        elif code != _access_code():
            error = "Access code is incorrect."
        else:
            session["ff_onboarding_auth"] = True
            session["ff_onboarding_email"] = email
            return redirect(next_url)

    return render_template("onboarding_login.html", error=error, next_url=next_url, session_email=_session_email())


@bp.post("/ops/onboarding/logout")
def logout():
    session.pop("ff_onboarding_auth", None)
    session.pop("ff_onboarding_email", None)
    return redirect(url_for("ff_onboarding.login"))


@bp.get("/api/onboarding/session")
def onboarding_session():
    return jsonify({
        "ok": True,
        "authenticated": _is_authenticated(),
        "email": _session_email() or None,
        "is_admin": _is_admin(),
    })


@bp.post("/api/onboarding/brief")
def create_brief():
    payload_in = request.get_json(silent=True) or {}
    if not isinstance(payload_in, dict):
        return jsonify({"ok": False, "error": "Expected JSON object payload."}), 400

    payload = _normalize_payload(payload_in)
    owner_email = payload["owner_email"]
    org = payload["org"]
    brand = payload["brand"]
    campaign = payload["campaign"]
    contact = payload["contact"]

    tenant_slug = _next_tenant_slug(_slugify(org["name"]))
    draft_slug = _next_draft_slug(_slugify(org["name"]))

    tenant = Tenant(
        slug=tenant_slug,
        name=org["name"],
        org_type=org["type"],
        owner_email=owner_email,
        status="draft",
        brand_primary=brand["primary"],
        brand_accent=brand["accent"],
        logo_url=org["logo_url"] or None,
    )
    db.session.add(tenant)
    db.session.flush()

    tenant_user = TenantUser(
        tenant_id=tenant.id,
        email=owner_email,
        role="owner",
        is_owner=True,
    )
    db.session.add(tenant_user)

    draft = OnboardingDraft(
        tenant_id=tenant.id,
        slug=draft_slug,
        owner_email=owner_email,
        source=payload["source"],
        version=payload["version"],
        status="draft",
        public_slug=None,
        org_name=org["name"],
        org_type=org["type"],
        contact_name=contact["name"],
        contact_email=contact["email"],
        headline=campaign["headline"],
        goal=campaign["goal"],
        deadline=campaign["deadline"],
        checkout=campaign["checkout"],
        brand_primary=brand["primary"],
        brand_accent=brand["accent"],
        logo_url=org["logo_url"] or None,
        payload_json=payload,
    )
    db.session.add(draft)
    db.session.commit()

    return jsonify({
        "ok": True,
        "slug": draft.slug,
        "draft": _draft_payload(draft),
        "draft_url": url_for("ff_onboarding.preview_draft", slug=draft.slug, _external=False),
        "json_url": url_for("ff_onboarding.get_draft_json", slug=draft.slug, _external=False),
        "public_url": None,
    }), 201


@bp.get("/ops/onboarding/drafts")
def drafts_manager():
    if not _is_authenticated():
        return _login_required_response()
    drafts = _visible_drafts()
    return render_template(
        "onboarding_drafts.html",
        drafts=drafts,
        draft_summaries=[_draft_summary(d) for d in drafts],
        owner_email=_session_email(),
        is_admin=_is_admin(),
    )


@bp.get("/api/onboarding/drafts")
def list_drafts():
    if not _is_authenticated():
        return _login_required_response()
    drafts = _visible_drafts()
    return jsonify({
        "ok": True,
        "count": len(drafts),
        "items": [_draft_summary(d) for d in drafts],
    })


@bp.get("/api/onboarding/drafts/<slug>.json")
def get_draft_json(slug: str):
    draft = OnboardingDraft.query.filter_by(slug=slug).first_or_404()
    denial = _require_draft_access(draft)
    if denial is not None:
        return denial
    return current_app.response_class(
        response=current_app.json.dumps(_draft_payload(draft), indent=2),
        mimetype="application/json",
    )


@bp.post("/api/onboarding/drafts/<slug>/publish")
def publish_draft(slug: str):
    draft = OnboardingDraft.query.filter_by(slug=slug).first_or_404()
    denial = _require_draft_access(draft)
    if denial is not None:
        return denial

    if draft.status != "published":
        public_slug = draft.public_slug or _next_public_slug(_slugify(draft.org_name or draft.slug))
        now = _utc_now()

        draft.status = "published"
        draft.public_slug = public_slug
        draft.published_at = draft.published_at or now
        draft.updated_at = now

        draft.tenant.status = "published"
        draft.tenant.public_slug = public_slug
        draft.tenant.published_at = draft.tenant.published_at or now
        draft.tenant.updated_at = now

        db.session.commit()

    return jsonify({
        "ok": True,
        "slug": draft.slug,
        "status": draft.status,
        "public_slug": draft.public_slug,
        "draft_url": url_for("ff_onboarding.preview_draft", slug=draft.slug, _external=False),
        "json_url": url_for("ff_onboarding.get_draft_json", slug=draft.slug, _external=False),
        "public_url": url_for("ff_onboarding.public_page", public_slug=draft.public_slug, _external=False),
        "draft": _draft_payload(draft),
    })


@bp.post("/api/onboarding/drafts/<slug>/unpublish")
def unpublish_draft(slug: str):
    draft = OnboardingDraft.query.filter_by(slug=slug).first_or_404()
    denial = _require_draft_access(draft)
    if denial is not None:
        return denial

    now = _utc_now()

    draft.status = "draft"
    draft.public_slug = None
    draft.published_at = None
    draft.updated_at = now

    draft.tenant.status = "draft"
    draft.tenant.public_slug = None
    draft.tenant.published_at = None
    draft.tenant.updated_at = now

    db.session.commit()

    return jsonify({
        "ok": True,
        "slug": draft.slug,
        "status": draft.status,
        "public_slug": draft.public_slug,
        "draft_url": url_for("ff_onboarding.preview_draft", slug=draft.slug, _external=False),
        "json_url": url_for("ff_onboarding.get_draft_json", slug=draft.slug, _external=False),
        "public_url": None,
        "draft": _draft_payload(draft),
    })


@bp.post("/api/onboarding/drafts/<slug>/archive")
def archive_draft(slug: str):
    draft = OnboardingDraft.query.filter_by(slug=slug).first_or_404()
    denial = _require_draft_access(draft)
    if denial is not None:
        return denial

    now = _utc_now()

    draft.status = "archived"
    draft.updated_at = now
    draft.archived_at = now

    draft.tenant.status = "archived"
    draft.tenant.updated_at = now
    draft.tenant.archived_at = now

    db.session.commit()

    return jsonify({
        "ok": True,
        "slug": draft.slug,
        "status": draft.status,
        "public_slug": draft.public_slug,
        "draft_url": url_for("ff_onboarding.preview_draft", slug=draft.slug, _external=False),
        "json_url": url_for("ff_onboarding.get_draft_json", slug=draft.slug, _external=False),
        "public_url": _public_url_for(draft),
        "draft": _draft_payload(draft),
    })


@bp.get("/draft/<slug>")
def preview_draft(slug: str):
    draft = OnboardingDraft.query.filter_by(slug=slug).first_or_404()
    denial = _require_draft_access(draft)
    if denial is not None:
        return denial
    return render_template("index.html", **_context_from_draft(draft, published=False))


@bp.get("/p/<public_slug>")
def public_page(public_slug: str):
    draft = OnboardingDraft.query.filter_by(public_slug=str(public_slug or "").strip(), status="published").first()
    if not draft:
        abort(404)
    return render_template("index.html", **_context_from_draft(draft, published=True))
