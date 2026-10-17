from typing import AsyncIterator
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

    # A dummy response with Markdown to test the UI parser
    fake_text = "This is a **live stream** directly from your backend! \n\nIf you can read this, your React frontend is 100% perfect, and the bug is isolated entirely to the Google Gemini API."

    # Simulate a network stream delay
    for word in fake_text.split(" "):
        yield {"data": word + " "}
        await asyncio.sleep(0.05)

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
        response = await get_gemini().aio.models.generate_content_stream(
            model="gemini-3.8-flash",
            contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system_prompt),
        )

        async for chunk in response:
            if chunk.text:
                yield {"data": chunk.text}

    except Exception:
        import logging
        logging.getLogger("asklens.chat").exception("chat_stream streaming failed")
        # Yield an SSE error frame instead of crashing the already-open stream
        yield {"event": "error", "data": "Chat stream interrupted due to an upstream error."}

@router.post("/chat")
async def chat_stream(
    req: ChatRequest,
    # TEMPORARILY COMMENT OUT DEPENDENCIES TO AVOID RAM CRASH
    # repo: Repository = Depends(get_repo),
    # embedder: HuggingFaceEmbedder = Depends(get_embedder),
):
    try:
        # BYPASS EMBEDDER AND DB SEARCH
        # query_vector = embedder.embed([req.query])[0]
        # hits = repo.hybrid_search(req.query, query_vector, match_limit=5)

        # INJECT FAKE CONTEXT TO TEST FRONTEND UI
        hits = [
            {
                "page_number": 1,
                "content": "JSON (JavaScript Object Notation) is a lightweight data-interchange format. It is easy for humans to read and write, and easy for machines to parse and generate."
            }
        ]

        return EventSourceResponse(stream_gemini_response(req.query, hits))

    except HTTPException:
        raise
    except Exception:
        import logging
        logging.getLogger("asklens.chat").exception("chat_stream setup failed")
        raise HTTPException(status_code=500, detail="Chat request failed")
