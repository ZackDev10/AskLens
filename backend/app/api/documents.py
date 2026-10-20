import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()

# Ensure the upload directory exists
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../sample-data"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    try:
        # Save the file to disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # TODO: You can import and trigger your ingestion script here!
        # ingest_doc(file_path)

        return {"filename": file.filename, "message": "File uploaded and ready for processing!"}

    except Exception as e:
        import logging
        logging.getLogger("asklens.upload").exception("Upload failed")
        raise HTTPException(status_code=500, detail="Failed to save file.")
