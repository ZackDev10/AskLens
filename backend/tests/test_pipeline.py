import pytest

from app.core.errors import IngestionError
from app.ingestion.pipeline import IngestionService
from tests.conftest import make_pdf
from tests.fakes import FakeEmbedder, make_settings

TEXT = ("Returns are accepted within 30 days of delivery. " * 30).encode()


def test_happy_path_stores_document_and_chunks(service, repo):
    result = service.ingest("returns.txt", TEXT, title="Returns policy")
    doc = result.document
    assert not result.duplicate
    assert doc["status"] == "ready" and doc["title"] == "Returns policy"
    assert doc["chunk_count"] == len(repo.chunks) > 1
    assert doc["language"] == "en"
    row = repo.chunks[0]
    assert row["document_id"] == doc["id"] and row["char_count"] == len(row["content"])
    assert [c["chunk_index"] for c in repo.chunks] == list(range(len(repo.chunks)))


def test_title_defaults_to_filename_stem(service):
    assert service.ingest("Return-Policy.txt", TEXT).document["title"] == "Return-Policy"


def test_same_file_twice_is_detected(service, repo, embedder):
    first = service.ingest("a.txt", TEXT)
    calls = embedder.calls
    second = service.ingest("renamed.txt", TEXT)
    assert second.duplicate and second.document["id"] == first.document["id"]
    assert embedder.calls == calls  # no second embedding bill
    assert len(repo.docs) == 1


def test_pdf_records_pages_and_page_numbers(service, repo):
    pdf = make_pdf(["Delivery takes two days in Casablanca.", "Payment on delivery is available."])
    doc = service.ingest("catalog.pdf", pdf).document
    assert doc["page_count"] == 2
    assert {c["page_number"] for c in repo.chunks} == {1, 2}


def test_embedding_failure_marks_failed_and_leaves_no_chunks(repo, settings):
    service = IngestionService(repo, FakeEmbedder(fail=True), settings)
    with pytest.raises(IngestionError) as exc:
        service.ingest("a.txt", TEXT)
    assert exc.value.status_code == 502
    assert repo.chunks == []
    (doc,) = repo.docs.values()
    assert doc["status"] == "failed" and "embedding service down" in doc["error"]


def test_retry_after_failure_replaces_failed_row(repo, settings):
    with pytest.raises(IngestionError):
        IngestionService(repo, FakeEmbedder(fail=True), settings).ingest("a.txt", TEXT)
    ok = IngestionService(repo, FakeEmbedder(), settings).ingest("a.txt", TEXT)
    assert ok.document["status"] == "ready" and not ok.duplicate
    assert len(repo.docs) == 1


def test_stale_processing_row_is_replaced(service, repo):
    first = service.ingest("a.txt", TEXT).document
    repo.docs[first["id"]].update(status="processing", created_at="2020-01-01T00:00:00+00:00")
    again = service.ingest("a.txt", TEXT)
    assert not again.duplicate and again.document["status"] == "ready"


def test_fresh_processing_row_counts_as_duplicate(service, repo):
    first = service.ingest("a.txt", TEXT).document
    repo.docs[first["id"]]["status"] = "processing"
    assert service.ingest("a.txt", TEXT).duplicate


def test_oversized_file_rejected_before_any_work(repo, embedder):
    service = IngestionService(repo, embedder, make_settings(max_upload_mb=1))
    with pytest.raises(IngestionError) as exc:
        service.ingest("big.txt", b"x" * (1024 * 1024 + 1))
    assert exc.value.status_code == 413 and embedder.calls == 0 and not repo.docs


def test_bad_file_creates_no_database_rows(service, repo):
    with pytest.raises(IngestionError):
        service.ingest("scan.pdf", make_pdf([""]))
    assert not repo.docs
