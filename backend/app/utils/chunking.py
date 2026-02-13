"""Shared subtitle chunking utilities for translation tasks.

Used by both the Celery worker (tasks.py) and the synchronous
thread-based fallback (_run_translation in translate.py).
"""

# --- Chunking constants ---
CHAR_LIMIT_SAFE_CAP = 12_000   # Max chars per chunk (safety cap for API request size)
MAX_LINES_PER_BLOCK = 80       # Optimal line count per chunk (prevents LLM desync)
OVERLAP_LINES = 20             # Context overlap between chunks
MIN_LINES_FOR_SPLIT = 100      # Below this, send as single chunk


def build_chunks(lines: list[dict]) -> list[list[dict]]:
    """Split subtitle lines into context-aware chunks using a sliding window.

    Prioritizes LINE COUNT over character count to prevent LLM desynchronization.
    Short subtitle lines (common in anime) can hit 1000+ lines at low char counts,
    so line count is the primary splitting criterion.
    """
    total_lines = len(lines)
    total_chars = sum(len(l.get("original_text", "")) for l in lines)

    # Small files: send as single chunk
    if total_lines <= MIN_LINES_FOR_SPLIT and total_chars <= CHAR_LIMIT_SAFE_CAP:
        return [lines]

    # Sliding window chunking with overlap
    chunks = []
    start = 0

    while start < total_lines:
        end = min(start + MAX_LINES_PER_BLOCK, total_lines)
        current_chunk = lines[start:end]

        # Safety: if chunk exceeds char cap, shrink it
        chunk_chars = sum(len(l.get("original_text", "")) for l in current_chunk)
        while chunk_chars > CHAR_LIMIT_SAFE_CAP and end - start > 20:
            end -= 10
            current_chunk = lines[start:end]
            chunk_chars = sum(len(l.get("original_text", "")) for l in current_chunk)

        chunks.append(current_chunk)

        if end >= total_lines:
            break

        # Next chunk starts OVERLAP_LINES before the end of current chunk
        start = end - OVERLAP_LINES

    return chunks


def apply_glossary_pre(text: str, glossary: dict) -> str:
    """Mark glossary terms in source text for translation context."""
    for src, tgt in glossary.items():
        if src in text:
            text = text.replace(src, f"{src}[={tgt}]")
    return text


def apply_glossary_post(text: str) -> str:
    """Clean up glossary markers from translated text."""
    import re
    text = re.sub(r'\[=[^\]]+\]', '', text)
    return text.strip()
