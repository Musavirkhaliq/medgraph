"""
Translation Service for MedGraph Multi-Agent Workstation.

Provides dual translation bridge:
1. Translates Urdu/Hindi/other spoken & typed patient inputs into English for high-precision LLM reasoning.
2. Translates LLM clinical questions & findings from English back into Urdu/Hindi for patient display and natural neural speech synthesis (TTS).
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# ISO Language code mapping normalization
LANG_CODE_MAP: dict[str, str] = {
    "ur": "ur",
    "urdu": "ur",
    "hi": "hi",
    "hindi": "hi",
    "en": "en",
    "english": "en",
    "es": "es",
    "spanish": "es",
    "ar": "ar",
    "arabic": "ar",
    "zh": "zh-CN",
    "chinese": "zh-CN",
}


def normalize_lang_code(code: str | None) -> str:
    """Normalize language string to standard ISO 639-1 code."""
    if not code:
        return "en"
    clean = code.strip().lower()
    return LANG_CODE_MAP.get(clean, clean)


def translate_text(text: str, source_lang: str = "auto", target_lang: str = "en") -> str:
    """
    Translate text from source_lang to target_lang.

    Parameters:
        text: Raw text to translate.
        source_lang: Language code of original text ('ur', 'hi', 'en', 'auto').
        target_lang: Target language code ('en', 'ur', 'hi').

    Returns:
        Translated string, or original string if translation is unnecessary or fails.
    """
    if not text or not text.strip():
        return ""

    src = normalize_lang_code(source_lang)
    tgt = normalize_lang_code(target_lang)

    # Skip translation if source equals target
    if src != "auto" and src == tgt:
        return text.strip()

    # 1. Try deep_translator if available
    try:
        from deep_translator import GoogleTranslator

        translator = GoogleTranslator(source=src if src != "auto" else "auto", target=tgt)
        translated = translator.translate(text)
        if translated and translated.strip():
            logger.info(f"Translation (deep_translator) [{src} -> {tgt}]: '{text[:40]}...' -> '{translated[:40]}...'")
            return translated.strip()
    except Exception as exc:
        logger.debug(f"deep_translator fallback to urllib ({exc})")

    # 2. Robust zero-dependency urllib fallback
    try:
        import json
        import urllib.parse
        import urllib.request

        encoded_text = urllib.parse.quote(text.strip())
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={src}&tl={tgt}&dt=t&q={encoded_text}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            resp_bytes = response.read()
            data = json.loads(resp_bytes.decode("utf-8"))
            if data and data[0]:
                translated_chunks = [item[0] for item in data[0] if item and item[0]]
                translated = "".join(translated_chunks).strip()
                if translated:
                    logger.info(f"Translation (urllib) [{src} -> {tgt}]: '{text[:40]}...' -> '{translated[:40]}...'")
                    return translated
    except Exception as exc:
        logger.warning(f"Translation failed [{src} -> {tgt}] ({exc}). Returning original text.")

    return text.strip()


def translate_to_english(text: str, source_lang: str = "auto") -> str:
    """Convenience helper to translate any text to English for LLM consumption."""
    src = normalize_lang_code(source_lang)
    if src == "en":
        return text.strip()
    return translate_text(text, source_lang=src, target_lang="en")


def translate_from_english(text: str, target_lang: str = "en") -> str:
    """Convenience helper to translate English AI output to target patient language."""
    tgt = normalize_lang_code(target_lang)
    if tgt == "en":
        return text.strip()
    return translate_text(text, source_lang="en", target_lang=tgt)
