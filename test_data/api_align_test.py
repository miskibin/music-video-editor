"""POST /api/lyric-sync/subtitles/align with test_data audio + lyrics.

Usage (from repo root):

    uv run --directory backend --with requests python test_data/api_align_test.py

Set API_BASE_URL if the server is not on http://127.0.0.1:8000 (default).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

try:
    import requests
except ImportError:
    print("Install: uv pip install requests", file=sys.stderr)
    raise SystemExit(1) from None

BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
AUDIO = ROOT / "test_data" / "clip.mp3"
TEXT = ROOT / "test_data" / "text.txt"


def main() -> None:
    text = TEXT.read_text(encoding="utf-8")
    url = f"{BASE}/api/lyric-sync/subtitles/align"

    with AUDIO.open("rb") as audio_f:
        r = requests.post(
            url,
            files={"audio": (AUDIO.name, audio_f, "audio/mpeg")},
            data={
                "language": "pl",
                "excerptStart": "0",
                "excerptEnd": "45",
                "sourceText": text,
            },
            timeout=900,
        )

    print("HTTP", r.status_code)
    if r.status_code != 200:
        print(r.text[:2000])
        sys.exit(1)

    body = r.json()
    print("provider:", body.get("provider"))
    print("cues:", len(body.get("cues", [])))
    for i, c in enumerate(body.get("cues", [])[:5]):
        n = len(c.get("words", []))
        print(f"  cue[{i}] start={c['start']:.2f}s duration={c['duration']:.2f}s words={n}")

    out = ROOT / "test_data" / "last_align_response.json"
    out.write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", out.relative_to(ROOT))


if __name__ == "__main__":
    main()
