# Music Video Creator

## Project Overview

The goal of this project is to let a user turn a song into a finished vertical music video for TikTok with minimal manual editing.

The product should take the core elements of a track, its lyrics, and a lightweight creative direction from the user, then assemble a clean video with timed subtitles, a background visual layer, and music-driven motion. The user is not building a complex timeline from scratch. They are guiding an assisted system that produces a polished short-form music video quickly.

## Main Goal

Create a focused editor and export pipeline for short-form music videos where music is the center of the project and every other element is built around it.

## Current Status

As of March 2026, the project has moved beyond the initial editor prototype and into backend-assisted timing workflows.

The app is no longer just a visual prototype. It now has a structured frontend project model for the fixed three-layer editor, local project persistence in the browser, support for both background images and background videos, and the first draft of a backend-assisted Lyric Sync workflow for subtitle timing review.

What works now:

- fixed 9:16 editor and preview built around the 3 product layers: background, subtitles, and music
- versioned project document and typed layer model for music, subtitle cues, background segments, and asset records
- one active project persisted locally with IndexedDB, including uploaded asset blobs across refresh
- autosave plus manual save state in the top bar
- music upload, duration probing, waveform extraction, playback, scrubbing, and trim-aware timeline editing
- subtitle cue creation and editing on a dedicated subtitle track
- background image and video upload, metadata probing, timeline placement, and preview playback
- draft Lyric Sync flow with a FastAPI endpoint, excerpt/language inputs, reviewable generated cues, low-confidence word highlighting, and apply-back-to-project behavior
- drag, resize, selection, zoom, and inspector-based clip editing

What is still missing:

- real audio-based word alignment from Whisper or forced alignment
- scene planning and media discovery workflows behind the Lyric Sync flow
- real transition controls and music-reactive motion controls beyond the current schema placeholders
- Remotion render pipeline
- FFmpeg ingest and post-processing pipeline
- MP4 export

## Product Constraints

These are hard constraints for the product scope:

1. Output format is always vertical video for TikTok.
2. Subtitles come from user-provided text and must be aligned to the song with word-level timestamps.
3. The composition always has exactly 3 layers:
   - music
   - subtitles
   - background image or video
4. The background layer can come from user-uploaded media.
5. The visual layer supports simple transitions and optional music-reactive motion.
6. Export format is MP4.

## Core User Flow

1. The user uploads the music track.
2. The user uploads lyrics or subtitle text.
3. The system aligns each word to the audio using a Whisper-like transcription or forced-alignment step.
4. The user chooses how the background visuals should be created:
   - upload their own image or video
5. The user selects a small set of transitions and optional music-reactive behavior such as zooming on kicks or other beat-driven moments.
6. The system renders and exports a vertical MP4.

## High-Level Feature Set

### 1. Music-First Timeline

The music track is the anchor for the whole composition. Subtitle timing, background timing, transitions, and reactive effects all follow the audio timeline.

### 2. Word-Level Subtitle Alignment

The system should support precise timing for each word, not just each sentence or line. That enables karaoke-style highlighting, cleaner subtitle pacing, and better synchronization with the song.

### 3. Fixed Three-Layer Composition

The editor should stay intentionally narrow:

- Layer 1: Music track
- Layer 2: Subtitle track
- Layer 3: Background media track

This keeps the product simple, predictable, and optimized for one use case instead of becoming a general-purpose video editor.

### 4. Cut Scoring Algorithm

Click the different ranges and watch the algorithm redistribute cuts.

Here's how the scoring logic works - every second in the song gets candidate cut points scored on a weighted system:

- **Section boundary** -> +10 (highest - always try to cut at verse/chorus transitions)
- **Held word end** -> +7 (the `~` tilde words - cut right after the note releases)
- **Energy peak** -> +6 (the waveform surges, perfect moment for a visual impact)
- **Lyric line end** -> +5 (natural phrase break)
- **Bar 1 beat** -> +4 x energy (beat 1 of every 4-beat bar, weighted by how loud that section is)
- **Regular beat onset** -> +2 x energy

Then when you pick a range like 9-15, the algorithm tries every N in that range, selects the highest-scoring non-overlapping candidates with a minimum gap enforced, and picks whichever N gave the best total score without any clip being shorter than ~2 seconds.

The cut list at the bottom shows you exactly *why* each cut was placed there. Ready to wire this into the real librosa pipeline?

### 5. Music-Reactive Motion

The background visual layer should support lightweight audio-reactive effects, such as:

- zoom on kick
- subtle pulse on beat
- pan or scale changes on energy peaks

These effects should stay simple and reusable, not fully custom animation graphs.

### 6. MP4 Export

The final output should always be a rendered MP4 in a TikTok-friendly vertical format.

## What This Product Is Not

This project should not expand into a full non-linear editor with many tracks, manual keyframing, advanced compositing, or arbitrary layouts. The value is speed, consistency, and strong defaults for music videos with subtitles.

## Suggested Technical Direction

At a high level, the product is best split into these stages:

1. Ingest the music, lyrics, and optional user media.
2. Align lyrics to audio with word-level timestamps.
3. Build the three-layer composition data.
4. Prepare and place user-provided background visuals.
5. Apply simple transitions and beat-reactive motion.
6. Render to vertical MP4.

## Remotion and FFmpeg

The stack should use both tools, but for different responsibilities.

- Remotion should handle composition: the vertical 9:16 scene, timed subtitles, background image or video layout, transitions, and music-reactive motion.
- FFmpeg should handle media processing: probing uploads, re-encoding incompatible files, trimming or normalizing source media, preparing proxy assets, and optimizing the final MP4.
- Word-level lyric alignment should live in the backend, not in Remotion or FFmpeg directly. That service should output timestamped JSON which Remotion can render.

## Development Focus

The current implementation should prioritize:

1. replacing the draft Lyric Sync heuristic with real lyric-to-audio alignment and word-level timestamps
2. improving cut-planning quality and timeline tooling around the scoring logic
3. hardening the project model and persistence flow around the new backend workflows
4. implementing the Remotion composition pipeline from the saved project document
5. adding FFmpeg preprocessing and final MP4 export

## Run Locally

Prerequisite: Node.js

1. Install dependencies with `npm install`.
2. Set `GEMINI_API_KEY` in [.env.local](.env.local).
3. Start the app with `npm run dev`.
