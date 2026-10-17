import pytest

from app.core.errors import IngestionError
from app.ingestion.loaders import clean_text, load_document
from tests.conftest import make_docx, make_pdf


def test_txt_utf8_with_accents_and_arabic():
    data = "Livraison rapide à Agadir.\nالتوصيل مجاني".encode("utf-8-sig")
    doc = load_document("faq.txt", data)
    assert doc.source_type == "txt"
    assert "Agadir" in doc.pages[0].text and "التوصيل" in doc.pages[0].text


def test_null_bytes_and_messy_whitespace_are_cleaned():
    assert clean_text("a\x00b   c\n\n\n\nd") == "ab c\n\nd"


def test_markdown_is_treated_as_text():
    assert load_document("notes.md", b"# Title\nSome body text here.").source_type == "txt"


def test_pdf_pages_are_numbered():
    doc = load_document("x.pdf", make_pdf(["First page text", "Second page text"]))
    assert doc.source_type == "pdf"
    assert [p.number for p in doc.pages] == [1, 2]
    assert "Second page" in doc.pages[1].text


def test_docx_keeps_paragraphs_and_tables():
    doc = load_document("w.docx", make_docx())
    text = doc.pages[0].text
    assert "twelve month warranty" in text
    assert "Desk lamp | 12 months" in text
    assert text.index("warranty") < text.index("Desk lamp") < text.index("Contact support")


@pytest.mark.parametrize(
    "name,data,status",
    [
        ("virus.exe", b"abc", 415),
        ("noext", b"abc", 415),
        ("empty.txt", b"", 400),
        ("blank.txt", b"   \n  ", 422),
        ("broken.pdf", b"this is not a pdf", 400),
        ("broken.docx", b"this is not a docx", 400),
    ],
)
def test_bad_files_raise_clear_errors(name, data, status):
    with pytest.raises(IngestionError) as exc:
        load_document(name, data)
    assert exc.value.status_code == status


def test_pdf_without_text_mentions_ocr():
    with pytest.raises(IngestionError) as exc:
        load_document("scan.pdf", make_pdf([""]))
    assert "OCR" in exc.value.message
