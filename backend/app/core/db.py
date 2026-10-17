"""Thin data-access layer over Supabase. All SQL-ish details live here so the
rest of the code (and the tests) never touch the Supabase client directly."""
from __future__ import annotations

import logging
import re
from typing import Any

from app.core.config import mask
from supabase import Client, create_client

log = logging.getLogger("asklens.db")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

DOC_COLUMNS = (
    "id,title,source_type,source_uri,file_hash,language,page_count,"
    "chunk_count,status,error,created_at"
)
INSERT_BATCH = 50  # chunk rows per request (each carries a 1536-float vector)


def sanitize_key(key: str) -> str:
    """Normalise a Supabase key pasted from the dashboard.

    Multi-line paste adds \\r\\n/indentation inside the JWT, which corrupts the
    Authorization header and yields PostgREST 401 "Invalid API key". Strip all
    whitespace and any wrapping quotes before handing the token to the client.
    """
    return re.sub(r"\s+", "", key or "").strip("\"'")


def make_client(url: str, service_key: str) -> Client:
    url = (url or "").strip().strip("\"'").rstrip("/")
    raw_key = service_key or ""
    service_key = sanitize_key(raw_key)
    if not service_key:
        raise RuntimeError("SUPABASE_SERVICE_KEY is empty after sanitization.")
    if service_key != raw_key:
        log.warning("supabase key contained stray whitespace/quotes; sanitized before use")
    log.info("supabase url=%s key=%s", url, mask(service_key))
    return create_client(url, service_key)


class Repository:
    def __init__(self, client: Client):
        self.db = client

    # ---- documents -------------------------------------------------
    def find_by_hash(self, file_hash: str) -> dict | None:
        res = (
            self.db.table("documents")
            .select(DOC_COLUMNS)
            .eq("file_hash", file_hash)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None

    def create_document(self, row: dict[str, Any]) -> dict:
        res = self.db.table("documents").insert(row).execute()
        return res.data[0]

    def update_document(self, doc_id: str, values: dict[str, Any]) -> dict:
        res = self.db.table("documents").update(values).eq("id", doc_id).execute()
        return res.data[0] if res.data else {}

    def get_document(self, doc_id: str) -> dict | None:
        res = (
            self.db.table("documents")
            .select(DOC_COLUMNS)
            .eq("id", doc_id)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None

    def list_documents(self) -> list[dict]:
        res = (
            self.db.table("documents")
            .select(DOC_COLUMNS)
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []

    def delete_document(self, doc_id: str) -> None:
        # chunks are removed by ON DELETE CASCADE
        self.db.table("documents").delete().eq("id", doc_id).execute()

    # ---- chunks ----------------------------------------------------
    def insert_chunks(self, rows: list[dict[str, Any]]) -> None:
        for i in range(0, len(rows), INSERT_BATCH):
            self.db.table("chunks").insert(rows[i : i + INSERT_BATCH]).execute()

    def delete_chunks(self, doc_id: str) -> None:
        self.db.table("chunks").delete().eq("document_id", doc_id).execute()

    # ---- search ----------------------------------------------------
    def hybrid_search(
        self, query_text: str, embedding: list[float], match_limit: int = 5
    ) -> list[dict]:
        res = self.db.rpc(
            "hybrid_search",
            {
                "query_text": query_text,
                "query_embedding": embedding,
                "match_limit": match_limit,
            },
        ).execute()
        return res.data or []
