"""FastAPI application entry point."""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# Import your modular routers
from app.api import documents
from app.api.retrieval import router as retrieval_router
from app.api.chat import router as chat_router
from app.core.errors import IngestionError

app = FastAPI(title="AskLens API")


@app.exception_handler(IngestionError)
async def ingestion_error_handler(_: Request, exc: IngestionError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Register all routes cleanly
app.include_router(documents.router, prefix="/api", tags=["Documents"])
app.include_router(retrieval_router, prefix="/api", tags=["Search"])
app.include_router(chat_router, prefix="/api", tags=["Chat"])
