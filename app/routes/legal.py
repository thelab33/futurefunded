from flask import Blueprint, render_template

bp = Blueprint("legal", __name__)

@bp.get("/privacy")
def privacy():
    return render_template("privacy.html")

@bp.get("/terms")
def terms():
    return render_template("terms.html")
