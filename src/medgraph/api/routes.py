"""
API route handlers for the MedGraph REST API.

Session isolation is achieved by passing a LangGraph ``thread_id`` derived from
the session_id to every graph invocation.  No global mutable state is used —
the LangGraph checkpointer handles state persistence per thread.

Human-in-the-loop for the Q&A loop:
  The graph is compiled with ``interrupt_before=["questioner"]``.
  When the graph is invoked and reaches the questioner node, it pauses and
  returns the current state.  The API extracts the ``current_question`` and
  returns it to the caller.  When ``POST /sessions/{id}/respond`` is called,
  the answer is injected into the state and the graph resumes.
"""

from __future__ import annotations

import logging
from typing import Any, cast

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Response, UploadFile

from medgraph.api.models import (
    AddImagesRequest,
    AnswerQuestionRequest,
    FinalReport,
    HealthResponse,
    QuestionResponse,
    SessionStartResponse,
    SessionStateResponse,
    StartSessionRequest,
    TestResultsRequest,
    TranslateRequest,
    TranslateResponse,
    VoiceStatusResponse,
    VoiceTranscribeResponse,
)
from medgraph.graph import get_compiled_graph
from medgraph.prompts import MEDICAL_DISCLAIMER
from medgraph.safety import detect_emergency
from medgraph.state import MedicalState, initial_state

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory registry of active sessions (maps session_id → metadata)
# Note: graph state itself lives in the LangGraph checkpointer
_active_sessions: dict[str, dict[str, Any]] = {}


def _thread_config(session_id: str) -> dict[str, Any]:
    """Build the LangGraph thread config for a given session."""
    return {"configurable": {"thread_id": session_id}}


def _get_graph_state(session_id: str) -> MedicalState:
    """Retrieve current state snapshot for a session from the checkpointer."""
    graph = get_compiled_graph()
    snapshot = graph.get_state(_thread_config(session_id))
    return cast(MedicalState, snapshot.values) if snapshot else cast(MedicalState, {})


def _current_phase(state: MedicalState) -> str:
    """Derive a human-readable phase name from graph state."""
    if not state.get("triage_level"):
        return "intake"
    if not state.get("question_complete"):
        return "questioning"
    if not state.get("case_summary"):
        return "case_building"
    if state.get("waiting_for_tests"):
        return "investigation_waiting"
    if not state.get("primary_diagnosis"):
        return "diagnosis"
    if not state.get("medications") and not state.get("procedures"):
        return "treatment"
    if state.get("completed_at"):
        return "complete"
    return "validation"


def _completion_percentage(state: MedicalState) -> float:
    """Estimate pipeline completion 0–100, following the phase curve in the docs."""
    if state.get("completed_at"):
        return 100.0
    if not state.get("triage_level"):
        return 10.0
    if not state.get("question_complete"):
        from medgraph.config import get_settings

        max_rounds = get_settings().max_question_rounds or 10
        frac = min(state.get("question_round", 0) / max(max_rounds, 1), 1.0)
        return round(20 + frac * 20, 1)
    if not state.get("case_summary"):
        return 50.0
    if state.get("waiting_for_tests"):
        return 60.0
    if not state.get("primary_diagnosis"):
        return 65.0 if state.get("image_analysis") else 60.0
    if not state.get("medications") and not state.get("procedures"):
        return 75.0
    if state.get("is_safe") is None:
        return 85.0
    return 92.0


async def _run_graph_in_background(session_id: str, state_update: dict | None = None):
    """Run or resume the graph asynchronously in the background."""
    graph = get_compiled_graph()
    try:
        if state_update is None:
            # First run (state passed at compilation or initially)
            await graph.ainvoke(None, _thread_config(session_id))
        else:
            # Resuming with no state updates here because they are applied before
            await graph.ainvoke(None, _thread_config(session_id))
            
        current = _get_graph_state(session_id)
        if current.get("current_question"):
            _active_sessions[session_id]["status"] = "awaiting_answer"
        elif current.get("waiting_for_tests"):
            _active_sessions[session_id]["status"] = "awaiting_test_results"
        elif current.get("is_emergency") or current.get("completed_at"):
            _active_sessions[session_id]["status"] = "complete"
    except Exception as exc:
        logger.error("[API] background graph run failed for %s: %s", session_id, exc, exc_info=True)
        _active_sessions[session_id]["status"] = "error"

# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/sessions", response_model=SessionStartResponse, tags=["Sessions"])
async def start_session(request: StartSessionRequest, background_tasks: BackgroundTasks):
    """
    Start a new interactive medical reasoning session in the background.
    """
    session_id = request.session_id

    if session_id in _active_sessions:
        raise HTTPException(status_code=409, detail=f"Session '{session_id}' already exists.")

    patient_desc = (request.patient_description or request.patient_description_original or "Patient presenting for clinical assessment.").strip()
    if not patient_desc:
        patient_desc = "Patient presenting for clinical assessment."

    # Fast safety pre-check
    safety = detect_emergency(patient_desc)
    if safety["level"] == "critical":
        _active_sessions[session_id] = {"status": "emergency"}
        from medgraph.prompts import EMERGENCY_CRITICAL_RESPONSE
        return SessionStartResponse(
            session_id=session_id,
            status="emergency",
            message="🚨 Critical emergency detected. Seek immediate care.",
            emergency=True,
            emergency_info={**safety, **EMERGENCY_CRITICAL_RESPONSE},
        )

    # Register session
    _active_sessions[session_id] = {"status": "running"}

    # Seed the initial state
    state = initial_state(session_id, patient_desc)
    if request.patient_id:
        state["patient_id"] = request.patient_id
    if request.detected_language:
        state["detected_language"] = request.detected_language

    graph = get_compiled_graph()
    
    try:
        # Initialize the state in the checkpointer
        await graph.aupdate_state(_thread_config(session_id), state)
        
        # Run graph in background
        background_tasks.add_task(_run_graph_in_background, session_id)

        return SessionStartResponse(
            session_id=session_id,
            status="running",
            message="Session started. Assessment in progress.",
            emergency=False,
            current_question=None,
            current_question_translated=None,
            detected_language=request.detected_language or "en",
        )

    except Exception as exc:
        logger.error("[API] start_session failed for %s: %s", session_id, exc, exc_info=True)
        _active_sessions.pop(session_id, None)
        raise HTTPException(status_code=500, detail=f"Session start failed: {exc}")


def _to_dict_safe(val: Any) -> Any:
    """Recursively convert Pydantic models, dataclasses, or lists/dicts to JSON-safe structures."""
    if hasattr(val, "model_dump"):
        return _to_dict_safe(val.model_dump())
    if hasattr(val, "dict") and callable(val.dict):
        return _to_dict_safe(val.dict())
    if isinstance(val, dict):
        return {k: _to_dict_safe(v) for k, v in val.items()}
    if isinstance(val, list | tuple | set):
        return [_to_dict_safe(v) for v in val]
    return val


def _build_agent_telemetry(state: MedicalState) -> dict[str, Any]:
    """Construct full 9-agent telemetry dictionary from state snapshot."""
    curr_phase = _current_phase(state)
    is_complete = bool(state.get("completed_at") or state.get("primary_diagnosis"))

    telemetry = {
        "intake_agent": {
            "name": "Intake Agent",
            "role": "Patient Presentation & Clinical Entity Extraction",
            "status": "complete" if (state.get("symptoms") or state.get("patient_input")) else "active",
            "output": {
                "patient_input": state.get("patient_input"),
                "demographics": state.get("demographics"),
                "symptoms": state.get("symptoms", []),
                "history": state.get("history", []),
            }
        },
        "triage_agent": {
            "name": "Triage Agent",
            "role": "Urgency Classification & Emergency Screening",
            "status": "complete" if state.get("triage_level") else ("active" if curr_phase == "triage" else "pending"),
            "output": {
                "triage_level": state.get("triage_level"),
                "is_emergency": state.get("is_emergency"),
                "emergency_info": state.get("emergency_info"),
                "triage_reasoning": state.get("triage_reasoning"),
                "red_flags": state.get("red_flags", []),
            }
        },
        "questioner_agent": {
            "name": "Questioner Agent",
            "role": "Adaptive Clinical Interview & Gap Assessment",
            "status": "complete" if (state.get("question_complete") or is_complete) else ("active" if (state.get("current_question") or (state.get("question_round", 0) > 0)) else "pending"),
            "output": {
                "current_question": state.get("current_question"),
                "question_round": state.get("question_round", 0),
                "question_complete": state.get("question_complete"),
                "qa_pairs": state.get("qa_pairs", []),
                "image_requested_by_qa": state.get("image_requested_by_qa"),
            }
        },
        "case_builder_agent": {
            "name": "Case Builder Agent",
            "role": "Clinical Case Synthesis & Evidence Correlation",
            "status": "complete" if (state.get("case_summary") or is_complete) else ("active" if curr_phase == "case_building" else "pending"),
            "output": {
                "case_summary": state.get("case_summary"),
                "key_findings": state.get("key_findings", []),
                "clinical_correlations": state.get("clinical_correlations"),
            }
        },
        "investigator_agent": {
            "name": "Investigator Agent",
            "role": "Diagnostic Workup & Lab Recommendation",
            "status": "complete" if (state.get("investigations") or is_complete) else ("active" if curr_phase in ["investigation_waiting", "investigation"] else "pending"),
            "output": {
                "investigations": state.get("investigations", []),
                "images_requested": state.get("images_requested", []),
                "waiting_for_tests": state.get("waiting_for_tests"),
            }
        },
        "interpreter_agent": {
            "name": "Interpreter Agent (MedGemma Vision)",
            "role": "Multi-Modal Medical Image & DICOM Analysis",
            "status": "complete" if (state.get("image_analysis") or is_complete) else ("active" if len(state.get("image_paths", [])) > 0 else "pending"),
            "output": {
                "image_paths": state.get("image_paths", []),
                "image_analysis": state.get("image_analysis"),
            }
        },
        "diagnostician_agent": {
            "name": "Diagnostician Agent",
            "role": "Differential Diagnosis & Probability Ranking",
            "status": "complete" if (state.get("differential_diagnosis") or state.get("primary_diagnosis")) else ("active" if curr_phase == "diagnosis" else "pending"),
            "output": {
                "primary_diagnosis": state.get("primary_diagnosis"),
                "diagnosis_confidence": state.get("diagnosis_confidence"),
                "differential_diagnosis": state.get("differential_diagnosis", []),
            }
        },
        "treatment_agent": {
            "name": "Treatment Agent",
            "role": "Therapeutic Plan & Pharmacotherapy Design",
            "status": "complete" if (state.get("medications") or state.get("procedures") or state.get("follow_up") or is_complete) else ("active" if curr_phase == "treatment" else "pending"),
            "output": {
                "medications": state.get("medications", []),
                "procedures": state.get("procedures", []),
                "lifestyle_modifications": state.get("lifestyle_modifications", []),
                "follow_up": state.get("follow_up"),
            }
        },
        "validator_agent": {
            "name": "Validator Agent",
            "role": "Safety Validation & Contraindication Check",
            "status": "complete" if (state.get("is_safe") is not None or is_complete) else ("active" if curr_phase == "validation" else "pending"),
            "output": {
                "is_safe": state.get("is_safe"),
                "validation_warnings": state.get("validation_warnings", []),
                "validation_recommendations": state.get("validation_recommendations", []),
            }
        }
    }
    return _to_dict_safe(telemetry)


@router.get("/sessions/{session_id}", response_model=SessionStateResponse, tags=["Sessions"])
async def get_session(session_id: str):
    """Get current state and status of an active session."""
    state = _get_graph_state(session_id)
    if not state and session_id not in _active_sessions:
        raise HTTPException(status_code=404, detail="Session not found.")

    if session_id not in _active_sessions:
        _active_sessions[session_id] = {"status": "complete" if state.get("completed_at") else "running"}

    agent_telemetry = _build_agent_telemetry(state)

    curr_q = state.get("current_question")
    det_lang = state.get("detected_language", "en")
    curr_q_trans = None
    if curr_q and det_lang and det_lang != "en":
        try:
            from medgraph.services.translation import translate_from_english
            curr_q_trans = translate_from_english(curr_q, target_lang=det_lang)
        except Exception:
            curr_q_trans = curr_q
    else:
        curr_q_trans = curr_q

    return SessionStateResponse(
        session_id=session_id,
        status=_active_sessions[session_id].get("status", "unknown"),
        current_phase=_current_phase(state),
        triage_level=state.get("triage_level", ""),
        is_emergency=bool(state.get("is_emergency")),
        emergency_info=state.get("emergency_info"),
        current_question=curr_q,
        current_question_translated=curr_q_trans,
        detected_language=det_lang,
        question_round=state.get("question_round", 0),
        question_complete=bool(state.get("question_complete")),
        completion_percentage=_completion_percentage(state),
        image_requested_by_qa=bool(state.get("image_requested_by_qa")),
        demographics=dict(state.get("demographics") or {}) if state.get("demographics") else None,
        symptoms=state.get("symptoms", []),
        history=state.get("history", []),
        qa_pairs=state.get("qa_pairs", []),
        case_summary=state.get("case_summary"),
        clinical_correlations=state.get("clinical_correlations"),
        investigations=state.get("investigations", []),
        image_analysis=state.get("image_analysis"),
        differential_diagnosis=state.get("differential_diagnosis", []),
        medications=state.get("medications", []),
        procedures=state.get("procedures", []),
        triage_reasoning=state.get("triage_reasoning"),
        red_flags=cast(list[Any], state.get("red_flags") or []),
        is_safe=state.get("is_safe"),
        validation_warnings=state.get("validation_warnings", []),
        validation_recommendations=state.get("validation_recommendations", []),
        agent_telemetry=agent_telemetry,
        message=f"Phase: {_current_phase(state)}",
    )


@router.post("/sessions/{session_id}/respond", response_model=QuestionResponse, tags=["Sessions"])
async def respond_to_question(session_id: str, body: AnswerQuestionRequest, background_tasks: BackgroundTasks):
    """Submit an answer to the current question and resume the workflow in the background."""
    if session_id not in _active_sessions:
        raise HTTPException(status_code=404, detail="Session not found.")

    current_state = _get_graph_state(session_id)
    current_question = current_state.get("current_question")
    if not current_question:
        raise HTTPException(status_code=400, detail="No question is pending for this session.")

    det_lang = body.detected_language or current_state.get("detected_language", "en")

    # Inject the answer by updating state
    qa_entry = {
        "question": current_question,
        "answer": body.answer,
        "round_number": current_state.get("question_round", 0),
    }

    graph = get_compiled_graph()
    try:
        # Update state with the answer synchronously
        update_dict: dict[str, Any] = {"qa_pairs": [qa_entry], "current_question": None}
        if det_lang and det_lang != current_state.get("detected_language"):
            update_dict["detected_language"] = det_lang

        await graph.aupdate_state(
            _thread_config(session_id),
            update_dict,
        )
        
        _active_sessions[session_id]["status"] = "running"
        
        # Resume graph execution in the background
        background_tasks.add_task(_run_graph_in_background, session_id, {"resuming": True})

        return QuestionResponse(
            session_id=session_id,
            status="ok",
            message="Answer recorded. Processing...",
            next_question=None,
            next_question_translated=None,
            detected_language=det_lang,
            question_complete=True,
        )

    except Exception as exc:
        logger.error("[API] respond_to_question failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process answer: {exc}")


# Allowed image extensions for upload validation
_ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif"}
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


def _validate_upload_path(path: str, upload_dir) -> None:
    """Raise HTTPException if path is not inside upload_dir (path traversal guard)."""
    from pathlib import Path
    try:
        resolved = Path(path).resolve()
        resolved.relative_to(Path(upload_dir).resolve())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid image path: must be inside the uploads directory.",
        )


@router.post("/sessions/{session_id}/images", tags=["Sessions"])
async def add_images(session_id: str, body: AddImagesRequest):
    """Declare medical image paths to include in the analysis."""
    if session_id not in _active_sessions:
        raise HTTPException(status_code=404, detail="Session not found.")

    from pathlib import Path

    from medgraph.config import get_settings

    settings = get_settings()
    upload_root = settings.reports_dir / "uploads"

    # Validate each path: must be inside the uploads dir and have an allowed extension
    for p in body.image_paths:
        _validate_upload_path(p, upload_root)
        ext = Path(p).suffix.lower()
        if ext not in _ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(_ALLOWED_IMAGE_EXTENSIONS))}",
            )

    graph = get_compiled_graph()
    try:
        # image_paths uses operator.add reducer — LangGraph appends automatically
        await graph.aupdate_state(
            _thread_config(session_id),
            {"image_paths": body.image_paths},
        )
        return {"session_id": session_id, "status": "ok", "images_added": len(body.image_paths)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to add images: {exc}")


@router.post("/sessions/{session_id}/test_results", tags=["Sessions"])
async def submit_test_results(session_id: str, body: TestResultsRequest, background_tasks: BackgroundTasks):
    """Submit test results and resume the graph."""
    if session_id not in _active_sessions:
        raise HTTPException(status_code=404, detail="Session not found.")

    graph = get_compiled_graph()
    try:
        current_state = _get_graph_state(session_id)
        await graph.aupdate_state(
            _thread_config(session_id),
            {
                "waiting_for_tests": False,
                # image_paths uses operator.add reducer — just pass the new paths
                "image_paths": body.image_paths,
                # Inject text results as a properly-typed HistoryItem entry
                **({
                    "history": current_state.get("history", []) + [{
                        "type": "test_results",
                        "description": body.text_results,
                        "status": "received",
                        "since": "submitted with test results",
                    }]
                } if body.text_results else {}),
            },
        )
        _active_sessions[session_id]["status"] = "running"
        background_tasks.add_task(_run_graph_in_background, session_id, {"resuming": True})
        return {"session_id": session_id, "status": "ok", "message": "Test results recorded. Resuming..."}
    except Exception as exc:
        logger.error("[API] test_results failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to submit test results: {exc}")


@router.post("/sessions/{session_id}/upload-image", tags=["Sessions"])
async def upload_image(
    session_id: str,
    file: UploadFile = File(...),
    image_type: str = Form("unknown"),
):
    """
    Upload a medical image file.  The file is saved to the reports directory
    and its path is added to the session state.

    Validates file extension (must be a supported image format) and size
    (max 20 MB) before saving.
    """
    if session_id not in _active_sessions:
        raise HTTPException(status_code=404, detail="Session not found.")

    from pathlib import Path

    import aiofiles  # type: ignore[import-untyped]

    from medgraph.config import get_settings

    # --- Validate extension before reading the full content ---
    filename = file.filename or "image.bin"
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(_ALLOWED_IMAGE_EXTENSIONS))}",
        )

    content = await file.read()

    # --- Validate file size ---
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File too large: {len(content) / 1024 / 1024:.1f} MB. "
                f"Maximum allowed size is {_MAX_UPLOAD_BYTES // 1024 // 1024} MB. "
                "Please compress or resize the image before uploading."
            ),
        )

    settings = get_settings()
    upload_dir = settings.reports_dir / "uploads" / session_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    dest = upload_dir / filename
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    graph = get_compiled_graph()
    # image_paths uses operator.add reducer — LangGraph appends; no read-before-write needed
    await graph.aupdate_state(
        _thread_config(session_id),
        {"image_paths": [str(dest)]},
    )

    return {
        "session_id": session_id,
        "status": "ok",
        "saved_to": str(dest),
        "file_path": str(dest),
        "image_type": image_type,
    }


@router.post("/sessions/{session_id}/analyse-image", tags=["Sessions"])
async def analyse_image(
    session_id: str,
    file: UploadFile = File(...),
    image_type: str = Form("unknown"),
):
    """
    Upload and immediately analyse a medical image using MedGemma's vision capabilities.

    Saves the file, runs real-time multimodal analysis, appends the result to
    image_analysis in state (so the next questioner round is informed by it),
    and returns the analysis text to the UI.

    Validates file extension and size (max 20 MB) before saving.
    """
    if session_id not in _active_sessions:
        raise HTTPException(status_code=404, detail="Session not found.")

    import asyncio
    from pathlib import Path

    import aiofiles

    from medgraph.config import get_settings
    from medgraph.nodes._utils import build_context_prompt
    from medgraph.nodes.interpreter import analyse_image_now

    # --- Validate extension before reading the full content ---
    filename = file.filename or "image.bin"
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(_ALLOWED_IMAGE_EXTENSIONS))}",
        )

    content = await file.read()

    # --- Validate file size ---
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File too large: {len(content) / 1024 / 1024:.1f} MB. "
                f"Maximum allowed size is {_MAX_UPLOAD_BYTES // 1024 // 1024} MB. "
                "Please compress or resize the image before uploading."
            ),
        )

    settings = get_settings()
    upload_dir = settings.reports_dir / "uploads" / session_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    dest = upload_dir / filename
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    logger.info("[API] Saved image for real-time analysis: %s", dest)

    # Get current clinical context (read state before any concurrent awaits)
    current_state = _get_graph_state(session_id)
    clinical_context = build_context_prompt(current_state)

    # Run synchronous LLM call in a thread pool to avoid blocking the event loop.
    # Use get_running_loop() — get_event_loop() is deprecated in Python 3.10+ async contexts.
    analysis_result = await asyncio.get_running_loop().run_in_executor(
        None,
        analyse_image_now,
        str(dest),
        clinical_context,
    )

    # Build a readable analysis text to inject into state
    analysis_text_parts = [f"\n=== Real-time Image Analysis: {dest.name} ==="]
    analysis_text_parts.append(f"Summary: {analysis_result['summary']}")
    for finding in analysis_result.get("findings", []):
        analysis_text_parts.append(f"  • {finding}")
    if analysis_result.get("urgent_items"):
        analysis_text_parts.append("  ⚠️ URGENT: " + "; ".join(analysis_result["urgent_items"]))
    analysis_text = "\n".join(analysis_text_parts)

    # Append analysis text to state; image_paths uses operator.add so just pass the new path
    graph = get_compiled_graph()
    existing_analysis = current_state.get("image_analysis", "")
    await graph.aupdate_state(
        _thread_config(session_id),
        {
            "image_analysis": (existing_analysis + "\n" + analysis_text).strip(),
            "image_paths": [str(dest)],
        },
    )

    return {
        "session_id": session_id,
        "status": "ok",
        "saved_to": str(dest),
        "image_type": image_type,
        "analysis": {
            "summary": analysis_result["summary"],
            "findings": analysis_result.get("findings", []),
            "urgent": analysis_result.get("urgent", False),
            "urgent_items": analysis_result.get("urgent_items", []),
        },
    }


@router.get("/sessions/{session_id}/report", response_model=FinalReport, tags=["Reports"])
async def get_report(session_id: str):
    """
    Get the final clinical report.  Only available when the pipeline is complete.
    """
    state = _get_graph_state(session_id)
    if not state and session_id not in _active_sessions:
        raise HTTPException(status_code=404, detail="Session not found.")

    if session_id not in _active_sessions:
        _active_sessions[session_id] = {"status": "complete" if state.get("completed_at") else "running"}

    if not state.get("completed_at") and not state.get("is_emergency"):
        # Try to complete it if not done
        if not state.get("primary_diagnosis"):
            raise HTTPException(
                status_code=202,
                detail="Assessment still in progress. Check session status.",
            )

    return FinalReport(
        session_id=session_id,
        is_emergency=bool(state.get("is_emergency")),
        triage_level=state.get("triage_level", ""),
        primary_diagnosis=state.get("primary_diagnosis"),
        differential_diagnosis=state.get("differential_diagnosis", []),
        diagnosis_confidence=state.get("diagnosis_confidence", 0.0),
        medications=state.get("medications", []),
        procedures=state.get("procedures", []),
        lifestyle_modifications=state.get("lifestyle_modifications", []),
        follow_up=state.get("follow_up", ""),
        monitoring=state.get("monitoring", []),
        is_safe=bool(state.get("is_safe")),
        validation_warnings=state.get("validation_warnings", []),
        validation_recommendations=state.get("validation_recommendations", []),
        image_analysis=state.get("image_analysis", ""),
        disclaimer=MEDICAL_DISCLAIMER,
        started_at=state.get("started_at"),
        completed_at=state.get("completed_at"),
        agent_telemetry=_build_agent_telemetry(state),
    )


@router.delete("/sessions/{session_id}", tags=["Sessions"])
async def delete_session(session_id: str):
    """End and clean up a session."""
    _active_sessions.pop(session_id, None)
    return {"session_id": session_id, "status": "deleted"}


@router.get("/health", response_model=HealthResponse, tags=["System"])
async def health():
    """Health check with LLM provider information."""
    import medgraph
    from medgraph.config import get_settings
    from medgraph.llm import _ollama_available

    settings = get_settings()
    provider = (
        "ollama"
        if (settings.llm_provider == "auto" and _ollama_available())
        or settings.llm_provider == "ollama"
        else "openai"
    )

    return HealthResponse(
        status="healthy",
        version=medgraph.__version__,
        llm_provider=provider,
        active_sessions=len(_active_sessions),
    )


@router.get("/graph-diagram", tags=["System"])
async def graph_diagram():
    """Return a Mermaid diagram string of the compiled graph."""
    try:
        graph = get_compiled_graph()
        mermaid = graph.get_graph().draw_mermaid()
        return {"mermaid": mermaid}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not generate diagram: {exc}")


# ════════════════════════════════════════════════════════════════════════════
# DOCTOR & PATIENT AUTHENTICATION ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@router.post("/auth/login", tags=["Auth"])
async def api_login(payload: dict[str, Any]):
    """Login Doctor or Patient."""
    from medgraph.db.auth import login_user
    email = payload.get("email", "")
    password = payload.get("password", "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required.")

    profile, token_or_err = await login_user(email, password)
    if not profile:
        raise HTTPException(status_code=401, detail=token_or_err or "Invalid credentials.")

    return {
        "status": "ok",
        "user": profile.model_dump(),
        "token": token_or_err,
    }


@router.post("/auth/signup", tags=["Auth"])
async def api_signup(payload: dict[str, Any]):
    """Register Doctor or Patient account."""
    from medgraph.db.auth import signup_user
    email = payload.get("email", "")
    password = payload.get("password", "")
    full_name = payload.get("full_name", "")
    role = payload.get("role", "patient")

    if not email or not password or not full_name:
        raise HTTPException(status_code=400, detail="Email, password, and full name are required.")

    profile, token_or_err = await signup_user(
        email=email,
        password=password,
        full_name=full_name,
        role=role,
        license_number=payload.get("license_number"),
        specialty=payload.get("specialty"),
    )
    if not profile:
        raise HTTPException(status_code=400, detail=token_or_err or "Registration failed.")

    return {
        "status": "ok",
        "user": profile.model_dump(),
        "token": token_or_err,
    }


# ════════════════════════════════════════════════════════════════════════════
# ADMIN MANAGEMENT & USER REGISTRATION ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@router.post("/admin/register-doctor", tags=["Admin"])
async def api_register_doctor(payload: dict[str, Any]):
    """Admin endpoint: Register a new consulting Doctor account (Admin RBAC restricted)."""
    from medgraph.db.auth import signup_user
    from medgraph.db.client import get_db_client

    requester_role = payload.get("requester_role", "admin")
    if requester_role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: Executive Admin privileges required to register Doctor accounts.")

    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "DoctorPass2026!")
    full_name = payload.get("full_name", "").strip()
    license_number = payload.get("license_number", "MD-GEN-2026")
    specialty = payload.get("specialty", "Internal Medicine")
    department = payload.get("department", "Department of Medicine")

    if not email or not full_name:
        raise HTTPException(status_code=400, detail="Email and Full Name are required.")

    profile, token_or_err = await signup_user(
        email=email,
        password=password,
        full_name=full_name,
        role="doctor",
        license_number=license_number,
        specialty=specialty,
    )
    if not profile:
        raise HTTPException(status_code=400, detail=token_or_err or "Doctor registration failed.")

    # Also persist to live Supabase if configured
    client = get_db_client()
    if client.is_configured:
        await client.rest_request("POST", "user_profiles", json_data={
            "id": profile.id,
            "email": email,
            "full_name": full_name,
            "role": "doctor",
            "license_number": license_number,
            "specialty": specialty,
            "department": department,
        })

    return {
        "status": "ok",
        "message": f"Successfully registered Doctor: {full_name}",
        "doctor": profile.model_dump(),
    }


@router.post("/admin/register-patient", tags=["Admin"])
async def api_register_patient(payload: dict[str, Any]):
    """Admin endpoint: Register a new Patient Account and Clinical Record (Admin RBAC restricted)."""
    from medgraph.db.auth import signup_user
    from medgraph.db.repository import create_patient_profile

    requester_role = payload.get("requester_role", "admin")
    if requester_role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: Executive Admin privileges required to register Patient profiles.")

    full_name = payload.get("full_name", "").strip()
    date_of_birth = payload.get("date_of_birth", "1980-01-01").strip()
    gender = payload.get("gender", "male").strip()
    mrn = payload.get("mrn")
    email = payload.get("email", "").strip()
    phone = payload.get("phone", "").strip()
    allergies = payload.get("allergies", [])
    chronic_conditions = payload.get("chronic_conditions", [])
    current_medications = payload.get("current_medications", [])

    if not full_name:
        raise HTTPException(status_code=400, detail="Patient Full Name is required.")

    account_id = None
    if email:
        p_profile, _ = await signup_user(
            email=email,
            password=payload.get("password", "PatientPass2026!"),
            full_name=full_name,
            role="patient"
        )
        if p_profile:
            account_id = p_profile.id

    patient = await create_patient_profile(
        full_name=full_name,
        date_of_birth=date_of_birth,
        gender=gender,
        mrn=mrn,
        email=email,
        phone=phone,
        account_id=account_id,
        allergies=allergies if isinstance(allergies, list) else [{"allergen": allergies}],
        chronic_conditions=chronic_conditions if isinstance(chronic_conditions, list) else [{"condition": chronic_conditions}],
        current_medications=current_medications if isinstance(current_medications, list) else [{"name": current_medications}],
    )

    return {
        "status": "ok",
        "message": f"Successfully registered Patient: {full_name} ({patient.mrn})",
        "patient": patient.model_dump(),
    }


# ════════════════════════════════════════════════════════════════════════════
# PATIENT ACCOUNTS & CLINICAL REPOSITORY ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@router.get("/patients/search", tags=["Patients"])
async def api_search_patients(query: str = ""):
    """Search patient profiles for Doctor consultation selector."""
    from medgraph.db.repository import search_patients
    patients = await search_patients(query)
    return {"patients": [p.model_dump() for p in patients]}


@router.get("/patients/{patient_id}/history", tags=["Patients"])
async def api_patient_history(patient_id: str):
    """Retrieve full longitudinal history, profile, allergies, and local memories for a patient."""
    from medgraph.db.memory_manager import get_memory_manager
    from medgraph.db.repository import (
        get_patient_by_account_id,
        get_patient_by_mrn_or_id,
        list_patient_followups,
    )

    patient = await get_patient_by_account_id(patient_id)
    if not patient:
        patient = await get_patient_by_mrn_or_id(patient_id)

    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found.")

    mem_mgr = get_memory_manager()
    local_mems = await mem_mgr.query_local_memory(patient.id, limit=10)
    followups = await list_patient_followups(patient.id)

    return {
        "patient": patient.model_dump(),
        "local_memories": [m.model_dump() for m in local_mems],
        "followups": [f.model_dump() for f in followups],
    }


@router.post("/patients/{patient_id}/memory", tags=["Memory"])
async def api_add_local_memory(patient_id: str, payload: dict[str, Any]):
    """Add a new local clinical memory item for a patient."""
    from medgraph.db.memory_manager import get_memory_manager
    title = payload.get("title", "")
    content = payload.get("content", "")
    category = payload.get("memory_category", "episodic_visit")

    if not title or not content:
        raise HTTPException(status_code=400, detail="Title and content are required.")

    mem_mgr = get_memory_manager()
    item = await mem_mgr.store_local_memory(
        patient_id=patient_id,
        title=title,
        content=content,
        memory_category=category,
        session_id=payload.get("session_id"),
        metadata=payload.get("metadata", {}),
    )
    return {"status": "ok", "memory": item.model_dump()}


# ════════════════════════════════════════════════════════════════════════════
# PATIENT FOLLOW-UPS & DUAL-TIER MEMORY ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@router.get("/patients/{patient_id}/followups", tags=["Followups"])
async def api_list_followups(patient_id: str):
    """Retrieve scheduled follow-ups for a patient."""
    from medgraph.db.repository import list_patient_followups
    items = await list_patient_followups(patient_id)
    return {"followups": [f.model_dump() for f in items]}


@router.post("/patients/{patient_id}/followups", tags=["Followups"])
async def api_schedule_followup(patient_id: str, payload: dict[str, Any]):
    """Schedule a patient follow-up task."""
    from medgraph.db.repository import schedule_followup
    title = payload.get("title", "")
    due_date = payload.get("due_date", "")
    if not title or not due_date:
        raise HTTPException(status_code=400, detail="Title and due_date are required.")

    item = await schedule_followup(
        patient_id=patient_id,
        title=title,
        due_date=due_date,
        followup_type=payload.get("followup_type", "appointment"),
        description=payload.get("description"),
        doctor_id=payload.get("doctor_id"),
        session_id=payload.get("session_id"),
        notes=payload.get("notes"),
    )
    return {"status": "ok", "followup": item.model_dump()}


@router.get("/memory/global", tags=["Memory"])
async def api_query_global_memory(q: str = ""):
    """Retrieve items from the Global Cross-Patient Agent Knowledge Hub."""
    from medgraph.db.memory_manager import get_memory_manager
    mem_mgr = get_memory_manager()
    items = await mem_mgr.query_global_memory(q, limit=10)
    return {"global_memories": [i.model_dump() for i in items]}


@router.post("/patients/{patient_id}/interim-note", tags=["Memory"])
async def api_add_interim_note(patient_id: str, payload: dict[str, Any]):
    """
    Doctor adds a free-text interim note about what happened to the patient
    before the next appointment. The LLM summarises and categorises it, then
    stores it as a local memory item (and optionally a global memory entry
    if clinically significant).

    Body: { "note": "...", "doctor_id": "...", "session_id": "...", "patient_name": "..." }
    """
    from medgraph.db.memory_manager import get_memory_manager

    raw_note = payload.get("note", "").strip()
    if not raw_note:
        raise HTTPException(status_code=400, detail="'note' field is required and cannot be empty.")

    mem_mgr = get_memory_manager()
    result = await mem_mgr.store_interim_note(
        patient_id=patient_id,
        raw_note=raw_note,
        doctor_id=payload.get("doctor_id"),
        session_id=payload.get("session_id"),
        patient_name=payload.get("patient_name"),
    )
    return {
        "status": "ok",
        "title": result["title"],
        "summary": result["summary"],
        "is_globally_significant": result["is_globally_significant"],
        "local_memory": result["local_memory"],
        "global_memory": result["global_memory"],
    }


@router.get("/patients/{patient_id}/memory-timeline", tags=["Memory"])
async def api_memory_timeline(patient_id: str, limit: int = 20):
    """
    Full chronological memory timeline for a patient.
    Includes both AI-generated appointment summaries (source: 'auto')
    and doctor interim notes (source: 'doctor'), sorted newest-first.
    """
    from medgraph.db.memory_manager import get_memory_manager

    mem_mgr = get_memory_manager()
    timeline = await mem_mgr.get_patient_timeline(patient_id=patient_id, limit=limit)
    return {
        "patient_id": patient_id,
        "count": len(timeline),
        "timeline": timeline,
    }


@router.get("/sessions/{session_id}/appointment-summary", tags=["Memory"])
async def api_session_appointment_summary(session_id: str):
    """
    Get the appointment summary (local + global memory) for a specific session.
    Generated by appointment_memory_node at session completion.
    """
    from medgraph.db.client import get_db_client
    from medgraph.db.memory_manager import _appointment_summaries_db

    client = get_db_client()
    if client.is_configured:
        rows = await client.rest_request(
            "GET", "appointment_summaries",
            params={"session_id": f"eq.{session_id}"},
        )
        if rows:
            return {"status": "ok", "summary": rows[0]}

    # Fallback: in-memory store
    for s in _appointment_summaries_db:
        if s.get("session_id") == session_id:
            return {"status": "ok", "summary": s}

    return {"status": "not_found", "summary": None}


# ── ASR & Voice Endpoints ───────────────────────────────────────────────────

@router.post(
    "/api/v1/voice/transcribe",
    response_model=VoiceTranscribeResponse,
    tags=["Voice & ASR"],
    summary="Transcribe spoken audio via faster-whisper (large-v3)",
)
async def api_voice_transcribe(
    file: UploadFile = File(..., description="Audio recording file (webm/wav/mp3/ogg/m4a)"),
    model_name: str | None = Form(None, description="Whisper model override (e.g. large-v3, base)"),
    language: str | None = Form(None, description="Target language code (e.g. ur, hi, en) or 'auto'"),
):
    """
    Transcribe spoken clinical recording using high-precision faster-whisper.

    Supports automatic language detection with special comfort handling for
    **Urdu (`ur`)**, **Hindi (`hi`)**, and **English (`en`)**.
    """
    try:
        from medgraph.services.voice import transcribe_audio

        audio_bytes = await file.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

        filename = file.filename or "recording.webm"
        import asyncio
        result = await asyncio.to_thread(
            transcribe_audio,
            audio_bytes=audio_bytes,
            filename=filename,
            model_name=model_name,
            language=language,
        )
        return VoiceTranscribeResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice transcription error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Speech transcription failed: {str(e)}",
        )


@router.get(
    "/api/v1/voice/status",
    response_model=VoiceStatusResponse,
    tags=["Voice & ASR"],
    summary="Check faster-whisper ASR status and hardware capabilities",
)
async def api_voice_status():
    """Check ASR model loading status, hardware device (GPU/CPU), and capabilities."""
    try:
        from medgraph.services.voice import WhisperASRManager

        manager = WhisperASRManager.get_instance()
        return VoiceStatusResponse(**manager.status())
    except Exception as e:
        logger.error(f"Voice status error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/api/v1/voice/synthesize",
    tags=["Voice & ASR"],
    summary="Synthesize natural spoken audio (MP3) in Urdu, Hindi, or English",
)
async def api_voice_synthesize(
    text: str = Form(..., description="Clinical text or question to speak"),
    language: str = Form("en", description="Target language code (ur, hi, en)"),
):
    """
    Generate natural high-fidelity spoken MP3 audio from text.
    Provides natural audio fallback for browser client voice synthesis.
    """
    try:
        from medgraph.services.voice import synthesize_speech_async

        audio_mp3_bytes = await synthesize_speech_async(text=text, language=language)
        return Response(content=audio_mp3_bytes, media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"Voice synthesis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")


@router.post(
    "/api/v1/translate",
    response_model=TranslateResponse,
    tags=["Voice & Translation"],
    summary="Translate text between clinical conversation languages",
)
async def api_translate(body: TranslateRequest):
    """
    Translate patient presentation or clinical questions between Urdu, Hindi, English, etc.
    """
    try:
        from medgraph.api.models import TranslateResponse
        from medgraph.services.translation import translate_text

        translated = translate_text(
            text=body.text,
            source_lang=body.source_lang,
            target_lang=body.target_lang,
        )
        return TranslateResponse(
            original_text=body.text,
            translated_text=translated,
            source_lang=body.source_lang,
            target_lang=body.target_lang,
        )
    except Exception as e:
        logger.error(f"Translation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")


@router.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Return empty favicon icon to prevent 404 logs."""
    return Response(content=b"", media_type="image/x-icon")


