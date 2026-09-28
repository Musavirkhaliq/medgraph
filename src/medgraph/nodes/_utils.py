"""
Shared utilities used by multiple node implementations.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Mapping
from typing import Any, TypeVar

from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def repair_truncated_json(raw: str) -> str:
    """
    Auto-repair truncated JSON strings (e.g. from LLM max_tokens limits).

    Handles unclosed string quotes, dangling trailing commas, and unclosed
    brackets/braces ({ and [).
    """
    s = raw.strip()

    # Find the start of JSON object or array
    start_idx = s.find('{')
    arr_idx = s.find('[')
    if start_idx == -1 and arr_idx == -1:
        return s
    if start_idx == -1 or (arr_idx != -1 and arr_idx < start_idx):
        start_idx = arr_idx

    s = s[start_idx:]

    # Step 1: Handle string escaping and unclosed string literal
    in_string = False
    escape = False
    clean_chars: list[str] = []

    for c in s:
        if in_string:
            if escape:
                escape = False
                clean_chars.append(c)
            elif c == '\\':
                escape = True
                clean_chars.append(c)
            elif c == '"':
                in_string = False
                clean_chars.append(c)
            elif c == '\n':
                clean_chars.append('\\n')
            else:
                clean_chars.append(c)
        else:
            if c == '"':
                in_string = True
                clean_chars.append(c)
            else:
                clean_chars.append(c)

    # If output ended while inside string literal, close the quote
    if in_string:
        clean_chars.append('"')

    s_fixed = ''.join(clean_chars)

    # Remove trailing commas right before closing or end
    s_fixed = re.sub(r',\s*$', '', s_fixed)
    s_fixed = re.sub(r',\s*([\}])', r'\1', s_fixed)

    # Step 2: Balance brackets and braces
    stack: list[str] = []
    in_str = False
    esc = False
    for c in s_fixed:
        if in_str:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c in '{[':
                stack.append(c)
            elif c == '}' and stack and stack[-1] == '{':
                stack.pop()
            elif c == ']' and stack and stack[-1] == '[':
                stack.pop()

    # Append missing closing tokens in reverse order
    for opener in reversed(stack):
        if opener == '{':
            s_fixed += '}'
        elif opener == '[':
            s_fixed += ']'

    # Final cleanup of invalid trailing commas inside structures
    s_fixed = re.sub(r',\s*([\}])', r'\1', s_fixed)
    return s_fixed


def parse_llm_json(raw: str, model: type[T], node_name: str) -> T:
    """
    Parse JSON from an LLM response into a Pydantic model.

    Handles common LLM output issues:
    - Markdown code fences (```json ... ```)
    - Leading/trailing prose before/after the JSON object
    - Nested JSON extraction
    - <unused94>thought blocks
    - Truncated JSON outputs (via auto-repair)

    Args:
        raw: Raw text response from the LLM.
        model: Pydantic model class to validate against.
        node_name: Node name for error logging.

    Returns:
        A validated instance of ``model``. Falls back to a default-constructed
        instance if parsing fails, and logs a warning.
    """
    cleaned = raw

    # Strip <unused94>thought ... <unused94> blocks or unclosed thought blocks
    cleaned = re.sub(r"<unused94>thought.*?<unused94>", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"<unused94>thought.*?(?=\{)", "", cleaned, flags=re.DOTALL)
    if "<unused94>thought" in cleaned:
        cleaned = re.sub(r"<unused94>thought.*", "", cleaned, flags=re.DOTALL)

    # 1. Try to extract markdown JSON block
    md_match = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL | re.IGNORECASE)
    if md_match:
        cleaned = md_match.group(1)
    else:
        # 2. Try to extract JSON object or array by finding the outermost braces/brackets
        match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(1)
        else:
            # If no complete brace was found (e.g. truncated mid-JSON), find first { or [
            first_idx = min(
                [i for i in [cleaned.find('{'), cleaned.find('[')] if i != -1] or [-1]
            )
            if first_idx != -1:
                cleaned = cleaned[first_idx:]

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Try auto-repairing truncated JSON
        try:
            repaired = repair_truncated_json(cleaned)
            data = json.loads(repaired)
            logger.info("[%s] Successfully recovered truncated JSON via auto-repair ✓", node_name)
        except Exception as repair_exc:
            logger.warning("[%s] JSON parse failed after repair (%s) — using defaults. Raw: %.200s", node_name, repair_exc, raw)
            return model()
    except Exception as exc:
        logger.warning("[%s] JSON parse failed (%s) — using defaults. Raw: %.200s", node_name, exc, raw)
        return model()

    try:
        # Handle cases where model outputs the inner list instead of the root object
        if isinstance(data, list):
            if node_name == "diagnostician":
                data = {"differential_diagnosis": data}
            elif "interpreter" in node_name:
                data = {"findings": data}
            elif node_name == "case_builder":
                data = {"key_findings": data}
        elif isinstance(data, dict):
            if node_name == "case_builder":
                if isinstance(data.get("clinical_correlations"), list):
                    data["clinical_correlations"] = " ".join(str(x) for x in data["clinical_correlations"])
                if isinstance(data.get("case_summary"), list):
                    data["case_summary"] = " ".join(str(x) for x in data["case_summary"])
            elif node_name == "questioner":
                if isinstance(data.get("information_gap"), list):
                    data["information_gap"] = ", ".join(str(x) for x in data["information_gap"])
                if isinstance(data.get("recommended_tests"), dict):
                    data["recommended_tests"] = [data["recommended_tests"]]
                elif data.get("recommended_tests") is None:
                    data["recommended_tests"] = []

        return model(**data)
    except Exception as exc:
        logger.warning("[%s] Pydantic validation failed (%s) — using defaults.", node_name, exc)
        return model()


def build_context_prompt(state: Mapping[str, Any], extra: str = "") -> str:
    """
    Build a compact context string from the current state for use in prompts.

    Args:
        state: Current MedicalState dict.
        extra: Any additional text to append.

    Returns:
        A formatted string summarising the patient information collected so far.
    """
    parts: list[str] = []

    patient_input = state.get("patient_input", "")
    if patient_input:
        parts.append(f"=== PATIENT DESCRIPTION ===\n{patient_input}")

    demographics = state.get("demographics")
    if demographics:
        parts.append(f"=== DEMOGRAPHICS ===\n{json.dumps(demographics, indent=2)}")

    symptoms = state.get("symptoms")
    if symptoms:
        parts.append(f"=== SYMPTOMS ===\n{json.dumps(symptoms, indent=2)}")

    history = state.get("history")
    if history:
        parts.append(f"=== MEDICAL HISTORY ===\n{json.dumps(history, indent=2)}")

    triage_level = state.get("triage_level")
    if triage_level:
        parts.append(
            f"=== TRIAGE ===\n"
            f"Level: {triage_level}\n"
            f"Domains: {', '.join(state.get('suspected_domains', []))}\n"
            f"Reasoning: {state.get('triage_reasoning', '')}"
        )

    qa_pairs = state.get("qa_pairs", [])
    if qa_pairs:
        qa_text = "\n".join(
            f"Q{qa['round_number']}: {qa['question']}\nA: {qa['answer']}"
            for qa in qa_pairs
        )
        parts.append(f"=== Q&A HISTORY ===\n{qa_text}")

    case_summary = state.get("case_summary")
    if case_summary:
        parts.append(f"=== CASE SUMMARY ===\n{case_summary}")

    investigations = state.get("investigations")
    if investigations:
        parts.append(f"=== INVESTIGATIONS ===\n{json.dumps(investigations, indent=2)}")

    image_analysis = state.get("image_analysis")
    if image_analysis:
        parts.append(f"=== IMAGE ANALYSIS ===\n{image_analysis}")

    diff_dx = state.get("differential_diagnosis")
    if diff_dx:
        parts.append(f"=== DIFFERENTIAL DIAGNOSIS ===\n{json.dumps(diff_dx, indent=2)}")

    meds = state.get("medications")
    if meds:
        parts.append(f"=== TREATMENT PLAN ===\n{json.dumps(meds, indent=2)}")

    if extra:
        parts.append(extra)

    return "\n\n".join(parts)
