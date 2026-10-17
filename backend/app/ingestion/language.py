"""Best-effort language tag for a document (stored for display / filtering)."""
from langdetect import DetectorFactory, detect

DetectorFactory.seed = 0  # make results deterministic


def detect_language(text: str) -> str | None:
    sample = text[:3000]
    letters = [c for c in sample if c.isalpha()]
    if not letters:
        return None
    arabic = sum(1 for c in letters if "\u0600" <= c <= "\u06ff")
    if arabic / len(letters) > 0.4:
        return "ar"
    try:
        return detect(sample)
    except Exception:
        return None
