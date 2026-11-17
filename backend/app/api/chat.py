from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import logging
import os
import httpx

from app.api.deps import get_embedder, get_repo
from app.core.db import Repository
from app.ingestion.embedder import Embedder

router = APIRouter()
logger = logging.getLogger("asklens.chat")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
PREFERRED_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


class ChatRequest(BaseModel):
    query: str
    document_ids: list[str] = []
    lang: str = "en"


async def resolve_ollama_model(client: httpx.AsyncClient) -> str:
    """Use PREFERRED_OLLAMA_MODEL if installed, otherwise fall back to the first available local Ollama model."""
    try:
        res = await client.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5.0)
        if res.status_code == 200:
            models = [m.get("name", "") for m in res.json().get("models", [])]
            if not models:
                return PREFERRED_OLLAMA_MODEL
            for m in models:
                if m == PREFERRED_OLLAMA_MODEL or m.startswith(f"{PREFERRED_OLLAMA_MODEL}:"):
                    return m
            return models[0]
    except Exception:
        pass
    return PREFERRED_OLLAMA_MODEL


@router.post("/chat")
async def chat_stream(
    req: ChatRequest,
    repo: Repository = Depends(get_repo),
    embedder: Embedder = Depends(get_embedder),
):
    async def generate():
        try:
            status_search = "Recherche dans les documents..." if req.lang == "fr" else "Searching documents..."
            yield json.dumps({"event": "status", "data": status_search}) + "\n"

            query_vector = embedder.embed([req.query])[0]
            hits = repo.hybrid_search(
                query_text=req.query,
                embedding=query_vector,
                match_limit=5,
                filter_doc_ids=req.document_ids if req.document_ids else None,
            )

            scores = [
                h.get("score") if h.get("score") is not None else h.get("similarity")
                for h in hits
                if (h.get("score") is not None or h.get("similarity") is not None)
            ]
            if not hits or (scores and max(scores) < 0.2):
                msg = (
                    "Je n'ai pas pu trouver cela dans vos documents."
                    if req.lang == "fr"
                    else "I couldn't find this in your documents."
                )
                yield json.dumps({"event": "message", "data": msg}) + "\n"
                return

            # Lookup document titles from Supabase
            doc_ids = list({h.get("document_id") for h in hits if h.get("document_id")})
            doc_map = {}
            if doc_ids:
                docs_res = repo.db.table("documents").select("id, title").in_("id", doc_ids).execute()
                doc_map = {d["id"]: d.get("title", "Untitled document") for d in (docs_res.data or [])}

            for h in hits:
                if not h.get("title"):
                    h["title"] = doc_map.get(h.get("document_id"), "Untitled document")
                if h.get("page") is None:
                    h["page"] = h.get("page_number") or (h.get("metadata") or {}).get("page", 1)

            yield json.dumps({"event": "sources", "data": hits}) + "\n"

            status_gen = "Génération de la réponse..." if req.lang == "fr" else "Generating answer..."
            yield json.dumps({"event": "status", "data": status_gen}) + "\n"

            context_text = "\n\n".join(
                [
                    f"Document: {h.get('title')}\nPage: {h.get('page')}\nContent: {h.get('content')}"
                    for h in hits
                ]
            )

            lang_label = "French" if req.lang == "fr" else "English"
            sys_prompt = (
                "You are AskLens, an intelligent RAG document assistant.\n"
                f"Always respond in {lang_label}.\n"
                "Format your response in clean Markdown: start with a short intro paragraph, use bullet points or tables for key details, and end with a brief conclusion.\n"
                "Rely strictly on the provided context below. Do not invent facts.\n\n"
                f"CONTEXT:\n{context_text}"
            )

            async with httpx.AsyncClient() as client:
                model_name = await resolve_ollama_model(client)
                payload = {
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": sys_prompt},
                        {"role": "user", "content": req.query},
                    ],
                    "stream": True,
                }

                async with client.stream(
                    "POST", f"{OLLAMA_BASE_URL}/api/chat", json=payload, timeout=None
                ) as response:
                    if response.status_code != 200:
                        err_body = (await response.aread()).decode("utf-8", errors="ignore")
                        logger.error(f"Ollama HTTP {response.status_code}: {err_body}")
                        yield json.dumps({
                            "event": "error",
                            "data": f"Ollama error ({response.status_code}): {err_body or 'Model failed to respond.'}"
                        }) + "\n"
                        return

                    async for line in response.aiter_lines():
                        if line:
                            chunk = json.loads(line)
                            if "message" in chunk and "content" in chunk["message"]:
                                yield json.dumps({"event": "message", "data": chunk["message"]["content"]}) + "\n"

        except httpx.ConnectError:
            logger.exception("Ollama connection failed")
            yield json.dumps({
                "event": "error",
                "data": "Cannot connect to Ollama on port 11434. Start it with 'ollama serve' in a terminal."
            }) + "\n"
        except Exception as e:
            logger.exception("Stream error")
            yield json.dumps({"event": "error", "data": f"Upstream error: {str(e)}"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
