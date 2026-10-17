"""Retrieval entry point: embed the question, run hybrid search."""
from __future__ import annotations

from app.core.db import Repository
from app.ingestion.embedder import Embedder


def search_chunks(repo: Repository, embedder: Embedder, query: str, top_k: int = 5) -> list[dict]:
    vector = embedder.embed([query])[0]
    return repo.hybrid_search(query, vector, top_k)
