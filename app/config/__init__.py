# app/config/__init__.py
from __future__ import annotations

from typing import Type
from . import config as _cfg
from .config import BaseConfig, DevelopmentConfig, ProductionConfig
# ---------------------------------------------------------------------------
# BaseConfig (tolerant)
# ---------------------------------------------------------------------------

CONFIG_BY_NAME = {
    "base": BaseConfig,
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}
# ---------------------------------------------------------------------------
# Environment configs (required)
# ---------------------------------------------------------------------------

try:
    DevelopmentConfig: Type = _cfg.DevelopmentConfig
except AttributeError as e:
    raise RuntimeError(
        "[ConfigError] app.config.config must define DevelopmentConfig"
    ) from e

try:
    ProductionConfig: Type = _cfg.ProductionConfig
except AttributeError as e:
    raise RuntimeError(
        "[ConfigError] app.config.config must define ProductionConfig"
    ) from e

TestingConfig: Type | None = getattr(_cfg, "TestingConfig", None)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

__all__ = [
    "BaseConfig",
    "DevelopmentConfig",
    "ProductionConfig",
    "TestingConfig",
]
