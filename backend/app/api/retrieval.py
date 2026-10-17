from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any

from app.api.deps import get_embedder, get_repo
from app.core.db import Repository
from app.ingestion.embedder import HuggingFaceEmbedder

router = APIRouter()


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    limit: int = Field(default=5, ge=1, le=20)


class SearchResponse(BaseModel):
    results: List[Dict[str, Any]]


@router.post("/search/raw", response_model=SearchResponse)
def search_documents(
    req: SearchRequest,
    repo: Repository = Depends(get_repo),
    embedder: HuggingFaceEmbedder = Depends(get_embedder),
):
    """Raw retrieval hits. Uses the repository, so the sanitized Supabase
    client and the RPC's real `match_limit` parameter are used."""
    try:
        vector = embedder.embed([req.query])[0]
        return {"results": repo.hybrid_search(req.query, vector, match_limit=req.limit)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))