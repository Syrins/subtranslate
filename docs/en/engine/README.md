# Engine Documentation (EN)

This document describes translation and media processing engine layers used by the platform.

## 1. Scope

This section covers two engine categories:
- AI translation engines (`openai`, `deepl`, `gemini`)
- media export engine (FFmpeg-based burn-in/mux)

## 2. Translation Pipeline Overview

Pipeline stages:
1. job is created (`queued`)
2. worker sets job to `processing`
3. subtitle file is parsed
4. chunking strategy is applied
5. each chunk is sent to selected engine
6. translated lines are merged by line number
7. output file is written
8. job becomes `completed` or `failed`

## 3. Chunking Strategy

Core constants:
- `CHAR_LIMIT_SAFE_CAP = 12000` — safety cap for API request size
- `MAX_LINES_PER_BLOCK = 80` — optimal line count per chunk (prevents LLM desync)
- `OVERLAP_LINES = 20` — context overlap between chunks
- `MIN_LINES_FOR_SPLIT = 100` — below this, send as single chunk

Rules:
- **Line count is the primary splitting criterion**, not character count
- Small files (≤100 lines AND ≤12K chars) → single chunk
- Larger files → sliding window with 80-line blocks and 20-line overlap
- Character cap is a safety net only (shrinks block if exceeded)

Overlap handling:
- First chunk: no overlap, all lines are translated
- Subsequent chunks: first 20 lines are context-only (from previous block)
- The AI is instructed to NOT translate overlap lines (prompt engineering)
- Post-processing safety net strips overlap if the model ignores the instruction
- `translated_map` deduplication ensures no line is written twice

Goals:
- prevent LLM line drift / desynchronization on long files
- maintain character voice and tone consistency across chunks
- stay within token/request limits

## 4. Supported AI Engines

### 4.1 OpenAI Engine
- Uses async OpenAI client.
- Uses numbered subtitle prompt style.
- Parses numbered output back to line slots.

### 4.2 DeepL Engine
- Uses DeepL Python client.
- Runs blocking translation call inside executor.
- Uses language mapping table (`DEEPL_LANG_MAP`).

### 4.3 Gemini Engine
- Uses Google GenAI client.
- Executes generation in executor.
- Parses numbered output similarly.

## 5. Prompt and Output Contract

### System Prompt (Adaptive Localization)
The system prompt teaches the AI *how to think* about translation rather than giving fixed rules:
- **Power dynamics analysis** — detect dominant/submissive/equal speakers
- **Emotional temperature matching** — romantic vs intense vs comedy
- **Character voice consistency** — infer character type from context
- **Fluidity over literalism** — adapt idioms, never translate literally
- Technical rules: preserve numbering, ASS tags, stutters, sound effects

### Overlap-Aware User Message
For chunks after the first:
- Previous translated lines are provided as tone/character reference
- Overlap lines are explicitly marked as "CONTEXT ONLY — do NOT translate"
- The AI is told to start output from line N+1

### Output Parsing
- `_parse_numbered_response` extracts translated lines
- **Post-processing safety net**: if model ignores overlap instruction and translates all lines, the first N overlap lines are stripped automatically
- Pads missing lines with empty strings
- Trims overflow lines

This keeps output length aligned with expected subtitle line count.

## 6. Glossary Behavior

When glossary is enabled:
- pre-processing injects markers (`term[=target]`)
- post-processing removes markers from translated output

Purpose:
- improve consistency for domain-specific terminology
- preserve named entities and product terms

## 7. Retry and Fault Tolerance

Engine-level:
- `tenacity` retry with exponential backoff

Worker-level:
- Celery task retry (`max_retries`, `default_retry_delay`)
- status/error persisted into job records

## 8. Cost Calculation

Translation cost model:
- `translation_engines.cost_per_line` x `total_lines`

Result is persisted as `cost_usd` at job completion.

## 9. Media Export Engine (FFmpeg)

Supported modes:
- burn-in subtitles
- soft-sub mux

Main functions:
- `burn_subtitles(...)`
- `mux_subtitles(...)`
- `probe_file(...)`
- `extract_all_subtitles(...)`

Codec options:
- h264, h265, vp9, av1, copy

Progress tracking:
- FFmpeg `-progress` output is mapped to job progress updates.

## 10. Performance and Quality Tuning

Quality:
- keep context enabled
- set source/target languages correctly
- use glossary for domain consistency

Performance:
- avoid oversized chunks
- tune worker concurrency to host capacity
- choose engine based on API limits and latency profile

## 11. Adding a New Translation Engine

1. Implement `TranslationEngine` interface.
2. Follow `translate_batch()` contract.
3. Keep numbered output parsing strategy.
4. Register class in `get_engine()` factory map.
5. Add env/config wiring.
6. Add admin-side engine configuration record.

## 12. Risks and Safeguards

Risks:
- model output may break line alignment
- external API timeouts/rate limits
- long-running encode tasks may be cancelled mid-flight

Safeguards:
- parse pad/trim strategy
- retry with backoff
- multiple cancellation checkpoints
- queue-based execution to protect API responsiveness

