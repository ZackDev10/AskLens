"""Diagnostic: prove the embedding model loads once instead of once per request.

Simulates what FastAPI's dependency injection does per request and counts model
loads. Uses a stub model by default so it runs without downloading weights; pass
--real to load the actual model and report RSS growth.

    cd backend
    python scripts/check_embedder_memory.py          # stubbed, no download
    python scripts/check_embedder_memory.py --real   # real weights + RSS
"""
from __future__ import annotations

import gc
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import deps  # noqa: E402
from app.core.config import get_settings  # noqa: E402

REQUESTS = 10


def rss_mb() -> float:
    import psutil

    gc.collect()
    return psutil.Process(os.getpid()).memory_info().rss / 1024**2


def main() -> int:
    real = "--real" in sys.argv
    s = get_settings()
    print(f"model={s.embedding_model} dim={s.embedding_dim} requests={REQUESTS} real={real}\n")

    import app.ingestion.embedder as em

    deps._cached_embedder.cache_clear()
    em.HuggingFaceEmbedder._instances.clear()

    loads: list = []

    class _StubModel:
        def __init__(self, name, **kw):
            loads.append((name, kw.get("device"), kw.get("model_kwargs")))
            import numpy as np

            self.encode = lambda t, **k: np.zeros((len(t), s.embedding_dim), dtype="float32")

        def __getattr__(self, n):
            return lambda *a, **k: None

    ctx = (
        patch.object(em, "SentenceTransformer")
        if real
        else patch.object(em, "SentenceTransformer", _StubModel)
    )

    base = rss_mb()
    print(f"baseline RSS : {base:8.1f} MB")

    with ctx:
        ids = []
        for i in range(1, REQUESTS + 1):
            e = deps.get_embedder(s)
            ids.append(id(e))
            e.embed(["probe sentence"])  # exercise the real encode path
            if real and i in (1, 2, REQUESTS):
                now = rss_mb()
                print(f"after req {i:>2}  : {now:8.1f} MB  (+{now - base:.1f})")

    now = rss_mb()
    unique = len(set(ids))
    print(f"\nfinal RSS    : {now:8.1f} MB  (+{now - base:.1f})")
    print(f"distinct instances : {unique}")
    print(f"model loads        : {len(loads)}")
    if loads and loads[0][2]:
        print(f"load kwargs        : device={loads[0][1]} model_kwargs={loads[0][2]}")

    ok = unique == 1 and len(loads) == 1
    print("\nPASS: single shared instance, model loaded once" if ok else "\nFAIL: model reloaded per request")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())