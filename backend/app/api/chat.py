import asyncio
from typing import AsyncIterator
from fastapi import APIRouter, Depends, HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.api.deps import get_embedder, get_repo
from app.core.config import get_settings
from app.core.db import Repository
from app.ingestion.embedder import HuggingFaceEmbedder

router = APIRouter()

_client: genai.Client | None = None

def get_gemini() -> genai.Client:
    """Lazily build the SDK client so importing this module never needs a key."""
    global _client
    if _client is None:
        key = get_settings().gemini_api_key
        if not key:
            raise HTTPException(status_code=500, detail="Missing GEMINI_API_KEY in .env file.")

        # Strip hidden newlines/spaces before passing it to the client
        _client = genai.Client(api_key=key.strip())
    return _client

class ChatRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)

async def stream_gemini_response(
    query: str, context_chunks: list[dict]
) -> AsyncIterator[dict]:

    # Format the retrieved chunks from Supabase into a single context string
    context_text = "\n\n".join(
        f"Source (Page {chunk.get('page_number', 'N/A')}):\n{chunk.get('content', '')}"
        for chunk in context_chunks
    )

    system_prompt = (
        "You are AskLens, an AI assistant. Answer the user's question based ONLY "
        "on the provided context. If the answer is not in the context, say 'I couldn't find that'. "
        "Always cite your sources using the provided page numbers."
    )

    prompt = f"Context:\n{context_text}\n\nQuestion: {query}"

    try:
        # Stream the actual response from Gemini
        response = await get_gemini().aio.models.generate_content_stream(
            model="gemini-3.5-flash", # Note: Updated from 3.8 to a valid model version, though 1.5 is also fine
            contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system_prompt),
        )

        async for chunk in response:
            if chunk.text:
                yield {"data": chunk.text}

    except Exception:
        import logging
        logging.getLogger("asklens.chat").exception("chat_stream streaming failed")
        yield {"event": "error", "data": "Chat stream interrupted due to an upstream error."}

@router.post("/chat")
async def chat_stream(
    req: ChatRequest,
    # Restore dependencies so we can connect to the database and embedder
    repo: Repository = Depends(get_repo),
    embedder: HuggingFaceEmbedder = Depends(get_embedder),
):
    try:
        # 1. Convert the user's chat question into a vector embedding
        query_vector = embedder.embed([req.query])[0]

        # 2. Search Supabase for the top 5 most relevant document chunks
        hits = repo.hybrid_search(req.query, query_vector, match_limit=5)

        # 3. Pass the actual Supabase chunks into the Gemini stream
        return EventSourceResponse(stream_gemini_response(req.query, hits))

    except HTTPException:
        raise
    except Exception:
        import logging
        logging.getLogger("asklens.chat").exception("chat_stream setup failed")
        raise HTTPException(status_code=500, detail="Chat request failed")
