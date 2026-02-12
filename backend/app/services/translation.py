import asyncio
from typing import Optional
from tenacity import retry, stop_after_attempt, wait_exponential
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
    ) -> list[str]:
        raise NotImplementedError


class OpenAIEngine(TranslationEngine):
    def __init__(self, api_key: str):
        self.client = openai.AsyncOpenAI(api_key=api_key)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    async def translate_batch(
        self,
        lines: list[str],
        source_lang: str,
        target_lang: str,
        context_lines: Optional[list[str]] = None,
    ) -> list[str]:
        src_name = LANG_NAMES.get(source_lang, source_lang)
        tgt_name = LANG_NAMES.get(target_lang, target_lang)

        numbered = "\n".join(f"{i+1}. {line}" for i, line in enumerate(lines))

        system_prompt = (
            f"You are a professional subtitle translator. "
            f"Translate from {src_name} to {tgt_name}. "
            f"Rules:\n"
            f"- Keep the same numbering format (1. 2. 3. etc)\n"
            f"- Preserve the meaning and tone\n"
            f"- Keep translations natural and conversational\n"
            f"- Do NOT add explanations, just translate\n"
            f"- Each line must correspond to the same numbered line"
        )

        user_msg = numbered
        if context_lines:
            ctx = "\n".join(context_lines[-5:])
            user_msg = f"Previous context:\n{ctx}\n\nTranslate these lines:\n{numbered}"

        response = await self.client.chat.completions.create(
            model="gpt-4-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=4096,
        )

        result_text = response.choices[0].message.content.strip()
        return _parse_numbered_response(result_text, len(lines))


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
    ) -> list[str]:
        src = DEEPL_LANG_MAP.get(source_lang)
        tgt = DEEPL_LANG_MAP.get(target_lang)
        if not tgt:
            raise ValueError(f"DeepL does not support target language: {target_lang}")

        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(
            None,
            lambda: self.translator.translate_text(
                lines,
                source_lang=src,
                target_lang=tgt,
            ),
        )
        return [r.text for r in results]


class GeminiEngine(TranslationEngine):
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    async def translate_batch(
        self,
        lines: list[str],
        source_lang: str,
        target_lang: str,
        context_lines: Optional[list[str]] = None,
    ) -> list[str]:
        src_name = LANG_NAMES.get(source_lang, source_lang)
        tgt_name = LANG_NAMES.get(target_lang, target_lang)

        numbered = "\n".join(f"{i+1}. {line}" for i, line in enumerate(lines))

        prompt = (
            f"Translate the following subtitle lines from {src_name} to {tgt_name}.\n"
            f"Keep the same numbering. Only output translations, no explanations.\n\n"
        )
        if context_lines:
            ctx = "\n".join(context_lines[-5:])
            prompt += f"Previous context:\n{ctx}\n\n"
        prompt += numbered

        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(
            None, lambda: self.client.models.generate_content(
                model="gemini-1.5-pro",
                contents=prompt,
            )
        )
        return _parse_numbered_response(response.text.strip(), len(lines))


def _parse_numbered_response(text: str, expected_count: int) -> list[str]:
    """Parse numbered response like '1. text\n2. text' into a list."""
    lines = text.strip().split("\n")
    results = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Remove numbering prefix: "1. ", "1) ", "1- "
        for sep in [". ", ") ", "- ", ": "]:
            idx = line.find(sep)
            if idx != -1 and idx < 5 and line[:idx].isdigit():
                line = line[idx + len(sep):]
                break
        results.append(line)

    # Pad or trim to expected count
    while len(results) < expected_count:
        results.append("")
    return results[:expected_count]


def get_engine(engine_id: str, api_key: str) -> TranslationEngine:
    """Factory to create translation engine by ID."""
    engines = {
        "openai": OpenAIEngine,
        "deepl": DeepLEngine,
        "gemini": GeminiEngine,
    }
    cls = engines.get(engine_id)
    if not cls:
        raise ValueError(f"Unknown engine: {engine_id}")
    return cls(api_key=api_key)
