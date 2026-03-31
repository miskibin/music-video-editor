# Music Video Creator

## Project Overview

The goal of this project is to let a user turn a song into a finished vertical music video for TikTok with minimal manual editing.

The product should take the core elements of a track, its lyrics, and a lightweight creative direction from the user, then assemble a clean video with timed subtitles, a background visual layer, and music-driven motion. The user is not building a complex timeline from scratch. They are guiding an assisted system that produces a polished short-form music video quickly.

## Main Goal

Create a focused editor and export pipeline for short-form music videos where music is the center of the project and every other element is built around it.

## Current Status

As of March 2026, the project is in early Phase 2.

The app is no longer just a visual prototype. It now has a structured frontend project model for the fixed three-layer editor, local project persistence in the browser, and support for both background images and background videos. The backend rendering and AI pipeline are still not implemented.

What works now:

- fixed 9:16 editor and preview built around the 3 product layers: background, subtitles, and music
- versioned project document and typed layer model for music, subtitle cues, background segments, and asset records
- one active project persisted locally with IndexedDB, including uploaded asset blobs across refresh
- autosave plus manual save state in the top bar
- music upload, duration probing, waveform extraction, playback, scrubbing, and trim-aware timeline editing
- subtitle cue creation and editing on a dedicated subtitle track
- background image and video upload, metadata probing, timeline placement, and preview playback
- drag, resize, selection, zoom, and inspector-based clip editing

What is still missing:

- backend API and orchestration workflows
- word-level lyric alignment from Whisper or forced alignment
- AI sourcing or generation of background media
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

## Remotion and FFmpeg

The stack should use both tools, but for different responsibilities.

- Remotion should handle composition: the vertical 9:16 scene, timed subtitles, background image or video layout, transitions, and music-reactive motion.
- FFmpeg should handle media processing: probing uploads, re-encoding incompatible files, trimming or normalizing source media, preparing proxy assets, and optimizing the final MP4.
- Word-level lyric alignment should live in the backend, not in Remotion or FFmpeg directly. That service should output timestamped JSON which Remotion can render.

## Product Phases

### Phase 1: Editor Prototype

Completed.

This phase established the UI foundation: a fixed three-track timeline metaphor, a 9:16 preview, basic clip editing, music upload and playback, waveform generation, subtitle cue editing, and background media placement.

### Phase 2: Structured Project Model

Current phase.

This phase moves the app from a loose prototype into a product-shaped editor. The frontend now uses a versioned project document, a fixed three-layer data model, a persisted single active project, saved asset blobs, and uploaded background video support. The remaining work in this phase is hardening the model, improving the editor around that model, and preparing cleaner boundaries for later backend and render work.

### Phase 3: Alignment and Media Intelligence

Add the first real backend workflows. This phase should align user-provided lyrics to audio with word-level timestamps and source or generate background visuals from lyrics plus user direction.

### Phase 4: Motion and Rendering

Introduce the actual video composition pipeline. This phase should use Remotion to render timed subtitles, background sequences, transitions, and music-reactive motion such as kick-based zooms or pulse effects.

### Phase 5: Export and Production Hardening

Finish the delivery pipeline. This phase should use FFmpeg to normalize media inputs, handle final post-processing, and export a stable TikTok-ready MP4 while adding reliability, validation, and quality controls around the full workflow.

## Development Focus

The current implementation should prioritize:

1. hardening the Phase 2 project model and persistence flow
2. adding reliable lyric-to-audio alignment with word-level timestamps
3. connecting AI-assisted background media sourcing and generation
4. implementing the Remotion composition pipeline from the saved project document
5. adding FFmpeg preprocessing and final MP4 export

## Run Locally

Prerequisite: Node.js

1. Install dependencies with `npm install`.
2. Set `GEMINI_API_KEY` in [.env.local](.env.local).
3. Start the app with `npm run dev`.
