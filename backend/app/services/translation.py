import asyncio
import re as _re
from typing import Optional
from tenacity import retry, stop_after_attempt, wait_exponential, RetryError
import structlog
import openai
import deepl
from google import genai

logger = structlog.get_logger()

LANG_NAMES = {
    "tr": "Turkish", "en": "English", "ja": "Japanese", "ko": "Korean",
    "zh": "Chinese", "fr": "French", "de": "German", "es": "Spanish",
    "ar": "Arabic", "pt": "Portuguese", "ru": "Russian", "it": "Italian",
}

DEEPL_LANG_MAP = {
    "tr": "TR", "en": "EN-US", "ja": "JA", "ko": "KO", "zh": "ZH",
    "fr": "FR", "de": "DE", "es": "ES", "pt": "PT-BR", "ru": "RU", "it": "IT",
}


class TranslationEngine:
    """Base class for translation engines."""

    async def translate_batch(
        self,
        lines: list[str],
        source_lang: str,
        target_lang: str,
        context_lines: Optional[list[str]] = None,
        overlap_count: int = 0,
    ) -> list[str]:
        """Translate a batch of lines. If overlap_count > 0, the first N lines are
        context-only (from the previous chunk) and should NOT be translated."""
        raise NotImplementedError


def _build_system_prompt(src_name: str, tgt_name: str) -> str:
    """Build an adaptive system prompt that teaches the AI *how* to translate,
    rather than giving it a fixed glossary."""
    return (
        f"You are a highly adaptive subtitle localizer specializing in anime/media fansub translation "
        f"from {src_name} to {tgt_name}. Your goal is not just to translate words, but to "
        f"**localize the experience** so a native {tgt_name} speaker feels the same emotions as the original audience.\n\n"

        f"CORE ADAPTATION PRINCIPLES:\n"
        f"1. **Analyze Power Dynamics:** Before translating each line, determine who holds the power.\n"
        f"   - Dominant/aggressive speaker → commanding, rough {tgt_name} slang, imperative verbs.\n"
        f"   - Submissive/scared speaker → begging, stuttering, desperate language.\n"
        f"   - Equal/friendly speakers → casual, natural conversation.\n\n"

        f"2. **Match the Emotional Temperature:**\n"
        f"   - Romantic/soft scenes → softer, passionate, intimate words.\n"
        f"   - Intense/action scenes → visceral, punchy, street-level language.\n"
        f"   - Comedy scenes → funny, exaggerated local idioms suitable for the situation.\n\n"

        f"3. **Character Voice Consistency:**\n"
        f"   - A delinquent should sound like a street thug (rough slang).\n"
        f"   - A rich/noble character should sound arrogant but formal.\n"
        f"   - A childhood friend should sound casual and intimate.\n"
        f"   - Infer the character type from context and maintain consistency.\n\n"

        f"4. **Fluidity over Literalism:**\n"
        f"   - NEVER translate idioms literally. Adapt them to equivalent {tgt_name} expressions.\n"
        f"   - Context determines meaning: the same word can mean different things in different scenes.\n\n"

        f"TECHNICAL RULES (STRICT):\n"
        f"- Keep the exact same numbering format (1. 2. 3. etc).\n"
        f"- You receive ONLY dialogue text. There are NO timestamps in the input.\n"
        f"  Do NOT invent, guess, or output any timestamps or time codes.\n"
        f"- Preserve ALL formatting tags (e.g. {{{{\\i1}}}}, {{{{\\b1}}}}) exactly as they are.\n"
        f"- Preserve stutters (e.g., 'S-Stop' → equivalent stutter in {tgt_name}).\n"
        f"- Preserve sound effects and onomatopoeia in a culturally appropriate way.\n"
        f"- Do NOT add explanations, notes, or commentary. Output ONLY the numbered translations.\n"
        f"- Each output line MUST correspond to the same numbered input line."
    )


def _build_user_message(
    numbered: str,
    context_lines: Optional[list[str]] = None,
    overlap_count: int = 0,
) -> str:
    """Build the user message with optional context and overlap instructions."""
    parts = []

    if context_lines:
        ctx = "\n".join(context_lines[-10:])
        parts.append(f"PREVIOUS CONTEXT (for tone/character reference only, do NOT output these):\n{ctx}")

    if overlap_count > 0:
        parts.append(
            f"IMPORTANT: The first {overlap_count} lines below are CONTEXT from the previous block. "
            f"Read them to understand the ongoing conversation, but do NOT translate them. "
            f"Start your output from line {overlap_count + 1}."
        )

    parts.append(f"Translate these lines:\n{numbered}")
    return "\n\n".join(parts)


# Default models per engine
DEFAULT_MODELS = {
    "openai": "gpt-4.1-mini",
    "deepl": "default",
    "gemini": "gemini-2.5-flash",
    "openrouter": "openai/gpt-4.1-mini",
}


class OpenAIEngine(TranslationEngine):
    def __init__(self, api_key: str, model: str = ""):
        self.client = openai.AsyncOpenAI(api_key=api_key)
        self.model = model or DEFAULT_MODELS["openai"]

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    async def translate_batch(
        self,
        lines: list[str],
        source_lang: str,
        target_lang: str,
        context_lines: Optional[list[str]] = None,
        overlap_count: int = 0,
    ) -> list[str]:
        src_name = LANG_NAMES.get(source_lang, source_lang)
        tgt_name = LANG_NAMES.get(target_lang, target_lang)

        numbered = "\n".join(f"{i+1}. {line}" for i, line in enumerate(lines))
        system_prompt = _build_system_prompt(src_name, tgt_name)
        user_msg = _build_user_message(numbered, context_lines, overlap_count)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.3,
                max_tokens=4096,
            )
        except openai.NotFoundError:
            raise ValueError(f"Model bulunamadı: {self.model}. Lütfen geçerli bir OpenAI modeli seçin.")
        except openai.AuthenticationError:
            raise ValueError("OpenAI API anahtarı geçersiz. Lütfen ayarlardan kontrol edin.")

        result_text = response.choices[0].message.content.strip()
        return _parse_numbered_response(result_text, len(lines), overlap_count)


class DeepLEngine(TranslationEngine):
    def __init__(self, api_key: str):
        self.translator = deepl.Translator(api_key)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    async def translate_batch(
        self,
        lines: list[str],
        source_lang: str,
        target_lang: str,
        context_lines: Optional[list[str]] = None,
        overlap_count: int = 0,
    ) -> list[str]:
        # DeepL translates line-by-line; skip overlap lines and only translate new ones
        actual_lines = lines[overlap_count:] if overlap_count > 0 else lines

        src = DEEPL_LANG_MAP.get(source_lang)
        tgt = DEEPL_LANG_MAP.get(target_lang)
        if not tgt:
            raise ValueError(f"DeepL does not support target language: {target_lang}")

        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(
            None,
            lambda: self.translator.translate_text(
                actual_lines,
                source_lang=src,
                target_lang=tgt,
            ),
        )
        return [r.text for r in results]


class GeminiEngine(TranslationEngine):
    def __init__(self, api_key: str, model: str = ""):
        self.client = genai.Client(api_key=api_key)
        self.model = model or DEFAULT_MODELS["gemini"]

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    async def translate_batch(
        self,
        lines: list[str],
        source_lang: str,
        target_lang: str,
        context_lines: Optional[list[str]] = None,
        overlap_count: int = 0,
    ) -> list[str]:
        src_name = LANG_NAMES.get(source_lang, source_lang)
        tgt_name = LANG_NAMES.get(target_lang, target_lang)

        numbered = "\n".join(f"{i+1}. {line}" for i, line in enumerate(lines))

        # Gemini uses a single prompt (no system/user split)
        prompt = _build_system_prompt(src_name, tgt_name) + "\n\n"
        prompt += _build_user_message(numbered, context_lines, overlap_count)

        model_name = self.model
        loop = asyncio.get_running_loop()
        try:
            response = await loop.run_in_executor(
                None, lambda: self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
            )
        except Exception as e:
            err_str = str(e).lower()
            if "404" in err_str or "not found" in err_str:
                raise ValueError(f"Model bulunamadı: {model_name}. Lütfen geçerli bir Gemini modeli seçin.")
            if "api key" in err_str or "401" in err_str or "403" in err_str:
                raise ValueError("Gemini API anahtarı geçersiz. Lütfen ayarlardan kontrol edin.")
            raise
        return _parse_numbered_response(response.text.strip(), len(lines), overlap_count)


# Regex to detect timestamp patterns that AI might accidentally output
_TIMESTAMP_RE = _re.compile(
    r'^\s*\d{1,2}:\d{2}:\d{2}[.,]\d{2,3}\s*(?:-->|->)\s*\d{1,2}:\d{2}:\d{2}[.,]\d{2,3}\s*$'
)
_TIMESTAMP_INLINE_RE = _re.compile(
    r'\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*(?:-->|->)\s*\d{1,2}:\d{2}:\d{2}[.,]\d{3}'
)


def _sanitize_translated_line(line: str) -> str:
    """Remove any timestamp artifacts the AI may have hallucinated.
    Timestamps are managed entirely by the backend — AI must never touch them."""
    # Skip lines that are purely timestamps (SRT-style "00:01:23,456 --> 00:01:25,789")
    if _TIMESTAMP_RE.match(line):
        return ""
    # Strip inline timestamp patterns
    line = _TIMESTAMP_INLINE_RE.sub("", line).strip()
    # Strip bare SRT sequence numbers that appear alone (e.g. just "42")
    if line.isdigit():
        return ""
    return line


def _parse_numbered_response(text: str, expected_count: int, overlap_count: int = 0) -> list[str]:
    """Parse numbered response like '1. text\n2. text' into a list.
    Handles multi-line AI output by splitting on numbered prefixes (not newlines).
    If overlap_count > 0, skip the first N lines (they were context-only).
    The model *should* omit them, but we strip them as a safety net."""

    # Split on numbered prefixes: "1. ", "2) ", "3- ", "4: " at start of line
    # This correctly handles multi-line translations where continuation lines
    # don't start with a number prefix.
    segments = _re.split(r'(?m)^\s*(\d{1,4})\s*[.\-\):\u3001]\s*', text.strip())

    # _re.split with a capture group returns: [before, num1, text1, num2, text2, ...]
    results = []
    i = 1  # skip the first element (text before first number, usually empty)
    while i < len(segments) - 1:
        # segments[i] = the number, segments[i+1] = the text after it
        entry_text = segments[i + 1].strip()
        # Collapse internal newlines into single space (multi-line AI output)
        entry_text = " ".join(line.strip() for line in entry_text.split("\n") if line.strip())
        # Sanitize: strip any timestamp artifacts the AI hallucinated
        entry_text = _sanitize_translated_line(entry_text)
        if entry_text:
            results.append(entry_text)
        else:
            results.append("")
        i += 2

    # Fallback: if regex split found nothing, try simple line-by-line parse
    if not results:
        for line in text.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            for sep in [". ", ") ", "- ", ": "]:
                idx = line.find(sep)
                if idx != -1 and idx < 5 and line[:idx].isdigit():
                    line = line[idx + len(sep):]
                    break
            line = _sanitize_translated_line(line)
            if line:
                results.append(line)

    # If the model ignored our overlap instruction and translated all lines,
    # strip the overlap lines from the beginning (post-processing safety net).
    actual_new_lines = expected_count - overlap_count
    if overlap_count > 0 and len(results) >= expected_count:
        # Model translated everything including overlap — strip overlap
        results = results[overlap_count:]

    # Pad or trim to the number of NEW lines we actually need
    while len(results) < actual_new_lines:
        results.append("")
    return results[:actual_new_lines]


class OpenRouterEngine(TranslationEngine):
    """OpenRouter — access hundreds of models via a single API key."""
    def __init__(self, api_key: str, model: str = ""):
        self.client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
        )
        self.model = model or DEFAULT_MODELS["openrouter"]

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    async def translate_batch(
        self,
        lines: list[str],
        source_lang: str,
        target_lang: str,
        context_lines: Optional[list[str]] = None,
        overlap_count: int = 0,
    ) -> list[str]:
        src_name = LANG_NAMES.get(source_lang, source_lang)
        tgt_name = LANG_NAMES.get(target_lang, target_lang)

        numbered = "\n".join(f"{i+1}. {line}" for i, line in enumerate(lines))
        system_prompt = _build_system_prompt(src_name, tgt_name)
        user_msg = _build_user_message(numbered, context_lines, overlap_count)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.3,
                max_tokens=4096,
            )
        except openai.NotFoundError:
            raise ValueError(f"Model bulunamadı: {self.model}. Lütfen geçerli bir OpenRouter modeli seçin.")
        except openai.AuthenticationError:
            raise ValueError("OpenRouter API anahtarı geçersiz. Lütfen ayarlardan kontrol edin.")

        result_text = response.choices[0].message.content.strip()
        return _parse_numbered_response(result_text, len(lines), overlap_count)


def get_engine(engine_id: str, api_key: str, model: str = "") -> TranslationEngine:
    """Factory to create translation engine by ID."""
    engines = {
        "openai": OpenAIEngine,
        "deepl": DeepLEngine,
        "gemini": GeminiEngine,
        "openrouter": OpenRouterEngine,
    }
    cls = engines.get(engine_id)
    if not cls:
        raise ValueError(f"Unknown engine: {engine_id}")
    # DeepL doesn't support model selection
    if engine_id == "deepl":
        return cls(api_key=api_key)
    return cls(api_key=api_key, model=model)
