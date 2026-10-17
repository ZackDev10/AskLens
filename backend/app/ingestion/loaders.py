"""Read uploaded files into plain text, page by page."""
from __future__ import annotations

import io
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import PurePath

from app.core.errors import IngestionError

SUPPORTED = {".pdf": "pdf", ".docx": "docx", ".txt": "txt", ".md": "txt"}


@dataclass
class Page:
    number: int | None  # 1-based for PDFs, None for formats without pages
    text: str


@dataclass
class LoadedDocument:
    source_type: str
    pages: list[Page]


def clean_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\x00", "")           # Postgres rejects NUL characters
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t\u00a0]+", " ", text)  # collapse spaces / tabs / nbsp
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)     # max one blank line
    return text.strip()


def _load_txt(data: bytes) -> list[Page]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="replace")
    return [Page(None, clean_text(text))]


def _load_pdf(data: bytes) -> list[Page]:
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            if not reader.decrypt(""):
                raise IngestionError("This PDF is password-protected.", 422)
        pages = []
        for i, page in enumerate(reader.pages, start=1):
            pages.append(Page(i, clean_text(page.extract_text() or "")))
        return pages
    except IngestionError:
        raise
    except (PyPdfError, ValueError, KeyError, OSError) as exc:
        raise IngestionError(f"Could not read this PDF ({exc.__class__.__name__}).", 400)


def _load_docx(data: bytes) -> list[Page]:
    from docx import Document
    from docx.oxml.ns import qn
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    try:
        doc = Document(io.BytesIO(data))
    except (zipfile.BadZipFile, KeyError, ValueError):
        raise IngestionError("Could not read this Word file (is it a real .docx?).", 400)

    lines: list[str] = []
    for child in doc.element.body.iterchildren():  # keeps paragraphs and tables in order
        if child.tag == qn("w:p"):
            lines.append(Paragraph(child, doc).text)
        elif child.tag == qn("w:tbl"):
            for row in Table(child, doc).rows:
                cells = [c.text.strip() for c in row.cells]
                lines.append(" | ".join(c for c in cells if c))
    return [Page(None, clean_text("\n".join(lines)))]


def load_document(filename: str, data: bytes) -> LoadedDocument:
    ext = PurePath(filename).suffix.lower()
    if ext not in SUPPORTED:
        raise IngestionError(
            f"Unsupported file type '{ext or filename}'. Use: "
            + ", ".join(sorted(SUPPORTED)),
            415,
        )
    source_type = SUPPORTED[ext]
    if not data:
        raise IngestionError("The file is empty.", 400)

    loader = {"pdf": _load_pdf, "docx": _load_docx, "txt": _load_txt}[source_type]
    pages = loader(data)

    if not any(p.text for p in pages):
        hint = " Scanned PDFs need OCR first." if source_type == "pdf" else ""
        raise IngestionError("No readable text found in this file." + hint, 422)
    return LoadedDocument(source_type=source_type, pages=pages)
