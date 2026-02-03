# ------------------------------------------------------------
#  FutureFunded — Production Dockerfile
#  Fast, secure, cache-friendly, Socket.IO-ready
# ------------------------------------------------------------

# Python base
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app


# ------------------------------------------------------------
# System deps (build tools, libpq for Postgres if needed)
# ------------------------------------------------------------
FROM base AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*


# ------------------------------------------------------------
# Python deps — layer cached
# ------------------------------------------------------------
COPY requirements.txt /app/requirements.txt

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt


# ------------------------------------------------------------
# Final runtime image (small)
# ------------------------------------------------------------
FROM python:3.11-slim AS final

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy installed packages from build layer
COPY --from=build /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=build /usr/local/bin /usr/local/bin

# Copy project
COPY . .

# ------------------------------------------------------------
# Expose port (Default FutureFunded port)
# ------------------------------------------------------------
EXPOSE 5000

# ------------------------------------------------------------
# Recommended: Environment defaults for FutureFunded
# ------------------------------------------------------------
ENV FLASK_ENV=production \
    ENV=production \
    USE_SOCKETIO=1 \
    SOCKETIO_ASYNC_MODE=eventlet \
    LOG_STYLE=json

# ------------------------------------------------------------
# ENTRYPOINT — Production Runner
# Uses your run.py launcher (preferred)
# ------------------------------------------------------------
CMD ["python", "run.py", "--host", "0.0.0.0", "--port", "5000", "--force"]

