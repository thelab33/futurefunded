import os

# Force production env if your app reads this
os.environ.setdefault("ENV", "production")

from app import create_app  # adjust if your factory path differs

app = create_app()

# Optional: make sure SocketIO initializes if your app uses init_app pattern
try:
    from app.extensions import socketio  # noqa: F401
except Exception:
    pass
