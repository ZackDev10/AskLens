"""Split text into overlapping chunks, preferring natural boundaries
(paragraph > line > sentence > clause > word). Works on characters, so it
behaves the same for English, French and Arabic without extra libraries."""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.ingestion.loaders import Page

# Order matters: try the biggest natural break first. "؟ " is the Arabic question mark.
SEPARATORS = ["\n\n", "\n", ". ", "? ", "! ", "؟ ", "; ", ", ", " "]
MIN_CHUNK_CHARS = 20


@dataclass
class Chunk:
    index: int
    page_number: int | None
    text: str


def _split(text: str, size: int, seps: list[str]) -> list[str]:
    """Break text into pieces no longer than `size`, keeping separators attached."""
    if len(text) <= size:
        return [text]
    if not seps:  # no natural break left: hard cut
        return [text[i : i + size] for i in range(0, len(text), size)]
    sep, rest = seps[0], seps[1:]
    if sep not in text:
        return _split(text, size, rest)
    parts = text.split(sep)
    out: list[str] = []
    for i, part in enumerate(parts):
        piece = part + (sep if i < len(parts) - 1 else "")
        out.extend([piece] if len(piece) <= size else _split(piece, size, rest))
    return out


def _overlap_tail(text: str, overlap: int) -> str:
    """Last `overlap` characters, starting at a word boundary."""
    if overlap <= 0 or len(text) <= overlap:
        return ""
    tail = text[-overlap:]
    m = re.search(r"\s", tail)
    return tail[m.end() :] if m else ""


def split_text(text: str, size: int = 1000, overlap: int = 150) -> list[str]:
    if size <= 0:
        raise ValueError("size must be positive")
    overlap = max(0, min(overlap, size // 2))
    pieces = _split(text, size, SEPARATORS)

    chunks: list[str] = []
    current = ""
    for piece in pieces:
        if len(current) + len(piece) <= size:
            current += piece
            continue
        if current.strip():
            chunks.append(current.strip())
        tail = _overlap_tail(current, overlap)
        current = (tail + piece) if len(tail) + len(piece) <= size else piece
    if current.strip():
        chunks.append(current.strip())
    return chunks


def chunk_pages(pages: list[Page], size: int = 1000, overlap: int = 150) -> list[Chunk]:
    """Chunk each page separately so every chunk knows its page (for citations)."""
    result: list[Chunk] = []
    for page in pages:
        if not page.text:
            continue
        for text in split_text(page.text, size, overlap):
            if len(text) >= MIN_CHUNK_CHARS:
                result.append(Chunk(index=len(result), page_number=page.number, text=text))
    return result
