# app/config/__init__.py
from .config import (BaseConfig, DevelopmentConfig, ProductionConfig,
                     TestingConfig, config_by_name)

Config = BaseConfig  # optional alias
