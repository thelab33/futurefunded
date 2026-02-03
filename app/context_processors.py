@app.context_processor
def inject_branding():
    team = get_current_team()  # however you load your team
    _logo = team.logo if team and team.logo else "images/logo.webp"
    logoSrc = (
        _logo
        if _logo.startswith("http")
        else url_for("static", filename=_logo.lstrip("/"))
    )
    return dict(global_logo=logoSrc)
