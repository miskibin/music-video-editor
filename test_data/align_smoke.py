#!/usr/bin/env python3
"""Smoke test: align test_data audio + lyrics. From repo root:

    uv run --directory backend python test_data/align_smoke.py

Requires ffmpeg on PATH. First run downloads Whisper / align models (slow).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from whisperx_align import run_whisperx_alignment  # noqa: E402


def audio_duration(path: Path) -> float:
    r = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(r.stdout.strip())


def main() -> None:
    audio = ROOT / "test_data" / "guitar skolim ale nie.mp3"
    text_path = ROOT / "test_data" / "text.txt"
    if not audio.exists():
        print("Missing:", audio)
        sys.exit(1)
    if not text_path.exists():
        print("Missing:", text_path)
        sys.exit(1)

    text = text_path.read_text(encoding="utf-8")
    end = min(audio_duration(audio), 45.0)

    print("Audio:", audio.name, "| excerpt 0s–", round(end, 1), "s | lang=pl")
    aligned = run_whisperx_alignment(str(audio), "pl", text, 0.0, end)

    segs = aligned.get("segments") or []
    words = aligned.get("word_segments") or []
    print("Segments:", len(segs), "| words:", len(words))
    if words:
        sample = words[:8]
        for w in sample:
            word = w.get("word", "")
            print(f"  {w.get('start', 0):.2f}-{w.get('end', 0):.2f}  {ascii(word)}")
    print("OK")


if __name__ == "__main__":
    main()
