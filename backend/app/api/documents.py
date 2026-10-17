import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from app.api.deps import (
    get_embedder,
    get_ingestion_service,
    get_repo,
    get_settings,
    require_api_key,
)
from app.core.config import Settings
from app.core.db import Repository
from app.ingestion.embedder import Embedder
from app.ingestion.pipeline import IngestionService
from app.retrieval.search import search_chunks

router = APIRouter(dependencies=[Depends(require_api_key)])


class DocumentOut(BaseModel):
    id: str
    title: str
    source_type: str
    source_uri: str | None = None
    language: str | None = None
    page_count: int | None = None
    chunk_count: int = 0
    status: str
    error: str | None = None
    created_at: str | None = None


class IngestResponse(BaseModel):
    document: DocumentOut
    duplicate: bool


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)


class SearchHit(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    chunk_index: int
    page_number: int | None = None
    content: str
    score: float


def _uuid_or_404(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(status_code=404, detail="Document not found.")


@router.post("/ingest", response_model=IngestResponse, status_code=201)
def ingest(
    response: Response,
    file: Annotated[UploadFile, File(description="PDF, DOCX, TXT or MD")],
    title: Annotated[str | None, Form()] = None,
    service: IngestionService = Depends(get_ingestion_service),
    settings: Settings = Depends(get_settings),
):
    # read at most limit+1 bytes so an oversized upload can't exhaust memory
    limit = settings.max_upload_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    result = service.ingest(file.filename or "upload", data, title)
    if result.duplicate:
        response.status_code = 200
    return IngestResponse(document=result.document, duplicate=result.duplicate)


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(repo: Repository = Depends(get_repo)):
    return repo.list_documents()


@router.get("/documents/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: str, repo: Repository = Depends(get_repo)):
    doc = repo.get_document(_uuid_or_404(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: str, repo: Repository = Depends(get_repo)):
    doc_id = _uuid_or_404(doc_id)
    if not repo.get_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    repo.delete_document(doc_id)
    return Response(status_code=204)


@router.post("/search", response_model=list[SearchHit])
def search(
    body: SearchRequest,
    repo: Repository = Depends(get_repo),
    embedder: Embedder = Depends(get_embedder),
):
    """Inspect what retrieval returns for a question (no LLM involved yet)."""
    return search_chunks(repo, embedder, body.query, body.top_k)
