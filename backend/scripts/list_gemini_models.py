"""Temporary diagnostic: list models the Gemini API actually exposes in this
project, and probe which of them can stream a generateContentStream call.

Usage:  python scripts/list_gemini_models.py
Delete once the model id is pinned in app/api/chat.py.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from google import genai  # noqa: E402

from app.core.config import get_settings  # noqa: E402

# Candidates to verify with an actual streaming call, best-first.
CANDIDATES = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash-001",
]


def main() -> int:
    key = get_settings().gemini_api_key
    if not key:
        print("GEMINI_API_KEY missing")
        return 1

    client = genai.Client(api_key=key)
    print(f"key: {key[:6]}...{key[-4:]} (len={len(key)})\n")

    print("=== models.list() ===")
    names: list[str] = []
    try:
        for m in client.models.list():
            raw = getattr(m, "name", "") or ""
            short = raw.split("/")[-1]
            methods = sorted(getattr(m, "supported_actions", None) or [])
            names.append(short)
            print(f"  {raw:<50} actions={methods}")
    except Exception as e:  # noqa: BLE001
        print(f"  list() failed: {type(e).__name__}: {e}")

    # Older SDKs expose list() on an async client only.
    if not names:
        async def _alist():
            return [m.name.split("/")[-1] async for m in await client.aio.models.list()]

        try:
            names = asyncio.run(_alist())
            print("\n=== models.list() (aio) ===")
            for n in sorted(names):
                print(f"  {n}")
        except Exception as e:  # noqa: BLE001
            print(f"  aio list() failed: {type(e).__name__}: {e}")

    print("\n=== streaming probe ===")
    ok: list[str] = []
    for name in CANDIDATES:
        if names and name not in names:
            print(f"  {name:<28} SKIP (not in list())")
            continue

        async def _try(model: str = name) -> str | None:
            try:
                stream = await client.aio.models.generate_content_stream(
                    model=model, contents="Reply with the single word: ok"
                )
                chunks = []
                async for c in stream:
                    if c.text:
                        chunks.append(c.text)
                return "".join(chunks)[:40] or "<empty>"
            except Exception as e:  # noqa: BLE001
                return f"{type(e).__name__}: {str(e)[:110]}"

        result = asyncio.run(_try())
        good = result is not None and not result.startswith(
            ("ClientError", "ServerError", "AttributeError", "NotFound")
        )
        if good:
            ok.append(name)
        print(f"  {name:<28} {'OK -> ' + result if good else result}")

    print("\n=== summary ===")
    print(f"streamable: {ok or 'none'}")
    print(f"recommend: {ok[0] if ok else 'NONE - investigate above'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())