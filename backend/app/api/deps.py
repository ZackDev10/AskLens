from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.core.config import Settings, get_settings
from app.core.db import Client, Repository, make_client
from app.ingestion.embedder import HuggingFaceEmbedder
from app.ingestion.pipeline import IngestionService


@lru_cache(maxsize=1)
def _cached_client(url: str, key: str) -> Client:
    return make_client(url, key)


def get_repo(s: Settings = Depends(get_settings)) -> Repository:
    # make_client sanitizes the key; cache so every request reuses one pooled client
    return Repository(_cached_client(s.supabase_url, s.supabase_service_key))


@lru_cache(maxsize=1)
def _cached_embedder(model_name: str, dim: int) -> HuggingFaceEmbedder:
    # Cache on plain strings: Settings is unhashable and would raise TypeError.
    return HuggingFaceEmbedder(model_name, dim)


def get_embedder(s: Settings = Depends(get_settings)) -> HuggingFaceEmbedder:
    """Strict singleton. Without the cache, FastAPI calls this per request and
    each call would load another copy of the SentenceTransformer into RAM,
    which is what exhausted memory during model loading."""
    return _cached_embedder(s.embedding_model, s.embedding_dim)


def get_ingestion_service(
    repo: Repository = Depends(get_repo),
    embedder: HuggingFaceEmbedder = Depends(get_embedder),
    settings: Settings = Depends(get_settings),
) -> IngestionService:
    return IngestionService(repo, embedder, settings)


def require_api_key(
    x_api_key: Annotated[str | None, Header()] = None,
    s: Settings = Depends(get_settings),
) -> None:
    if s.api_key and x_api_key != s.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")