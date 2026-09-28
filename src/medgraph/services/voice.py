"""
Voice and Speech-to-Text (ASR) service powered by faster-whisper.

Supports high-accuracy multilingual transcription (Urdu, Hindi, English, etc.)
with automatic device selection (CUDA GPU / CPU), lazy model loading, and
reassuring multilingual status indicators.
"""

from __future__ import annotations

import logging
import os
import tempfile
import threading
from pathlib import Path
from typing import Any

from medgraph.config import get_settings

logger = logging.getLogger(__name__)

# Multilingual comfort messages
COMFORT_MESSAGES: dict[str, str] = {
    "ur": "آپ کی آواز کامیابی سے ریکارڈ ہو گئی ہے۔ ڈاکٹر یا AI آپ کی بات کا جائزہ لے رہے ہیں۔",
    "hi": "आपकी आवाज़ सफलतापूर्वक रिकॉर्ड हो गई है। डॉक्टर या AI आपकी बात का अध्ययन कर रहे हैं।",
    "en": "Audio transcribed successfully. Your clinical details are being processed.",
}

# Language display names and flag emojis
LANGUAGE_META: dict[str, dict[str, str]] = {
    "ur": {"name": "Urdu", "flag": "🇵🇰", "speech_locale": "ur-PK"},
    "hi": {"name": "Hindi", "flag": "🇮🇳", "speech_locale": "hi-IN"},
    "en": {"name": "English", "flag": "🇺🇸", "speech_locale": "en-US"},
    "es": {"name": "Spanish", "flag": "🇪🇸", "speech_locale": "es-ES"},
    "ar": {"name": "Arabic", "flag": "🇸🇦", "speech_locale": "ar-SA"},
    "zh": {"name": "Chinese", "flag": "🇨🇳", "speech_locale": "zh-CN"},
}


class WhisperASRManager:
    """
    Thread-safe Singleton manager for faster-whisper WhisperModel.
    Lazy-loads the model on the first transcription call to avoid slow startup times.
    """

    _instance: WhisperASRManager | None = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._model: Any | None = None
        self._loaded_model_name: str | None = None
        self._loaded_device: str | None = None
        self._loaded_compute_type: str | None = None

    @classmethod
    def get_instance(cls) -> WhisperASRManager:
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _determine_device(self, requested_device: str) -> tuple[str, str]:
        """Determine optimal (device, compute_type) based on request and system hardware."""
        try:
            import torch
            has_cuda = torch.cuda.is_available()
        except ImportError:
            has_cuda = False

        if requested_device == "cuda" or (requested_device == "auto" and has_cuda):
            device = "cuda"
            compute_type = "float16"
        else:
            device = "cpu"
            compute_type = "int8"
        return device, compute_type

    def get_model(self, model_name: str | None = None, device: str | None = None) -> Any:
        """Get or lazy-load the faster-whisper WhisperModel instance."""
        settings = get_settings()
        target_model = model_name or settings.whisper_model
        target_device_setting = device or settings.whisper_device

        with self._lock:
            device_str, compute_type_str = self._determine_device(target_device_setting)

            if (
                self._model is not None
                and self._loaded_model_name == target_model
                and self._loaded_device == device_str
            ):
                return self._model

            logger.info(
                f"Loading faster-whisper model '{target_model}' on device='{device_str}', "
                f"compute_type='{compute_type_str}'..."
            )

            try:
                from faster_whisper import WhisperModel

                self._model = WhisperModel(
                    target_model,
                    device=device_str,
                    compute_type=compute_type_str,
                    download_root=os.path.join(tempfile.gettempdir(), "whisper_cache"),
                )
                self._loaded_model_name = target_model
                self._loaded_device = device_str
                self._loaded_compute_type = compute_type_str
                logger.info(f"faster-whisper model '{target_model}' successfully loaded ✓")
            except Exception as e:
                # If requested model (e.g. large-v3) fails or takes too long, attempt base model fallback
                if target_model != "base":
                    logger.warning(
                        f"Failed to load '{target_model}' ({e}). Attempting fallback to 'base' model..."
                    )
                    from faster_whisper import WhisperModel

                    self._model = WhisperModel(
                        "base",
                        device=device_str,
                        compute_type=compute_type_str,
                        download_root=os.path.join(tempfile.gettempdir(), "whisper_cache"),
                    )
                    self._loaded_model_name = "base"
                    self._loaded_device = device_str
                    self._loaded_compute_type = compute_type_str
                    logger.info("Fallback 'base' model loaded successfully ✓")
                else:
                    raise e

            return self._model

    def status(self) -> dict[str, Any]:
        """Return status information about loaded ASR engine."""
        try:
            import torch
            gpu_available = torch.cuda.is_available()
            gpu_name = torch.cuda.get_device_name(0) if gpu_available else None
        except Exception:
            gpu_available = False
            gpu_name = None

        settings = get_settings()

        return {
            "is_loaded": self._model is not None,
            "model_name": self._loaded_model_name or settings.whisper_model,
            "device": self._loaded_device or "uninitialized",
            "compute_type": self._loaded_compute_type or "uninitialized",
            "gpu_available": gpu_available,
            "gpu_name": gpu_name,
            "supported_languages": list(LANGUAGE_META.keys()),
        }


def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "audio.webm",
    model_name: str | None = None,
    language: str | None = None,
) -> dict[str, Any]:
    """
    Transcribe audio bytes using faster-whisper.

    Parameters:
        audio_bytes: Raw audio binary data.
        filename: Original audio filename (used to infer extension).
        model_name: Optional override for Whisper model (e.g. 'large-v3', 'base').
        language: Optional language code ('ur', 'hi', 'en') to force language.

    Returns:
        Dictionary containing transcription result, detected language, confidence,
        segments, and multilingual comfort message.
    """
    asr_manager = WhisperASRManager.get_instance()
    model = asr_manager.get_model(model_name=model_name)

    suffix = Path(filename).suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
        tmp_file.write(audio_bytes)
        tmp_path = tmp_file.name

    try:
        # Transcribe with faster-whisper
        # If language is 'auto' or None, pass None for auto-detection
        # Initial transcription pass with vad_filter disabled by default for maximum sensitivity
        lang_arg = language if language and language != "auto" else None

        segments, info = model.transcribe(
            tmp_path,
            language=lang_arg,
            beam_size=5,
            word_timestamps=False,
            vad_filter=False,
        )

        segment_list = []
        full_text_chunks = []

        for seg in segments:
            text_str = seg.text.strip()
            if text_str:
                full_text_chunks.append(text_str)
                segment_list.append(
                    {
                        "start": round(seg.start, 2),
                        "end": round(seg.end, 2),
                        "text": text_str,
                    }
                )

        transcribed_text = " ".join(full_text_chunks).strip()

        # If transcript is empty and VAD was off, attempt second pass
        if not transcribed_text:
            segments_pass2, info_pass2 = model.transcribe(
                tmp_path,
                language=lang_arg,
                beam_size=3,
                vad_filter=True,
            )
            for seg in segments_pass2:
                text_str = seg.text.strip()
                if text_str:
                    full_text_chunks.append(text_str)
                    segment_list.append(
                        {
                            "start": round(seg.start, 2),
                            "end": round(seg.end, 2),
                            "text": text_str,
                        }
                    )
            transcribed_text = " ".join(full_text_chunks).strip()
            if info_pass2:
                info = info_pass2

        detected_lang = getattr(info, "language", "en") or "en"
        lang_prob = round(getattr(info, "language_probability", 1.0) or 1.0, 3)

        meta = LANGUAGE_META.get(
            detected_lang,
            {
                "name": detected_lang.upper(),
                "flag": "🌐",
                "speech_locale": f"{detected_lang}-{detected_lang.upper()}",
            },
        )
        comfort_msg = COMFORT_MESSAGES.get(detected_lang, COMFORT_MESSAGES["en"])

        logger.info(
            f"Audio transcription complete: text_len={len(transcribed_text)}, "
            f"lang={detected_lang} ({lang_prob*100:.1f}%)"
        )

        return {
            "text": transcribed_text,
            "language": detected_lang,
            "language_name": meta["name"],
            "language_flag": meta["flag"],
            "speech_locale": meta["speech_locale"],
            "language_probability": lang_prob,
            "duration": round(info.duration, 2),
            "comfort_message": comfort_msg,
            "segments": segment_list,
        }
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def clean_text_for_speech(text: str) -> str:
    """Format raw medical text/markdown into natural spoken dialogue."""
    import re

    # Remove HTML tags
    cleaned = re.sub(r"<[^>]*>", "", text)
    # Remove ICD codes (e.g. J45.909), whether bracketed "[ICD-10:J45.909]"
    # or parenthesized "(ICD-10 J45.909)" — the latter is what the app
    # actually produces in diagnosis text.
    cleaned = re.sub(r"[\[(]ICD-10:?\s*[^\])]*[\])]", "", cleaned, flags=re.IGNORECASE)
    # Remove markdown bullets and header hashes
    cleaned = re.sub(r"^[#*\-•>]+\s*", "", cleaned, flags=re.MULTILINE)
    # Replace markdown bold/italic asterisks
    cleaned = re.sub(r"[*_~`]", "", cleaned)
    # Replace multiple spaces/newlines with single space
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    return cleaned


NEURAL_VOICE_MAP: dict[str, str] = {
    "ur": "ur-PK-AsadNeural",
    "hi": "hi-IN-SwaraNeural",
    "en": "en-US-AvaNeural",
    "es": "es-ES-ElviraNeural",
    "ar": "ar-SA-HamedNeural",
}


async def synthesize_speech_async(text: str, language: str = "en") -> bytes:
    """
    Synthesize high-fidelity, ultra-natural neural spoken audio MP3 bytes.
    Uses Microsoft Edge Neural voices (Asad for Urdu, Swara for Hindi, Ava for English),
    with fallback to gTTS.
    """
    from io import BytesIO

    cleaned = clean_text_for_speech(text)
    if not cleaned:
        cleaned = "No speech text available."

    lang_code = language.lower()
    if lang_code not in ("ur", "hi", "en", "es", "ar"):
        lang_code = "en"

    # Try high-definition Edge Neural Speech first
    try:
        import edge_tts

        voice = NEURAL_VOICE_MAP.get(lang_code, "en-US-AvaNeural")
        communicate = edge_tts.Communicate(cleaned, voice, rate="-2%")
        audio_stream = BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_stream.write(chunk["data"])
        audio_stream.seek(0)
        data = audio_stream.read()
        if data:
            return data
    except Exception as e:
        logger.warning(f"Edge TTS neural voice fallback to gTTS ({e})")

    # Fallback to gTTS if Edge TTS is unavailable
    from gtts import gTTS

    tts = gTTS(text=cleaned, lang=lang_code, slow=False)
    fp = BytesIO()
    tts.write_to_fp(fp)
    fp.seek(0)
    return fp.read()


def synthesize_speech(text: str, language: str = "en") -> bytes:
    """Synchronous wrapper for synthesize_speech_async."""
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If called inside active event loop, run in thread pool or create task
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, synthesize_speech_async(text, language))
                return future.result()
        return loop.run_until_complete(synthesize_speech_async(text, language))
    except Exception:
        return asyncio.run(synthesize_speech_async(text, language))


