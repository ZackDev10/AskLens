# AskLens — Project Status Report

**Gig:** AI Engineering — AskLens  
**Tagline:** *Chat with your business documents, with sources you can verify.*  
**Report date:** 21 September 2026  
**Current phase:** Phase 1 — Supabase schema & ingestion (actively starting)  
**Overall progress:** Step 1 of 7 in the agreed build order  

---

## Project Overview

AskLens is an AI assistant that answers questions from a company’s own documents—PDFs, Word files, and web pages. It retrieves the most relevant passages with **hybrid search** (semantic vector search + keyword/full-text search), **streams answers token-by-token** in real time, and **cites exact sources** for every claim so answers are verifiable.

Key product differentiators for the demo and Fiverr positioning:

- Works in **English, French, and Arabic** (multilingual niche vs. English-only demos).
- Demo knowledge base: a fictional small business (e.g. online store with return policies, FAQs, and product manuals).
- Automatic **LLM provider failover** if the primary model errors or times out.
- **Refusal behavior** when the answer is not in the documents (“I couldn’t find that”) instead of hallucinating.

**MVP scope (from gig brief):** document upload (PDF, DOCX, TXT) or URL paste; ingestion → embeddings in Supabase/pgvector; hybrid retrieval with reciprocal rank fusion; streamed answers with clickable citations; failover; grounded refusal; and a ~25-question evaluation set for measurable accuracy.

**Planned later (post-MVP):** reranking, chat history, per-client workspaces, and a mobile app client.

**High-level architecture:**

```
Upload → Extract text → Chunk → Embed → Supabase (pgvector + FTS)
                                                   │
Question → Embed → Hybrid search (vector + keyword) → Merge (RRF)
                                                   │
                     Top chunks + question → LLM (primary → fallback)
                                                   │
                        Streamed answer + citations → Client
```

---

## Current Status (Phase 1)

**Phase goal:** Stand up the Supabase schema and build the ingestion pipeline so **one document can run end-to-end**—extract text, split into chunks, create embeddings, and persist them for later retrieval.

### What we are actively working on

| Workstream | Focus |
|---|---|
| **Supabase schema** | Tables, indexes, RLS posture, and vector storage for documents and chunks |
| **Ingestion pipeline** | Loaders → chunker → embedder → store; prove one document reaches “ready” with embeddings |
| **Backend foundation** | FastAPI app structure, config, DB access, and offline tests around ingestion |

### Backend stack in use

| Layer | Choice | Role in Phase 1 |
|---|---|---|
| **API** | **FastAPI (Python)** | `/ingest` and document management routes; foundation for later `/chat` SSE |
| **Database** | **Supabase Postgres + pgvector** | Persist documents/chunks and embeddings; FTS hooks prepared for hybrid search |
| **Embeddings** | Embedding model (via configured provider) | Chunk → vector for semantic retrieval in Phase 2+ |
| **Client** | Deferred (Expo / simple web) | Not required to close Phase 1 |

### Target Phase 1 outcome

A single uploaded sample document (from the fictional company demo set) successfully:

1. Has text extracted (PDF / DOCX / TXT as applicable)  
2. Is split into retrieval-friendly chunks  
3. Has embeddings generated  
4. Is stored in Supabase with a clear ready/failed status  

Until that loop is solid, Phase 2 (search) and Phase 3 (chat) remain blocked.

### Context notes for stakeholders

- Build order step 1 is intentionally **no LLM answers yet**—answers arrive in Phase 3.  
- Repo layout already anticipates later modules (`retrieval/`, `llm/`, `eval/`, client). Phase 1 should keep the focus narrow: **schema + one-document ingestion**.  
- Multilingual sample docs (EN/FR/AR) and hybrid-search SQL may appear early in the codebase; for status purposes, **Phase 1 is “closed” when end-to-end ingest is reliable**, not when chat is live.

---

## Upcoming Phases

Subsequent steps from the build order (on deck after Phase 1):

| Phase | Build-order step | Deliverable |
|---|---|---|
| **Phase 2** | Step 2 | **Vector search**, **keyword search**, and **reciprocal rank fusion (RRF)** so a query returns ranked, relevant chunks |
| **Phase 3** | Step 3 | **Chat endpoint** with **streaming over SSE** and **source citations** attached to the answer |
| **Phase 4** | Step 4 | **LLM failover** to a fallback provider, plus **“not found” refusal** when the corpus does not support an answer |

**Still later in the build order (not yet on the critical path):**

5. Evaluation set (~25 Q&A pairs) and reported accuracy results  
6. Client UI (Expo chat screen or a minimal web page)  
7. README polish, demo video, and gig screenshots  

---

## Action Items & Next Steps

Immediate coding tasks to **close Phase 1** and unlock Phase 2:

### Phase 1 exit checklist

- [ ] Finalize / apply Supabase migrations (documents, chunks, pgvector column, indexes, RLS for service-role-only access)
- [ ] Confirm `.env` wiring (`SUPABASE_URL`, service key, embedding API key) and `/health` responds
- [ ] Complete text loaders for MVP file types (PDF, DOCX, TXT); reject unsupported/scanned cases cleanly
- [ ] Implement chunking with stable metadata (e.g. document id, chunk index, optional page number)
- [ ] Wire embedder so every chunk gets a vector before write
- [ ] Complete ingestion pipeline: upload → extract → chunk → embed → store → status `ready` (or `failed` with error, no orphan half-index)
- [ ] Prove **one document end-to-end** against `sample-data/` (success response + rows visible in Supabase)
- [ ] Add/keep offline tests for loaders, chunker, and pipeline (no live keys required)
- [ ] Optional but useful before Phase 2: document list/get/delete and SHA-256 de-dupe so re-uploads do not double-embed

### Definition of done (Phase 1 → Phase 2)

Phase 1 is done when a teammate can upload one sample file, see `status: ready` and a non-zero `chunk_count`, and confirm embeddings exist in Supabase—without needing chat or LLMs.

### First tasks for Phase 2 (once checklist is green)

- [ ] Query-time embedding for the user question  
- [ ] Vector similarity search over `chunks`  
- [ ] Postgres full-text / keyword search  
- [ ] Merge ranked lists with reciprocal rank fusion and expose a retrieval-only search path for inspection  

---

## Risks & Watch Items (Phase 1)

| Risk | Mitigation |
|---|---|
| Scanned PDFs / bad Arabic PDF text order | Fail clearly; prefer DOCX/TXT for demos until OCR / better PDF loader |
| Embedding cost / re-upload loops | Content hash de-dupe before re-embedding |
| Scope creep into chat/UI | Keep Phase 1 exit criteria = one doc ingested; defer SSE and client |
| URL ingestion SSRF | Out of Phase 1 MVP path until a fetch guard exists |

---

## Summary

AskLens is an AI Engineering gig to ship a citable, multilingual document Q&A product on **FastAPI + Supabase Postgres/pgvector**. We are **actively starting Phase 1**: schema + ingestion so one document runs extract → chunk → embed → store. Next up are hybrid retrieval (Phase 2), streaming chat with citations (Phase 3), then failover and grounded refusal (Phase 4). Closing the Phase 1 checklist above is the critical path to search and demo-ready answers.
