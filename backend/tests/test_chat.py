import asyncio
import inspect
from unittest.mock import patch

from app.api import deps

TEXT = ("Returns are accepted within 30 days of delivery. " * 30).encode()

SYSTEM_FAKE = [
    "Returns are accepted within 30 days of delivery.",
    "Contact support to start a claim.",
]


def _seed(client):
    assert client.post("/ingest", files={"file": ("returns.txt", TEXT)}).status_code == 201


class _FakeStream:
    def __init__(self, texts):
        self._texts = list(texts)

    def __aiter__(self):
        async def gen():
            for t in self._texts:
                yield type("C", (), {"text": t})()

        return gen()


class _FakeModels:
    async def generate_content_stream(self, **kwargs):
        return _FakeStream(SYSTEM_FAKE)


class _FakeAio:
    models = _FakeModels()


class _FakeGemini:
    aio = _FakeAio()


def test_chat_streams_after_retrieval(client):
    _seed(client)
    with patch("app.api.chat.get_gemini", return_value=_FakeGemini()):
        r = client.post("/chat", json={"query": "returns delivery"})
    assert r.status_code == 200
    body = r.text
    assert "30 days" in body


def test_chat_without_hits_still_streams(client):
    with patch("app.api.chat.get_gemini", return_value=_FakeGemini()):
        r = client.post("/chat", json={"query": "zzz nothing matches"})
    assert r.status_code == 200
    assert "couldn't find" in r.text


def test_streaming_uses_the_configured_model_not_a_hardcoded_1_5_flash():
    """Regression: gemini-1.5-flash was retired and 404s. The id must come from
    settings so it can be changed without touching this module."""
    from app.api import chat
    from app.core.config import get_settings

    expected = get_settings().gemini_model
    seen = {}

    class _Models:
        async def generate_content_stream(self, **kwargs):
            seen.update(kwargs)
            return _FakeStream(["ok"])

    fake = _FakeGemini()
    fake.aio.models = _Models()

    async def _collect():
        return [c async for c in chat.stream_gemini_response("q", [{"content": "ctx"}])]

    with patch("app.api.chat.get_gemini", return_value=fake):
        asyncio.run(_collect())

    assert seen["model"] == expected
    assert "1.5-flash" not in seen["model"]
    assert "1.5-flash" not in inspect.getsource(chat)
    assert 'model="' not in inspect.getsource(chat)  # id must come from settings


def test_chat_rejects_empty_query(client):
    assert client.post("/chat", json={"query": ""}).status_code == 422


def test_chat_reports_db_failure_as_500(client, repo):
    def boom(*a, **k):
        raise RuntimeError("PostgREST exploded")

    repo.hybrid_search = boom
    with patch("app.api.chat.get_gemini", return_value=_FakeGemini()):
        r = client.post("/chat", json={"query": "returns"})
    assert r.status_code == 500


def test_get_repo_uses_sanitized_cached_client():
    deps._cached_client.cache_clear()
    calls = []

    def fake_make(url, key):
        calls.append((url, key))
        return "client"

    with patch.object(deps, "make_client", fake_make):
        from app.core.config import Settings

        s = Settings(
            _env_file=None,
            supabase_url="http://x",
            supabase_service_key=" abc\r\n def ",
            gemini_api_key="k",
        )
        deps.get_repo(s)
        deps.get_repo(s)
    assert calls == [("http://x", "abcdef")]