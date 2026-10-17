import uuid

from app.api import deps
from app.main import app
from tests.conftest import make_docx
from tests.fakes import make_settings

TEXT = ("Returns are accepted within 30 days of delivery. " * 30).encode()


def upload(client, name="returns.txt", data=TEXT, **kw):
    return client.post("/ingest", files={"file": (name, data)}, **kw)


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_ingest_list_get_delete_flow(client):
    r = upload(client)
    assert r.status_code == 201
    body = r.json()
    assert body["duplicate"] is False and body["document"]["status"] == "ready"
    doc_id = body["document"]["id"]

    assert [d["id"] for d in client.get("/documents").json()] == [doc_id]
    assert client.get(f"/documents/{doc_id}").json()["chunk_count"] > 1
    assert client.delete(f"/documents/{doc_id}").status_code == 204
    assert client.get(f"/documents/{doc_id}").status_code == 404
    assert client.get("/documents").json() == []


def test_duplicate_upload_returns_200(client):
    assert upload(client).status_code == 201
    r = upload(client, name="copy.txt")
    assert r.status_code == 200 and r.json()["duplicate"] is True


def test_docx_upload(client):
    r = upload(client, name="warranty.docx", data=make_docx())
    assert r.status_code == 201 and r.json()["document"]["source_type"] == "docx"


def test_custom_title(client):
    r = client.post("/ingest", files={"file": ("a.txt", TEXT)}, data={"title": "Return policy"})
    assert r.json()["document"]["title"] == "Return policy"


def test_error_codes(client):
    assert upload(client, name="x.exe", data=b"abc").status_code == 415
    assert upload(client, name="e.txt", data=b"").status_code == 400
    assert upload(client, name="big.txt", data=b"x" * (1024 * 1024 + 5)).status_code == 413


def test_unknown_or_malformed_ids_are_404(client):
    assert client.get("/documents/not-a-uuid").status_code == 404
    assert client.get(f"/documents/{uuid.uuid4()}").status_code == 404
    assert client.delete(f"/documents/{uuid.uuid4()}").status_code == 404


def test_search_returns_ranked_hits(client):
    upload(client, data=TEXT)
    r = client.post("/search", json={"query": "returns delivery", "top_k": 3})
    assert r.status_code == 200
    hits = r.json()
    assert 1 <= len(hits) <= 3 and hits[0]["document_title"] == "returns"
    assert client.post("/search", json={"query": ""}).status_code == 422
    assert client.post("/search", json={"query": "x", "top_k": 99}).status_code == 422


def test_api_key_is_enforced_when_configured(client):
    app.dependency_overrides[deps.get_settings] = lambda: make_settings(api_key="s3cret")
    assert client.get("/documents").status_code == 401
    assert client.get("/documents", headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.get("/documents", headers={"X-API-Key": "s3cret"}).status_code == 200
    assert client.get("/health").status_code == 200  # health stays open
