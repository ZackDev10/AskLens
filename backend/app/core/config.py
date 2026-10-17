"""Application settings, loaded from environment variables / .env"""
import re
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The repo root's .env, resolved from this file rather than from the process CWD,
# so running uvicorn from backend/ or from the root always reads the same file.
REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = REPO_ROOT / ".env"


def _scrub(value: str) -> str:
    """Secrets pasted from the Supabase dashboard often arrive wrapped over
    several lines (or quoted). The JWT goes straight into an Authorization
    header, so any stray newline breaks gateway auth with a 401."""
    value = re.sub(r"\s+", "", value or "")
    return value.strip("\"'")


def mask(secret: str, keep: int = 6) -> str:
    """Non-reversible fingerprint for logs: enough to tell two keys apart,
    not enough to replay the credential."""
    if not secret:
        return "<empty>"
    if len(secret) <= keep * 2:
        return "*" * len(secret)
    return f"{secret[:keep]}...{secret[-keep:]} (len={len(secret)})"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase (backend only: the service key bypasses RLS, never ship it in the app)
    supabase_url: str
    supabase_service_key: str
    gemini_api_key: str

    # New local HuggingFace setup
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_dim: int = 384
    chunk_size: int = 1000
    chunk_overlap: int = 150

    # Gemini. 1.5 Flash has been retired by Google, so default to 2.5 Flash and
    # keep it overridable (GEMINI_MODEL) so a retirement never needs a code edit.
    gemini_model: str = "gemini-2.5-flash"

    # Uploads
    max_upload_mb: int = 15

    # Optional shared secret. If set, every endpoint except /health needs
    # the header  X-API-Key: <value>
    api_key: str | None = None

    # Comma-separated list, or * (only matters for browser clients)
    cors_origins: str = "*"

    @field_validator("supabase_url", "supabase_service_key", "gemini_api_key", "api_key", mode="before")
    @classmethod
    def _strip_secrets(cls, v):
        if isinstance(v, str):
            return _scrub(v) if v else v
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
