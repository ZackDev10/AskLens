# AskLens

Chat with your business documents, with sources you can verify.

**Status: step 1 of 7 — schema + ingestion + a search inspector.**
No LLM answers yet (that's step 3). Right now you can upload documents, have them
chunked and embedded, and see what hybrid search retrieves for a question.

```
Upload → extract text → chunk → embed → Supabase (pgvector + full-text)
Question → embed → hybrid search (vector + keyword) → RRF merge → top chunks
```

## Setup (about 15 minutes)

### 1. Supabase
1. Create a project at supabase.com.
2. Open **SQL Editor** and run, in order:
   - `db/migrations/001_init.sql`
   - `db/migrations/002_hybrid_search.sql`
3. **Project Settings → API**: copy the project URL and the `service_role` key
   (or the newer *secret* key). This key stays on the server. Never put it in the mobile app.

### 2. Environment
```bash
cp .env.example .env      # then fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY
```

### 3. Run the backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
pytest                             # 40 tests, no internet or keys needed
uvicorn app.main:app --reload
```
Open **http://127.0.0.1:8000/docs**. That's an interactive page where you can try every endpoint.

## Try it

1. **POST /ingest** → choose a file from `sample-data/` (English, French, Arabic, PDF).
   You should get `201` with `"status": "ready"` and a `chunk_count`.
2. Upload the same file again → `200` with `"duplicate": true` (no second embedding cost).
3. **POST /search** with these bodies and check the top hit:
   - `{"query": "How many days do I have to return an item?"}` → returns policy
   - `{"query": "paiement à la livraison"}` → French delivery FAQ
   - `{"query": "ما هي مدة الضمان؟"}` → Arabic warranty document
   - `{"query": "How do I change the lamp brightness?"}` → PDF, with `page_number`
4. In Supabase → **Table Editor**: `documents` (status = ready) and `chunks` (content, page_number, embedding).

Embedding all the sample files costs a fraction of a cent.

## Endpoints

| Method | Path | What it does |
|---|---|---|
| POST | `/ingest` | Upload PDF / DOCX / TXT / MD (multipart `file`, optional `title`) |
| GET | `/documents` | List documents and their status |
| GET | `/documents/{id}` | One document |
| DELETE | `/documents/{id}` | Delete it and all its chunks |
| POST | `/search` | `{query, top_k}` → ranked chunks (retrieval only, no LLM) |
| GET | `/health` | Liveness check |

Set `API_KEY` in `.env` to require an `X-API-Key` header on everything except `/health`.

## Design decisions (worth mentioning to clients)

- **Hybrid search**: vector similarity finds meaning, full-text finds exact terms
  (product codes, names). Results are merged with Reciprocal Rank Fusion.
- **Multilingual**: the keyword index uses the `simple` text config (no stemming), so it behaves
  the same in English, French and Arabic. Embeddings come from a multilingual model.
- **Fail fast, fail clean**: bad files are rejected before any database write or API cost;
  a failed embedding run leaves a `failed` row with the error and no half-indexed chunks.
- **De-duplication**: files are hashed (SHA-256), so re-uploading never double-indexes.
- **Security**: RLS is on with no policies, so only the backend key can read or write.

## Known limits (on purpose, for now)

- Scanned PDFs need OCR first (they are rejected with a clear message).
- Some Arabic PDFs can extract in the wrong order with `pypdf`. If you hit that, test the same
  file as DOCX/TXT, or swap the PDF loader for PyMuPDF.
- Save TXT files as UTF-8.
- URL ingestion is not included yet: fetching user-supplied URLs needs an SSRF guard first.
- Keyword matching is OR-based and unranked by rarity, so very common words add some noise.
  We tune this in step 2 using the evaluation set.
- Everything lives in one shared knowledge base; per-client workspaces come later.

## Layout

```
db/migrations/      SQL: tables, indexes, RLS, hybrid_search()
backend/app/
  api/              routes + dependency wiring
  core/             settings, database layer, errors
  ingestion/        loaders, chunker, embedder, pipeline
  retrieval/        search entry point
backend/tests/      40 offline tests (fakes for Supabase/OpenAI)
sample-data/        fictional "Atlas Home Store" documents (EN / FR / AR / PDF)
eval/  docs/        used in later steps
```
