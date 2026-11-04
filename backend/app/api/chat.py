import asyncio
import json
import httpx
from typing import AsyncIterator, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.api.deps import get_embedder, get_repo
from app.core.db import Repository
from app.ingestion.embedder import HuggingFaceEmbedder

router = APIRouter()

class ChatRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    history: list = []
    document_ids: Optional[List[str]] = []

async def stream_ollama_response(
    query: str, context_chunks: list[dict]
) -> AsyncIterator[dict]:

    # 1. THRESHOLD CHECK (Keep at 0.0 to test your DB's raw score outputs)
    CONFIDENCE_THRESHOLD = 0.0
    valid_chunks = [c for c in context_chunks if c.get("similarity", c.get("distance", 1.0)) >= CONFIDENCE_THRESHOLD]

    if not valid_chunks:
        yield {"data": "I couldn't find this in your documents."}
        return


    # 2. FORMAT AND SEND SOURCES TO FRONTEND
    sources = []
    for chunk in valid_chunks:
        sources.append({
            # Grab the exact filename we mapped from the database!
            "title": chunk.get("filename", "Unnamed Document"),
            "page": chunk.get("page_number", "N/A"),
            "content": chunk.get("content", ""),
            "score": chunk.get("similarity", chunk.get("distance", 0))
        })

    # Fire the sources event to build the UI chips
    yield {"event": "sources", "data": json.dumps(sources)}

    # 3. GENERATE OLLAMA RESPONSE
    context_text = "\n\n".join(
        f"Source: {s['title']} (Page {s['page']}):\n{s['content']}"
        for s in sources
    )

    system_prompt = (
        "You are AskLens, an AI assistant. Answer the user's question based ONLY "
        "on the provided context. If the answer is not in the context, say 'I couldn't find that'. "
        "CRITICAL INSTRUCTION: Detect the language of the user's question (e.g., English or French) "
        "and generate your entire response in that exact same language. "
        "Always cite your sources using the provided page numbers."
    )

    prompt = f"Context:\n{context_text}\n\nQuestion: {query}"

    payload = {
        "model": "qwen2.5-coder:3b",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "stream": True
    }

    try:
        # Stream asynchronously from your local Ollama instance
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                "http://localhost:11434/api/chat",
                json=payload,
                timeout=None
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line:
                        chunk_data = json.loads(line)
                        if "message" in chunk_data and "content" in chunk_data["message"]:
                            yield {"data": chunk_data["message"]["content"]}

    except httpx.ConnectError:
        import logging
        logging.getLogger("asklens.chat").exception("Ollama connection failed")
        yield {"event": "error", "data": "Failed to connect to Ollama. Make sure it is running locally."}
    except Exception:
        import logging
        logging.getLogger("asklens.chat").exception("Ollama streaming failed")
        yield {"event": "error", "data": "Chat stream interrupted due to an upstream error."}

@router.post("/chat")
async def chat_stream(
    req: ChatRequest,
    repo: Repository = Depends(get_repo),
    embedder: HuggingFaceEmbedder = Depends(get_embedder),
):
    try:
        # 1. Convert query to vector
        query_vector = embedder.embed([req.query])[0]

        # 2. Search Supabase
        hits = repo.hybrid_search(
            req.query,
            query_vector,
            match_limit=5,
            filter_doc_ids=req.document_ids if req.document_ids else None
        )

        # --- NEW FIX FOR UNNAMED DOCUMENTS ---
        doc_ids = list(set([h.get("document_id") for h in hits if h.get("document_id")]))

        if doc_ids:
            # 1. Change "id, filename" to "id, title"
            docs_res = repo.db.table("documents").select("id, title").in_("id", doc_ids).execute()

            # 2. Change d["filename"] to d.get("title")
            doc_map = {d["id"]: d.get("title", "Unnamed Document") for d in docs_res.data}

            for h in hits:
                h["filename"] = doc_map.get(h.get("document_id"), "Unnamed Document")
        # --------------------------------------

        # 3. Stream from Ollama
        return EventSourceResponse(stream_ollama_response(req.query, hits))

    except HTTPException:
        raise
    except Exception:
        import logging
        logging.getLogger("asklens.chat").exception("chat_stream setup failed")
        raise HTTPException(status_code=500, detail="Chat request failed")
