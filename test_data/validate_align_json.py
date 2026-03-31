"""
Validate a saved /api/lyric-sync/subtitles/align JSON against a lyrics file.

Usage (from repo root):
  python test_data/validate_align_json.py test_data/last_align_response.json test_data/text.txt

Exits 0 if flattened cue words match extract_words(lyrics); otherwise prints a diff summary and exits 1.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Match backend subtitle_common.WORD_PATTERN (simplified inline to avoid PYTHONPATH)
WORD_PATTERN = re.compile(r"[0-9A-Za-zÀ-ž]+(?:['’-][0-9A-Za-zÀ-ž]+)?", re.UNICODE)


def extract_words(text: str) -> list[str]:
    return WORD_PATTERN.findall(text)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    json_path = Path(sys.argv[1])
    lyrics_path = Path(sys.argv[2])
    data = json.loads(json_path.read_text(encoding="utf-8"))
    lyrics = lyrics_path.read_text(encoding="utf-8")
    expected = extract_words(lyrics)
    flat: list[str] = []
    for cue in data.get("cues", []):
        for w in cue.get("words", []):
            flat.append(str(w.get("text", "")))
    print(f"Lyrics file words: {len(expected)}")
    print(f"JSON flattened words: {len(flat)}")
    if flat == expected:
        print("OK: JSON words match lyrics token-for-token.")
        return 0
    print("MISMATCH: response is not the same token sequence as the lyrics file.", file=sys.stderr)
    n = min(len(flat), len(expected))
    for i in range(n):
        if flat[i] != expected[i]:
            print(f"  First diff at index {i}: JSON={flat[i]!r} lyrics={expected[i]!r}", file=sys.stderr)
            break
    else:
        if len(flat) != len(expected):
            print(f"  Length only: json={len(flat)} lyrics={len(expected)}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
