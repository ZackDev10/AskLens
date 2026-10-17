"""In-memory stand-ins for Supabase and OpenAI, so tests run offline."""
from __future__ import annotations

import itertools
from datetime import datetime, timezone

from app.core.config import Settings


def make_settings(**overrides) -> Settings:
    base = dict(
        supabase_url="http://localhost",
        supabase_service_key="test",
        gemini_api_key="test",
        gemini_model="gemini-2.5-flash",
        chunk_size=300,
        chunk_overlap=50,
        max_upload_mb=1,
    )
    base.update(overrides)
    return Settings(_env_file=None, **base)


class FakeRepo:
    def __init__(self):
        self.docs: dict[str, dict] = {}
        self.chunks: list[dict] = []
        self._ids = itertools.count(1)

    def find_by_hash(self, h):
        return next((d for d in self.docs.values() if d["file_hash"] == h), None)

    def create_document(self, row):
        doc_id = f"00000000-0000-0000-0000-{next(self._ids):012d}"
        doc = {
            **row,
            "id": doc_id,
            "chunk_count": 0,
            "error": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self.docs[doc_id] = doc
        return dict(doc)

    def update_document(self, doc_id, values):
        self.docs[doc_id].update(values)
        return dict(self.docs[doc_id])

    def get_document(self, doc_id):
        return self.docs.get(doc_id)

    def list_documents(self):
        return list(self.docs.values())

    def delete_document(self, doc_id):
        self.docs.pop(doc_id, None)
        self.chunks = [c for c in self.chunks if c["document_id"] != doc_id]

    def insert_chunks(self, rows):
        self.chunks.extend(rows)

    def delete_chunks(self, doc_id):
        self.chunks = [c for c in self.chunks if c["document_id"] != doc_id]

    def hybrid_search(self, query_text, embedding, match_limit=5):
        words = set(query_text.lower().split())
        hits = []
        for c in self.chunks:
            doc = self.docs[c["document_id"]]
            if doc["status"] != "ready":
                continue
            overlap = len(words & set(c["content"].lower().split()))
            if overlap:
                hits.append(
                    {
                        "chunk_id": f"c{c['chunk_index']}",
                        "document_id": c["document_id"],
                        "document_title": doc["title"],
                        "chunk_index": c["chunk_index"],
                        "page_number": c["page_number"],
                        "content": c["content"],
                        "score": float(overlap),
                    }
                )
        return sorted(hits, key=lambda h: -h["score"])[:match_limit]


class FakeEmbedder:
    """Deterministic tiny 'embeddings'; can be told to fail."""

    def __init__(self, fail: bool = False):
        self.fail = fail
        self.calls = 0

    def embed(self, texts):
        self.calls += 1
        if self.fail:
            raise RuntimeError("embedding service down")
        return [[float(len(t) % 7), 0.0, 1.0] for t in texts]
