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
- `CHAR_LIMIT_SINGLE = 35000`
- `CHAR_LIMIT_MEDIUM = 60000`
- `MAX_LINES_PER_BLOCK = 300`
- `OVERLAP_LINES = 20`

Rules:
- small content -> single chunk
- medium content -> block-based chunks
- large content -> capped line blocks
- overlap lines preserve context continuity

Goals:
- avoid token/request limits
- maintain translation consistency
- improve reliability on large files

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

Prompt pattern:
- input lines are numbered (`1.`, `2.`, ...)
- model is instructed to return translation only
- same numbering semantics are expected

Output parsing:
- `_parse_numbered_response` extracts translated lines
- pads missing lines with empty strings
- trims overflow lines

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

