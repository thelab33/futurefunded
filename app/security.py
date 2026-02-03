# app/security.py  (new file)
import secrets

from flask import current_app, g, request


def attach_csp(app):
    @app.context_processor
    def provide_nonce():
        # allow templates to call csp_nonce()
        def _csp_nonce():
            # generate once per request
            if not getattr(g, "csp_nonce", None):
                g.csp_nonce = secrets.token_urlsafe(16)
            return g.csp_nonce

        return dict(csp_nonce=_csp_nonce)

    @app.after_request
    def set_csp_header(response):
        # use the nonce generated for this request (if any)
        nonce = getattr(g, "csp_nonce", "")
        # build a strict CSP (example, tweak to your needs)
        script_src = " 'self' https://js.stripe.com"
        if nonce:
            script_src += " 'nonce-{}'".format(nonce)
        csp = (
            "default-src 'self' https:; "
            f"script-src {script_src}; "
            "connect-src 'self' https://api.stripe.com https://hooks.stripe.com https://events.stripe.com; "
            "img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "frame-src https://js.stripe.com https://checkout.stripe.com; "
            "object-src 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com;"
        )
        # Set header only in production
        if not current_app.debug:
            response.headers["Content-Security-Policy"] = csp
        return response
