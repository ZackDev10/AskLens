"""Upload -> text -> chunks -> embeddings -> database. One file, end to end."""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import PurePath

from app.core.config import Settings
from app.core.db import Repository
from app.core.errors import IngestionError
from app.ingestion.chunker import chunk_pages
from app.ingestion.embedder import Embedder
from app.ingestion.language import detect_language
from app.ingestion.loaders import load_document

log = logging.getLogger("asklens.ingest")

STALE_AFTER = timedelta(minutes=15)  # a 'processing' row older than this is a crashed run


@dataclass
class IngestResult:
    document: dict
    duplicate: bool


def _is_stale(doc: dict) -> bool:
    try:
        created = datetime.fromisoformat(str(doc["created_at"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return False
    return datetime.now(timezone.utc) - created > STALE_AFTER


class IngestionService:
    def __init__(self, repo: Repository, embedder: Embedder, settings: Settings):
        self.repo = repo
        self.embedder = embedder
        self.settings = settings

    def ingest(self, filename: str, data: bytes, title: str | None = None) -> IngestResult:
        filename = PurePath(filename or "upload").name
        max_bytes = self.settings.max_upload_mb * 1024 * 1024
        if len(data) > max_bytes:
            raise IngestionError(f"File is larger than {self.settings.max_upload_mb} MB.", 413)

        # 1. Parse + chunk first: bad files fail fast, before any DB write or API cost
        loaded = load_document(filename, data)
        chunks = chunk_pages(loaded.pages, self.settings.chunk_size, self.settings.chunk_overlap)
        if not chunks:
            raise IngestionError("The file has too little text to index.", 422)

        # 2. De-duplicate on file content
        file_hash = hashlib.sha256(data).hexdigest()
        existing = self.repo.find_by_hash(file_hash)
        if existing:
            if existing["status"] == "ready" or (
                existing["status"] == "processing" and not _is_stale(existing)
            ):
                return IngestResult(existing, duplicate=True)
            self.repo.delete_document(existing["id"])  # failed or stale: start over

        full_text = "\n".join(p.text for p in loaded.pages)
        doc_row = {
            "title": (title or "").strip() or PurePath(filename).stem,
            "source_type": loaded.source_type,
            "source_uri": filename,
            "file_hash": file_hash,
            "language": detect_language(full_text),
            "page_count": len(loaded.pages) if loaded.source_type == "pdf" else None,
            "status": "processing",
        }
        try:
            doc = self.repo.create_document(doc_row)
        except Exception:
            # two identical uploads racing: the unique hash index rejects the second
            existing = self.repo.find_by_hash(file_hash)
            if existing:
                return IngestResult(existing, duplicate=True)
            raise

        # 3. Embed + store; on any failure leave a clear 'failed' row and no partial chunks
        try:
            vectors = self.embedder.embed([c.text for c in chunks])
            rows = [
                {
                    "document_id": doc["id"],
                    "chunk_index": c.index,
                    "page_number": c.page_number,
                    "content": c.text,
                    "char_count": len(c.text),
                    "embedding": vec,
                }
                for c, vec in zip(chunks, vectors, strict=True)
            ]
            self.repo.insert_chunks(rows)
            doc = self.repo.update_document(
                doc["id"], {"status": "ready", "chunk_count": len(rows), "error": None}
            )
        except Exception as exc:
            log.exception("ingestion failed for %s", filename)
            try:
                self.repo.delete_chunks(doc["id"])
                self.repo.update_document(
                    doc["id"], {"status": "failed", "error": f"{exc.__class__.__name__}: {exc}"[:500]}
                )
            except Exception:
                log.exception("could not mark document %s as failed", doc["id"])
            raise IngestionError(
                "Indexing failed. Check the server logs and try again.", 502
            ) from exc

        log.info("ingested %s: %d chunks", filename, len(chunks))
        return IngestResult(doc, duplicate=False)
