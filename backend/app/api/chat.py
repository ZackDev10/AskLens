from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import logging
from app.api.deps import get_embedder, get_repo
from app.core.db import Repository
from app.ingestion.embedder import HuggingFaceEmbedder
import httpx

router = APIRouter()
logger = logging.getLogger(__name__)

class ChatRequest(BaseModel):
    query: str
    document_ids: list[str] = []
    lang: str = "en"

@router.post("/chat")
async def chat_stream(req: ChatRequest, repo: Repository = Depends(get_repo), embedder: HuggingFaceEmbedder = Depends(get_embedder)):
    async def generate():
        try:
            yield json.dumps({"event": "status", "data": "Searching documents..."}) + "\n"

            query_vector = embedder.embed([req.query])[0]
            hits = repo.hybrid_search(
                query_text=req.query,
                embedding=query_vector,
                match_limit=5,
                filter_doc_ids=req.document_ids if req.document_ids else None
            )

            # Low confidence fallback rule
            if not hits or max([h.get("score", 0) for h in hits]) < 0.2:
                msg = "I couldn't find this in your documents." if req.lang == "en" else "Je n'ai pas pu trouver cela dans vos documents."
                yield json.dumps({"event": "message", "data": msg}) + "\n"
                return

            yield json.dumps({"event": "sources", "data": hits}) + "\n"
            yield json.dumps({"event": "status", "data": "Generating answer..."}) + "\n"

            context_text = "\n\n".join([f"Document: {h.get('title')}\nPage: {h.get('page')}\nContent: {h.get('content')}" for h in hits])

            sys_prompt = (
                "You are AskLens, an intelligent RAG assistant.\n"
                f"Answer in the user's language: {req.lang}.\n"
                "Use structural Markdown formatting: start with a brief intro paragraph, use bullet points for key details, and end with a short conclusion.\n"
                "Rely strictly on the provided context below. Do not make up answers.\n\n"
                f"CONTEXT:\n{context_text}"
            )

            payload = {
                "model": "llama3.2",
                "messages": [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": req.query}
                ],
                "stream": True
            }

            async with httpx.AsyncClient() as client:
                async with client.stream("POST", "http://127.0.0.1:11434/api/chat", json=payload, timeout=None) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line:
                            chunk = json.loads(line)
                            if "message" in chunk and "content" in chunk["message"]:
                                yield json.dumps({"event": "message", "data": chunk["message"]["content"]}) + "\n"

        except Exception as e:
            logger.exception("Stream error")
            yield json.dumps({"event": "error", "data": "Chat stream interrupted due to an upstream error."}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
