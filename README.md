# AskLens

Chat with your business documents, with sources you can verify.

> **Status:** step 1 of 7. Schema, ingestion, and a search inspector are done. No LLM answers yet (that's step 3). Right now you can upload documents, have them chunked and embedded, and see what hybrid search retrieves for a question.

## How it works

```
Upload   → extract text → chunk → embed → Supabase (pgvector + full-text)
Question → embed → hybrid search (vector + keyword) → RRF merge → top chunks
```

## Project structure

| Folder | What's inside |
|---|---|
| `backend/` | Python API: ingestion and hybrid search |
| `asklens-frontend/` | Streaming chat frontend |
| `db/migrations/` | SQL files for the Supabase schema |
| `eval/` | Retrieval evaluation |
| `sample-data/` | Sample documents for testing |
| `docs/` | Extra documentation |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run, in order:
   - `db/migrations/001_init.sql`
   - `db/migrations/002_hybrid_search.sql`
3. Go to **Project Settings → API** and copy the project URL and the `service_role` key (or the newer `secret` key).

> The `service_role` key stays on the server. Never put it in the mobile or frontend app.

### 2. Environment

Create `backend/.env` with your own values:

```env
SUPABASE_URL=your-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# add your embedding provider key here
```

`.env` is in `.gitignore` and must never be committed.

### 3. Run the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload      # adjust to your entry file
```

### 4. Run the frontend

```bash
cd asklens-frontend
npm install
npm start                      # adjust to your start script
```

## Tech stack

Python · TypeScript · Supabase (Postgres, pgvector, full-text search)

## License

Copyright (c) 2026 ZackDev
