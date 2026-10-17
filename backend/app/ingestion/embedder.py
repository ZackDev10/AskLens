import logging
import threading
from typing import Protocol

from sentence_transformers import SentenceTransformer

log = logging.getLogger("asklens.embedder")


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class HuggingFaceEmbedder:
    """Loads a SentenceTransformer once and reuses it.

    Construction is guarded by a class-level lock so that concurrent first
    requests cannot each load their own copy into RAM. Always obtain one via
    get_embedder() (a singleton) rather than instantiating directly.
    """

    _instances: dict[tuple, "HuggingFaceEmbedder"] = {}
    _lock = threading.Lock()

    def __new__(cls, model_name: str, dim: int, **kwargs):
        key = (model_name, dim)
        with cls._lock:
            inst = cls._instances.get(key)
            if inst is None:
                log.info("loading embedding model %s (dim=%d)", model_name, dim)
                inst = super().__new__(cls)
                inst._init(model_name, dim, **kwargs)
                cls._instances[key] = inst
                log.info("embedding model ready")
            return inst

    def _init(
        self,
        model_name: str,
        dim: int,
        device: str = "cpu",
        batch_size: int = 32,
    ) -> None:
        # low_cpu_mem_usage avoids materializing duplicate weight tensors while
        # loading; fp32 on CPU matches what pgvector stores.
        self.model = SentenceTransformer(
            model_name,
            device=device,
            model_kwargs={"low_cpu_mem_usage": True},
        )
        self.dim = dim
        self.batch_size = batch_size

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        embeddings = self.model.encode(
            texts,
            convert_to_numpy=True,
            batch_size=self.batch_size,
            show_progress_bar=False,
        )

        vectors = []
        for vec in embeddings:
            if len(vec) != self.dim:
                raise ValueError(
                    f"Embedding has {len(vec)} dimensions but the "
                    f"database expects {self.dim}."
                )
            vectors.append(vec.tolist())

        log.debug("embedded %d texts with local model", len(texts))
        return vectors