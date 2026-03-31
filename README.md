# Music Video Creator

## Project Overview

The goal of this project is to let a user turn a song into a finished vertical music video for TikTok with minimal manual editing.

The product should take the core elements of a track, its lyrics, and a lightweight creative direction from the user, then assemble a clean video with timed subtitles, a background visual layer, and music-driven motion. The user is not building a complex timeline from scratch. They are guiding an assisted system that produces a polished short-form music video quickly.

## Main Goal

Create a focused editor and export pipeline for short-form music videos where music is the center of the project and every other element is built around it.

## Product Constraints

These are hard constraints for the product scope:

1. Output format is always vertical video for TikTok.
2. Subtitles come from user-provided text and must be aligned to the song with word-level timestamps.
3. The composition always has exactly 3 layers:
   - music
   - subtitles
   - background image or video
4. The background layer can come from either:
   - user-uploaded media
   - AI-assisted media selection or generation based on lyrics plus a user prompt
5. The visual layer supports simple transitions and optional music-reactive motion.
6. Export format is MP4.

## Core User Flow

1. The user uploads the music track.
2. The user uploads lyrics or subtitle text.
3. The system aligns each word to the audio using a Whisper-like transcription or forced-alignment step.
4. The user chooses how the background visuals should be created:
   - upload their own image or video
   - let AI find open-source visuals based on lyric meaning and prompt context
   - let AI generate visuals when suitable
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

### 4. AI-Assisted Background Visuals

When the user does not upload their own media, the system should construct a prompt from:

- the lyrics
- the user's creative direction
- optional song mood, genre, tempo, or theme cues

That prompt can then be used to:

- search open-source image and video sources
- rank candidate assets
- generate new images or videos with AI

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
4. Source or generate background visuals from lyrics and prompt context.
5. Apply simple transitions and beat-reactive motion.
6. Render to vertical MP4.

## Development Focus

The current implementation should prioritize:

1. locking the product to a vertical 9:16 composition
2. defining the three-layer data model clearly
3. adding reliable lyric-to-audio alignment
4. connecting AI-assisted media sourcing for the background layer
5. implementing a stable MP4 export pipeline

## Run Locally

Prerequisite: Node.js

1. Install dependencies with `npm install`.
2. Set `GEMINI_API_KEY` in [.env.local](.env.local).
3. Start the app with `npm run dev`.
