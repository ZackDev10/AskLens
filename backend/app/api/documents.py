import os
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

# Import your IngestionService and error classes
from app.ingestion.pipeline import IngestionService
from app.core.errors import IngestionError

# Import your configuration and database dependencies from deps.py
from app.api.deps import get_repo, get_embedder, get_settings
from app.core.db import Repository
from app.ingestion.embedder import Embedder
from app.core.config import Settings

logger = logging.getLogger("asklens.upload")
router = APIRouter()

# Ensure the upload directory exists
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../sample-data"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    repo: Repository = Depends(get_repo),
    embedder: Embedder = Depends(get_embedder),
    settings: Settings = Depends(get_settings)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    try:
        # 1. Read the raw file bytes into memory (required by pipeline.py)
        data = await file.read()

        # 2. Save a backup copy to the disk for your records
        with open(file_path, "wb") as buffer:
            buffer.write(data)

        logger.info(f"Successfully saved {file.filename} to {file_path}")

        # 3. Instantiate the service and trigger the ingestion pipeline
        service = IngestionService(repo=repo, embedder=embedder, settings=settings)
        result = service.ingest(filename=file.filename, data=data)

        # result.duplicate is a boolean returned by IngestResult
        if result.duplicate:
            return {
                "filename": file.filename,
                "status": "skipped",
                "message": "File already exists and is ready in the database."
            }

        return {
            "filename": file.filename,
            "status": "success",
            "message": "File uploaded, chunked, and embedded into Supabase successfully!"
        }

    except IngestionError:
        # Let IngestionError bubble up to the handler in main.py to return the correct 413/422 status codes
        raise
    except Exception as e:
        logger.exception("Upload or Ingestion failed")
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

@router.get("/documents")
async def list_documents(repo: Repository = Depends(get_repo)):
    """Fetch all uploaded documents from Supabase."""
    try:
        # Assuming your Repository class has a .db attribute for the Supabase client
        response = repo.db.table("documents").select("id, title, source_uri, created_at").order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        logger.exception("Failed to fetch documents")
        raise HTTPException(status_code=500, detail=f"Failed to fetch documents: {str(e)}")

@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, repo: Repository = Depends(get_repo)):
    """Delete a document and its associated chunks from Supabase."""
    try:
        # 1. Delete associated chunks first to avoid foreign key constraint errors
        repo.db.table("chunks").delete().eq("document_id", document_id).execute()

        # 2. Delete the parent document record
        repo.db.table("documents").delete().eq("id", document_id).execute()

        return {"status": "success", "message": "Document deleted successfully"}
    except Exception as e:
        logger.exception("Failed to delete document")
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")
