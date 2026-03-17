# app/context_processors.py
from flask import g, current_app, session

def inject_theme():
    theme = getattr(g, "theme", None) or session.get("ff_theme") or current_app.config.get("FF_DEFAULT_THEME", "core")
    brand = getattr(g, "brand", None) or session.get("ff_brand") or ""
    return dict(ff_theme=theme, ff_brand=brand)
