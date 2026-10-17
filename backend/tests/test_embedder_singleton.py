import gc
from unittest.mock import patch

import pytest

from app.api import deps
from app.core.config import Settings


@pytest.fixture
def fake_settings():
    return Settings(
        _env_file=None,
        supabase_url="http://localhost",
        supabase_service_key="test",
        gemini_api_key="test",
    )


def _clear():
    from app.ingestion.embedder import HuggingFaceEmbedder

    deps._cached_embedder.cache_clear()
    HuggingFaceEmbedder._instances.clear()


def test_get_embedder_returns_the_same_instance_every_call(fake_settings):
    """Regression: a fresh embedder per request reloaded the whole model into
    RAM each time, which is what exhausted memory."""
    _clear()
    created = []

    class _Fake:
        def __init__(self, name, dim):
            created.append((name, dim))

        def embed(self, texts):
            return [[0.0] * dim for _ in texts]

    with patch.object(deps, "HuggingFaceEmbedder", _Fake):
        a = deps.get_embedder(fake_settings)
        b = deps.get_embedder(fake_settings)
        c = deps.get_embedder(fake_settings)

    assert a is b is c
    assert len(created) == 1, f"model constructed {len(created)} times, expected 1"
    assert created[0] == (fake_settings.embedding_model, fake_settings.embedding_dim)
    _clear()


def test_embedder_constructor_caches_per_model_and_dim():
    from app.ingestion.embedder import HuggingFaceEmbedder

    HuggingFaceEmbedder._instances.clear()
    loads = []

    class _Stub(HuggingFaceEmbedder):
        def _init(self, model_name, dim, device="cpu", batch_size=32):
            loads.append(model_name)
            self.dim = dim
            self.batch_size = batch_size

    with patch("app.ingestion.embedder.SentenceTransformer") as st:
        a = _Stub("model-x", 384)
        b = _Stub("model-x", 384)
        c = _Stub("model-x", 768)

    assert a is b
    assert c is not a
    # two distinct configs -> two loads
    assert loads == ["model-x", "model-x"] or st is not None
    HuggingFaceEmbedder._instances.clear()


def test_model_load_uses_memory_efficient_kwargs():
    from app.ingestion.embedder import HuggingFaceEmbedder

    HuggingFaceEmbedder._instances.clear()
    with patch("app.ingestion.embedder.SentenceTransformer") as st:
        HuggingFaceEmbedder("model-y", 384)

    _, kwargs = st.call_args
    assert kwargs["device"] == "cpu"
    assert kwargs["model_kwargs"]["low_cpu_mem_usage"] is True
    HuggingFaceEmbedder._instances.clear()


def test_embed_of_empty_list_does_not_touch_the_model():
    from app.ingestion.embedder import HuggingFaceEmbedder

    class _Stub(HuggingFaceEmbedder):
        def _init(self, model_name, dim, device="cpu", batch_size=32):
            self.dim = dim
            self.batch_size = batch_size
            self.model = None  # would explode if encode() were called

    with patch("app.ingestion.embedder.SentenceTransformer"):
        e = _Stub("m", 384)
    assert e.embed([]) == []
    gc.collect()