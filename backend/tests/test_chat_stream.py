"""Phase 3 validation: /chat streams Server-Sent Events end to end.

The dev machine cannot load the sentence-transformers weights (a real
HuggingFaceEmbedder triggers MemoryError), so every heavy boundary is mocked:

  * app.ingestion.embedder.SentenceTransformer -> MagicMock (no weights loaded)
  * deps.get_embedder                             -> MagicMock returning a vector
  * deps.get_repo / Repository.hybrid_search      -> MagicMock returning chunks
  * app.api.chat.get_gemini                       -> fake async streaming client

Nothing here touches Supabase, the model cache, or the network.
Set RUN_LIVE_GEMINI=1 to additionally hit the real Gemini API.
"""
from __future__ import annotations

import json
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import chat, deps
from app.main import app

EMBEDDING_DIM = 384
GEMINI_MODEL = "gemini-2.5-flash"
STREAM_ERROR_MESSAGE = "Chat stream interrupted due to an upstream error."

FAKE_CHUNKS = [
    {
        "chunk_id": "c0",
        "document_id": "doc-returns",
        "document_title": "Returns Policy (EN)",
        "chunk_index": 0,
        "page_number": 1,
        "content": "Returns are accepted within 30 days of delivery.",
        "score": 0.91,
    },
    {
        "chunk_id": "c1",
        "document_id": "doc-returns",
        "document_title": "Returns Policy (EN)",
        "chunk_index": 1,
        "page_number": 2,
        "content": "Contact support to start a claim.",
        "score": 0.78,
    },
]

GEMINI_TOKENS = ["Returns ", "are accepted ", "within 30 days ", "(Page 1)."]

FAKE_SETTINGS = SimpleNamespace(
    embedding_model="mock/paraphrase-multilingual-MiniLM-L12-v2",
    embedding_dim=EMBEDDING_DIM,
    gemini_model=GEMINI_MODEL,
    gemini_api_key="mock-key",
    chunk_size=1000,
    chunk_overlap=150,
    max_upload_mb=15,
)


# --------------------------------------------------------------------------
# fixtures: mock every expensive / external boundary
# --------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def no_real_model_weights():
    """Belt-and-braces: even if something constructs HuggingFaceEmbedder for
    real, SentenceTransformer is a mock so no weights are read into RAM."""
    deps._cached_embedder.cache_clear()
    with patch("app.ingestion.embedder.SentenceTransformer", MagicMock()) as st:
        yield st
    deps._cached_embedder.cache_clear()


@pytest.fixture
def embedder_mock():
    """Stands in for HuggingFaceEmbedder."""
    m = MagicMock()
    m.embed = MagicMock(side_effect=lambda texts: [[0.01] * EMBEDDING_DIM for _ in texts])
    return m


@pytest.fixture
def repo_mock():
    """Stands in for Repository; hybrid_search returns dummy context chunks."""
    m = MagicMock()
    m.hybrid_search = MagicMock(return_value=FAKE_CHUNKS)
    return m


class _Stream:
    def __init__(self, texts):
        self._texts = list(texts)

    def __aiter__(self):
        async def gen():
            for t in self._texts:
                yield SimpleNamespace(text=t)

        return gen()


class _Models:
    def __init__(self, texts):
        self._texts = list(texts)
        self.calls = []

    async def generate_content_stream(self, **kwargs):
        self.calls.append(kwargs)
        return _Stream(self._texts)


@pytest.fixture
def gemini_mock():
    """Fake google.genai client exposing the same aio stream surface."""
    client = MagicMock()
    client.aio.models = _Models(GEMINI_TOKENS)
    return client


@pytest.fixture
def client(embedder_mock, repo_mock):
    app.dependency_overrides[deps.get_embedder] = lambda: embedder_mock
    app.dependency_overrides[deps.get_repo] = lambda: repo_mock
    app.dependency_overrides[deps.get_settings] = lambda: FAKE_SETTINGS
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def parse_sse(body: str) -> list[str]:
    """Extract the `data:` payloads from an SSE body.

    Per the SSE spec, only ONE optional leading space after the colon is
    removed. Trailing whitespace is preserved (tokens like "Returns " must
    survive intact).
    """
    payloads: list[str] = []
    for line in body.splitlines():
        if not line.startswith("data:"):
            continue
        payload = line.removeprefix("data:")
        payload = payload.removeprefix(" ")
        payloads.append(payload)
    return payloads


def fake_gemini(gemini_mock):
    """Patch out the SDK client and the settings lookup chat.py makes."""
    return (
        patch.object(chat, "get_gemini", return_value=gemini_mock),
        patch.object(chat, "get_settings", return_value=FAKE_SETTINGS),
    )


# --------------------------------------------------------------------------
# tests
# --------------------------------------------------------------------------
def test_chat_returns_200_and_streams_sse(client, gemini_mock):
    g_patch, s_patch = fake_gemini(gemini_mock)
    with g_patch, s_patch:
        response = client.post("/chat", json={"query": "how long do I have to return?"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    payloads = parse_sse(response.text)
    assert payloads == GEMINI_TOKENS
    assert "".join(payloads) == "Returns are accepted within 30 days (Page 1)."


def test_chat_streams_multiple_sse_events_not_one_blob(client, gemini_mock):
    g_patch, s_patch = fake_gemini(gemini_mock)
    with g_patch, s_patch:
        response = client.post("/chat", json={"query": "returns"})

    assert response.status_code == 200
    frames = [ln for ln in response.text.splitlines() if ln.startswith("data:")]
    assert len(frames) == len(GEMINI_TOKENS) > 1


def test_chat_uses_the_mocked_embedder_and_never_loads_the_model(client, embedder_mock, gemini_mock):
    g_patch, s_patch = fake_gemini(gemini_mock)
    with g_patch, s_patch:
        response = client.post("/chat", json={"query": "warranty length"})

    assert response.status_code == 200
    embedder_mock.embed.assert_called_once_with(["warranty length"])


def test_chat_passes_context_chunks_to_gemini(client, repo_mock, gemini_mock):
    g_patch, s_patch = fake_gemini(gemini_mock)
    with g_patch, s_patch:
        response = client.post("/chat", json={"query": "returns policy"})

    assert response.status_code == 200
    repo_mock.hybrid_search.assert_called_once()
    call = repo_mock.hybrid_search.call_args
    assert call.args[0] == "returns policy"
    assert len(call.args[1]) == EMBEDDING_DIM  # query vector
    assert call.kwargs["match_limit"] == 5

    kwargs = gemini_mock.aio.models.calls[0]
    assert kwargs["model"] == GEMINI_MODEL
    contents = kwargs["contents"]
    assert "30 days" in contents
    assert "returns policy" in contents
    assert "Contact support" in contents


def test_chat_streams_fallback_when_search_returns_nothing(client, repo_mock, gemini_mock):
    repo_mock.hybrid_search.return_value = []
    with patch.object(chat, "get_gemini", return_value=gemini_mock):
        response = client.post("/chat", json={"query": "unrelated question"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "couldn't find" in response.text
    assert gemini_mock.aio.models.calls == []


def test_chat_rejects_empty_query(client):
    assert client.post("/chat", json={"query": ""}).status_code == 422


def test_chat_streams_error_event_on_gemini_failure(client, gemini_mock):
    """Once the stream starts, headers (200 OK) are already sent, so an
    upstream failure must surface as an SSE `error` event, not a 500."""
    gemini_mock.aio.models.generate_content_stream = AsyncMock(
        side_effect=RuntimeError("gemini 429")
    )
    g_patch, s_patch = fake_gemini(gemini_mock)
    with g_patch, s_patch:
        response = client.post("/chat", json={"query": "returns"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    payloads = parse_sse(response.text)
    assert STREAM_ERROR_MESSAGE in payloads
    assert "event: error" in response.text.splitlines()


def test_each_sse_payload_is_a_single_line_string(client, gemini_mock):
    g_patch, s_patch = fake_gemini(gemini_mock)
    with g_patch, s_patch:
        response = client.post("/chat", json={"query": "returns"})

    payloads = parse_sse(response.text)
    assert payloads
    for payload in payloads:
        json.dumps(payload)  # must be JSON-safe
        assert "\n" not in payload


def test_health_still_ok(client):
    assert client.get("/health").json() == {"status": "ok"}


# --------------------------------------------------------------------------
# optional live smoke test against the real Gemini API
# --------------------------------------------------------------------------
@pytest.mark.skipif(
    os.getenv("RUN_LIVE_GEMINI") != "1",
    reason="set RUN_LIVE_GEMINI=1 to hit the real Gemini API",
)
def test_live_gemini_streams(client, repo_mock):
    """No get_gemini patch: the real SDK client and real API key are used."""
    from app.core.config import get_settings

    assert get_settings().gemini_api_key
    response = client.post("/chat", json={"query": "What is the return window?"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    payloads = parse_sse(response.text)
    assert payloads
    assert any(p.strip() for p in payloads)
