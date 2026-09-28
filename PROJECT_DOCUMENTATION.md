# 🩺 MedGraph — Comprehensive Project Documentation

> **MEDICAL DISCLAIMER**: MedGraph is an AI research system for **educational and research purposes only**. It does not constitute medical advice, diagnosis, or treatment. All outputs must be reviewed by qualified healthcare professionals before any clinical action is taken. In a medical emergency, call emergency services immediately (911 / 999 / 112).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Stack & Dependencies](#3-technology-stack--dependencies)
4. [Project Structure](#4-project-structure)
5. [Core Concepts](#5-core-concepts)
6. [Graph Pipeline — Node-by-Node Breakdown](#6-graph-pipeline--node-by-node-breakdown)
7. [Conditional Routing Logic](#7-conditional-routing-logic)
8. [Safety & Compliance System](#8-safety--compliance-system)
9. [Prompts System](#9-prompts-system)
10. [REST API](#10-rest-api)
11. [Interactive CLI](#11-interactive-cli)
12. [Voice & ASR Service](#12-voice--asr-service)
13. [Translation Service](#13-translation-service)
14. [Database Layer — Supabase](#14-database-layer--supabase)
15. [Dual-Tier Memory Manager](#15-dual-tier-memory-manager)
16. [Drug Interaction Checker Tool](#16-drug-interaction-checker-tool)
17. [Configuration & Environment Variables](#17-configuration--environment-variables)
18. [Testing](#18-testing)
19. [Data Flow — End-to-End Walkthrough](#19-data-flow--end-to-end-walkthrough)
20. [Report Output Structure](#20-report-output-structure)
21. [Key Design Decisions](#21-key-design-decisions)
22. [Setup & Installation](#22-setup--installation)

---

---

## 1. Project Overview

**MedGraph** (also branded as "MedAI by LTM Research") is a production-grade, multi-agent clinical AI pipeline. It implements a complete 9-to-11-node clinical reasoning workflow that takes a free-text patient description as input and produces a structured, validated clinical report including:

- Triage level assessment
- Adaptive follow-up questioning (SOCRATES framework)
- Clinical case synthesis
- Evidence-based investigation recommendations
- Medical image analysis (multimodal AI)
- Differential diagnosis with ICD-10 codes and probability scores
- Evidence-based treatment planning (medications, procedures, lifestyle)
- Safety validation with a retry loop
- Persistent dual-tier clinical memory (per-patient + cross-patient)

It is built on top of **LangGraph** (stateful multi-agent graph execution), powered by **MedGemma** (Google's medical-domain LLM running locally via Ollama), with an **OpenAI** fallback. It exposes both an interactive **Rich-powered CLI** and a **FastAPI REST API**, with **Supabase** as the persistent backend for memory and session records.

The system was originally a monolithic CrewAI-based system. MedGraph is a complete architectural rewrite with proper:
- Thread-safe, immutable state management
- Conditional routing and loops
- Emergency short-circuit detection
- Session-isolated human-in-the-loop Q&A
- Voice input (multilingual: English, Urdu, Hindi, Spanish, Arabic)
- Real-time translation
- Persistent clinical memory


---

## 2. High-Level Architecture

```
                            ┌─────────────────────────────────────────────────────┐
                            │               MedGraph Pipeline                     │
  Patient Input (text)      │   START                                             │
  ───────────────────────►  │     │                                               │
                            │     ▼                                               │
                            │   [intake] → Extract: demographics, symptoms,       │
                            │     │         history from free-text                │
                            │     ▼                                               │
                            │  [memory_recall] → Load patient profile/history +   │
                            │     │              cross-patient agent knowledge    │
                            │     ▼                                               │
                            │   [triage] → Assess urgency: emergency/urgent/      │
                            │     │         routine (2-layer: rule + LLM)         │
                            │     │                                               │
                            │     ├─ emergency ──→ [emergency] ──→ END            │
                            │     └─ continue                                     │
                            │          ▼                                          │
                            │       [questioner] ◄──────────────────┐            │
                            │          │         (adaptive Q&A loop) │            │
                            │          ├─ ask (human input) ─────────┘            │
                            │          └─ done                                    │
                            │               ▼                                     │
                            │          [case_builder] → Synthesise clinical       │
                            │               ▼                                     │
                            │          [investigator] → Recommend tests & imaging │
                            │               ├─ images uploaded                    │
                            │               │   └──→ [interpreter] → Analyse imgs │
                            │               └────────────────┐                    │
                            │                                ▼                    │
                            │                         [diagnostician] → Diff Dx   │
                            │                                ▼                    │
                            │                         [treatment] → Care plan      │
                            │                                ▼                    │
                            │                         [validator] → Safety check   │
                            │                          ├─ safe ──→ [memory_writer] │
                            │                          │             ──→ END       │
                            │                          └─ retry ──→ [treatment]    │
                            └─────────────────────────────────────────────────────┘
```

**Interfaces:**

| Interface | Command | Description |
|---|---|---|
| CLI | `uv run medgraph run` | Rich terminal interactive mode |
| REST API | `uv run medgraph serve` | FastAPI server at port 8000 |
| Programmatic | `from medgraph.graph import get_compiled_graph` | Direct Python use |


---

## 3. Technology Stack & Dependencies

### Core Runtime

| Library | Version | Purpose |
|---|---|---|
| `langgraph` | ≥0.2.60 | Multi-agent graph execution framework |
| `langchain` | ≥0.3.0 | LLM abstraction layer |
| `langchain-core` | ≥0.3.0 | Core message/model primitives |
| `langchain-ollama` | ≥0.2.0 | Ollama (MedGemma) integration |
| `langchain-openai` | ≥0.2.0 | OpenAI fallback integration |
| `langchain-community` | ≥0.3.0 | Community tools |
| `langgraph-checkpoint-sqlite` | ≥1.0.0 | SQLite-backed session checkpointing |

### API & Web

| Library | Version | Purpose |
|---|---|---|
| `fastapi` | ≥0.115.0 | REST API framework |
| `uvicorn[standard]` | ≥0.32.0 | ASGI server |
| `python-multipart` | ≥0.0.12 | File upload support |
| `httpx` | ≥0.27.0 | Async HTTP client for Supabase |

### AI & Voice

| Library | Version | Purpose |
|---|---|---|
| `faster-whisper` | ≥1.0.0 | Multilingual speech-to-text (ASR) |
| `edge-tts` | ≥7.0.0 | Microsoft neural TTS (primary) |
| `gtts` | ≥2.5.0 | Google TTS (fallback) |

### Data & Config

| Library | Version | Purpose |
|---|---|---|
| `pydantic` | ≥2.9.0 | Data validation & schemas |
| `pydantic-settings` | ≥2.6.0 | Environment-based configuration |
| `python-dotenv` | ≥1.0.0 | `.env` file loading |
| `aiofiles` | ≥24.1.0 | Async file operations |

### CLI & Display

| Library | Version | Purpose |
|---|---|---|
| `rich` | ≥13.9.0 | Terminal UI, tables, progress bars |
| `typer` | ≥0.13.0 | CLI command framework |

### Dev Tools

| Library | Purpose |
|---|---|
| `pytest` + `pytest-asyncio` + `pytest-cov` | Testing |
| `ruff` | Linting & formatting |
| `mypy` | Static type checking |

### External Services

| Service | Purpose |
|---|---|
| **Ollama** (local) | Hosts MedGemma 1.5 locally |
| **MedGemma 1.5** | Primary medical LLM with vision capabilities |
| **OpenAI GPT-4o-mini** | Fallback LLM when Ollama is unavailable |
| **Supabase** | PostgreSQL database + Auth + Storage |


---

## 4. Project Structure

```
medgraph/
├── src/
│   └── medgraph/                     <- Python package root
│       ├── __init__.py               <- Package entry point
│       ├── config.py                 <- Centralised pydantic-settings configuration
│       ├── state.py                  <- MedicalState TypedDict (session schema)
│       ├── llm.py                    <- LLM factory: Ollama / OpenAI auto-detection
│       ├── embeddings.py             <- Embeddings factory (optional semantic memory retrieval)
│       ├── prompts.py                <- All system & user-facing prompts (centralized)
│       ├── safety.py                 <- Rule-based emergency detection & treatment checks
│       ├── graph.py                  <- LangGraph StateGraph builder + compiler
│       ├── cli.py                    <- Rich-powered interactive terminal CLI
│       ├── nodes/                    <- One file per graph node
│       │   ├── _utils.py             <- Shared: parse_llm_json(), build_context_prompt()
│       │   ├── intake.py             <- Node 1: Structured patient data extraction
│       │   ├── memory_recall.py      <- Node 1.5: Load patient + agent memory into the session
│       │   ├── triage.py             <- Node 2: Urgency assessment + triage_router
│       │   ├── emergency.py          <- Node 3: Emergency guidance (early exit)
│       │   ├── questioner.py         <- Node 4: Adaptive Q&A + questioner_router
│       │   ├── case_builder.py       <- Node 5: Clinical case synthesis
│       │   ├── investigator.py       <- Node 6: Test recommendations + investigator_router
│       │   ├── interpreter.py        <- Node 7: Medical image analysis (multimodal)
│       │   ├── diagnostician.py      <- Node 8: Differential diagnosis generation
│       │   ├── treatment.py          <- Node 9: Evidence-based treatment planning
│       │   ├── validator.py          <- Node 10: Safety validation + validator_router
│       │   └── memory_writer.py      <- Node 11: Persist summaries to Supabase
│       ├── tools/
│       │   └── drug_checker.py       <- LangChain tool: rule-based drug interaction checker
│       ├── services/
│       │   ├── voice.py              <- Whisper ASR + Edge/gTTS speech synthesis
│       │   └── translation.py        <- Multilingual translation bridge
│       ├── db/
│       │   ├── client.py             <- Supabase REST client (async httpx)
│       │   ├── models.py             <- Pydantic DB models for all tables
│       │   ├── memory_manager.py     <- Dual-tier memory CRUD (local + global)
│       │   ├── auth.py               <- Supabase Auth helpers
│       │   └── repository.py         <- High-level query patterns
│       └── api/
│           ├── app.py                <- FastAPI application + CORS + lifespan
│           ├── models.py             <- API request/response Pydantic schemas
│           ├── routes.py             <- All route handlers (1221 lines)
│           └── static/               <- Served frontend (HTML/CSS/JS)
├── tests/
│   ├── test_nodes.py                 <- Unit tests for each node (mocked LLM)
│   ├── test_graph.py                 <- Graph integration tests
│   └── test_api.py                   <- API endpoint tests
├── supabase/
│   └── schema.sql                    <- Full PostgreSQL schema for Supabase
├── docs/
│   └── architecture.md               <- Developer architecture overview
├── reports/                          <- Generated clinical report JSON files
├── pyproject.toml
├── .env.example
└── uv.lock
```


---

## 5. Core Concepts

### 5.1 MedicalState — The Session State Object

**File:** `src/medgraph/state.py`

Every piece of data flowing through the graph lives in a single `MedicalState` TypedDict. This is the **single source of truth** for an entire patient session.

**Design Principles:**
- **Immutable per-invocation**: LangGraph creates a new copy of state on each node execution, merging partial updates.
- **Per-thread-isolated**: Each session gets its own `thread_id` in the checkpointer — no shared global state.
- **Append-safe**: Fields marked `Annotated[list, operator.add]` allow multiple nodes to safely append items without overwriting.

**State Field Groups:**

| Group | Key Fields | Produced By |
|---|---|---|
| Session Metadata | `session_id`, `started_at`, `completed_at` | system |
| Raw Input | `patient_input`, `detected_language` | user input |
| Intake | `demographics`, `symptoms`, `history` | intake_node |
| Triage | `triage_level`, `suspected_domains`, `triage_reasoning`, `is_emergency`, `emergency_info` | triage_node |
| Adaptive Q&A | `pending_questions`, `current_question`, `qa_pairs` (append), `question_round`, `question_complete`, `image_requested_by_qa` | questioner_node |
| Case Building | `case_summary`, `key_findings`, `clinical_correlations` | case_builder_node |
| Investigations | `investigations`, `images_requested`, `waiting_for_tests` | investigator_node |
| Image Interpretation | `image_paths` (append), `image_analysis` | interpreter_node |
| Diagnosis | `differential_diagnosis`, `primary_diagnosis`, `diagnosis_confidence` | diagnostician_node |
| Treatment | `medications`, `procedures`, `lifestyle_modifications`, `follow_up`, `monitoring`, `treatment_retry_count` | treatment_node |
| Safety Validation | `is_safe`, `validation_warnings`, `validation_recommendations` | validator_node |
| Memory Recall | `patient_context`, `patient_history_snippets`, `relevant_agent_knowledge` | memory_recall_node |
| Memory IDs | `patient_id`, `local_memory_id`, `global_memory_id` | memory_writer |
| Errors | `error`, `node_errors` (append) | any node |

**Typed Sub-Schemas:**

| TypedDict | Key Fields |
|---|---|
| `DemographicsDict` | age, gender, weight_kg, height_cm, occupation, ethnicity |
| `SymptomDict` | description, severity, onset, duration, location, character, aggravating, relieving |
| `HistoryItem` | type (condition/medication/allergy/surgery/family), description, status, since |
| `QAPair` | question, answer, round_number |
| `DiagnosisEntry` | condition, probability (0–1), icd_code, evidence, rule_out_tests |
| `MedicationEntry` | name, dose, route, frequency, duration, indication, contraindications |
| `InvestigationEntry` | test_name, category, indication, priority, expected_findings |
| `ValidationWarning` | severity (low/medium/high/critical), message, field |


### 5.2 LangGraph StateGraph

**File:** `src/medgraph/graph.py`

The graph is a `StateGraph(MedicalState)` with:
- **12 registered nodes** (11 clinical + 1 helper `increment_retry`)
- **2 interrupt nodes**: `ask_human` and `ask_for_test_results` (dummy passthrough nodes for checkpointing)
- **4 conditional routers**: `triage_router`, `questioner_router`, `investigator_router`, `validator_router`
- **Compiled with** `interrupt_before=["ask_human", "ask_for_test_results"]`

**Checkpointer strategy:**
- Default: `MemorySaver()` — in-memory, reset on server restart
- Optional: `SqliteSaver` — persistent, via `CHECKPOINT_DB_PATH` setting
- Graph is cached via `@lru_cache(maxsize=1)` — built only once per process

---

### 5.3 LLM Factory & Provider Strategy

**File:** `src/medgraph/llm.py`

All nodes call `get_llm(task_type)` — a single factory function. It auto-detects the best available provider at startup (cached).

**Provider selection:**
1. `LLM_PROVIDER=ollama` → always use Ollama
2. `LLM_PROVIDER=auto` → HTTP probe to Ollama `/api/tags` (3s timeout)
3. MedGemma available → `ChatOllama(model="medgemma1.5")`
4. Ollama unavailable + `OPENAI_API_KEY` set → `ChatOpenAI`
5. Neither configured → `RuntimeError` with instructions

**Task-specific temperature & token configuration:**

| Task | Temperature | Max Tokens | Rationale |
|---|---|---|---|
| `triage` | 0.0 | 2048 | Deterministic safety classification |
| `validation` | 0.0 | 4096 | Deterministic safety check |
| `intake` | 0.1 | 2048 | Factual extraction only |
| `investigation` | 0.1 | 2048 | Evidence-based structured output |
| `diagnosis` | 0.1 | 4096 | Multiple differentials with evidence |
| `treatment` | 0.1 | 4096 | Structured care plan |
| `interpretation` | 0.1 | 4096 | Detailed multimodal findings |
| `case_builder` | 0.1 | 4096 | Detailed clinical narrative |
| `questioning` | 0.2 | 2048 | Slight variation for empathetic tone |
| `general` | 0.1 | 2048 | Default |


---

## 6. Graph Pipeline — Node-by-Node Breakdown

### Node 1: Intake (`intake_node`)
**File:** `src/medgraph/nodes/intake.py`

**Role:** Transform raw free-text patient description into structured clinical data.

**Input:** `state["patient_input"]` — the raw patient description string.

**Process:**
1. Sends patient input to LLM with `INTAKE_SYSTEM` prompt
2. LLM returns JSON parsed against `IntakeResult` (Pydantic model)
3. Validated result returned as partial state update

**Output:** `demographics`, `symptoms`, `history`

**Prompt rules:** Extract ONLY what is explicitly stated — never infer. Return valid JSON. Use null for absent fields.

**Error handling:** Returns empty structures, logs to `node_errors`. Pipeline continues.

---

### Node 1.5: Memory Recall (`memory_recall_node`)
**File:** `src/medgraph/nodes/memory_recall.py`

**Role:** Load per-patient and cross-patient memory into the session, closing the
loop with `memory_writer` — without this node, both memory tiers are write-only.

**Process:** Deterministic, no LLM call (same reasoning as `emergency_node`). If
`state["patient_id"]` is set, loads the patient's clinical profile (allergies,
chronic conditions, current medications) via the patient repository, and the most
relevant past visits via `DualTierMemoryManager.query_local_memory`. Always queries
`query_global_memory` for relevant cross-patient knowledge — this applies even to a
first-time patient with no `patient_id`.

**Output:** `patient_context`, `patient_history_snippets`, `relevant_agent_knowledge`
— all three are rendered into every downstream node's prompt via
`build_context_prompt`, and `patient_context.allergies` feeds a deterministic
safety check in `validator_node` (see §8 and §15).

**Error handling:** Any DB/lookup failure is caught and logged to `node_errors`;
returns empty defaults. Never blocks the pipeline.

---

### Node 2: Triage (`triage_node` + `triage_router`)
**File:** `src/medgraph/nodes/triage.py`

**Role:** Assess urgency and identify medical specialties. First safety gate.

**Two-Layer Assessment:**

**Layer 1 — Rule-based (instant, no LLM):**
- Keyword-scans for critical keywords (chest pain, stroke, seizure, overdose, etc.)
- Critical keyword found → immediately returns `triage_level="emergency"` without LLM call
- Ensures critical patients are never delayed by LLM latency/failures

**Layer 2 — LLM-based (nuanced):**
- Calls LLM with `TRIAGE_SYSTEM` (temperature=0.0)
- Escalation logic: If rule-based says "urgent" but LLM says "routine" → escalates to "urgent"

**Output:** `triage_level` (emergency/urgent/routine), `suspected_domains`, `triage_reasoning`, `is_emergency`, `emergency_info`

**Router:** `triage_router` → `"emergency"` or `"continue"`

**Fallback:** LLM failure defaults to `triage_level="urgent"` (conservative)

---

### Node 3: Emergency (`emergency_node`)
**File:** `src/medgraph/nodes/emergency.py`

**Role:** Handle critical emergencies with immediate structured guidance. **Early exit — does NOT run the full pipeline.**

For true emergencies, speed > thoroughness. Returns `EMERGENCY_CRITICAL_RESPONSE` or `EMERGENCY_URGENT_RESPONSE` with:
- Call emergency services immediately (911/999/112)
- Immediate action instructions
- "Do NOT" list
- Medical disclaimer

Graph routes to `END` after this node.

---

### Node 4: Questioner (`questioner_node` + `questioner_router`)
**File:** `src/medgraph/nodes/questioner.py`

**Role:** Adaptive structured clinical interview — primary human-in-the-loop point.

**Q&A Strategy:**
- **Round 0 only:** LLM generates a complete ordered list of all clinical questions covering SOCRATES framework, past medical history, medications & allergies, family/social history, review of systems.
- Questions stored in `pending_questions` queue
- Each round pops the next question → sets as `current_question` → graph pauses at `ask_human`

**Loop termination:**
1. `pending_questions` empty (all questions answered)
2. `question_round >= MAX_QUESTION_ROUNDS` (default: 10)

**Router:** `questioner_router` → `"ask"` (loop) or `"done"` (proceed to case builder)

**CLI mode:** Answers injected via `graph.aupdate_state()`
**API mode:** Graph interrupted at `ask_human`, resumed via `POST /sessions/{id}/respond`


### Node 5: Case Builder (`case_builder_node`)
**File:** `src/medgraph/nodes/case_builder.py`

**Role:** Synthesise all collected data into a unified clinical narrative.

**Process:** Builds full context from state, calls LLM with `CASE_BUILDER_SYSTEM` (temperature=0.1, 4096 tokens)

**Output:** `case_summary` (unified paragraph), `key_findings` (bullet list), `clinical_correlations`

This is the "clinical story" used by all downstream nodes (diagnosis, treatment) as primary reasoning context.

---

### Node 6: Investigator (`investigator_node` + `investigator_router`)
**File:** `src/medgraph/nodes/investigator.py`

**Role:** Recommend evidence-based diagnostic tests and imaging.

**Output:** `investigations` (list with category/priority), `images_requested`, `waiting_for_tests`

**Investigation categories:** `lab`, `imaging`, `procedure`, `functional`
**Priority levels:** `urgent`, `routine`, `elective`

**Router:** `investigator_router`:
- `"ask_for_test_results"` → graph pauses waiting for image uploads
- `"interpret"` → images available, route to interpreter
- `"diagnose"` → no images, skip to diagnostician

---

### Node 7: Interpreter (`interpreter_node`) — Conditional
**File:** `src/medgraph/nodes/interpreter.py`

**Role:** Analyse uploaded medical images using MedGemma's multimodal vision.

**Only executed if `image_paths` is populated.**

**Image support:** JPEG, PNG, GIF, WEBP, BMP, TIFF — max 20 MB per image

**Process:** Encodes each image as Base64, sends as multimodal `image_url` content block with clinical context. Processes images one at a time, combines all findings.

**Also provides:** `analyse_image_now()` — real-time API function for images uploaded during Q&A phase.

**Prompt:** `INTERPRETER_SYSTEM` + `IMAGE_ANALYSIS_PROMPT` — instructs to identify modality, describe all findings systematically, flag urgencies, correlate with clinical context.

**Output:** `image_analysis` (combined free-text interpretation of all images)

---

### Node 8: Diagnostician (`diagnostician_node`)
**File:** `src/medgraph/nodes/diagnostician.py`

**Role:** Generate ranked differential diagnosis with probability estimates.

**Input context:** All intake, triage, Q&A, case summary, investigations, and image analysis.

**Process:** LLM with `DIAGNOSTICIAN_SYSTEM` (temperature=0.1, 4096 tokens), results sorted descending by probability.

**Prompt rules:**
- 3–5 conditions ordered by probability
- **Always include most dangerous conditions** even if less likely
- Include ICD-10 codes and supporting evidence

**Output:** `differential_diagnosis` (sorted list), `primary_diagnosis`, `diagnosis_confidence`

---

### Node 9: Treatment (`treatment_node`)
**File:** `src/medgraph/nodes/treatment.py`

**Role:** Create comprehensive, evidence-based treatment and care plan.

**On retry:** Receives `validation_warnings` from previous failed validation so LLM can revise the plan.

**Prompt follows:** AHA, WHO, NICE clinical guidelines. Considers drug interactions, allergies, patient-specific factors.

**Output:** `medications` (name/dose/route/frequency/indication/contraindications), `procedures`, `lifestyle_modifications`, `follow_up`, `monitoring`


### Node 10: Validator (`validator_node` + `validator_router`)
**File:** `src/medgraph/nodes/validator.py`

**Role:** Safety and consistency review of the treatment plan — final quality gate.

**Two-Layer Validation:**

**Layer 1 — Rule-based (deterministic):**
- Dangerous recommendation patterns (regex scan)
- Missing follow-up → medium severity warning
- No monitoring plan → medium severity warning
- Insulin without diabetes context → high severity warning

**Layer 2 — LLM-based (temperature=0.0):**
- Drug-drug interactions
- Contraindicated medications
- Unsafe doses
- Treatment alignment with primary diagnosis
- Guideline compliance

**Merging:** Both warning sets combined. Any `high`/`critical` warning → `is_safe=False`

**Also sets:** `completed_at` timestamp on success.

**Router:** `validator_router`:
- `"safe"` → `memory_writer` → END (when `is_safe=True`)
- `"retry"` → `increment_retry` → `treatment` (when unsafe and `retry_count < MAX_TREATMENT_RETRIES`)
- After max retries: routes `"safe"` with warnings (avoids infinite loop)

---

### Node 11: Memory Writer (`appointment_memory_node`)
**File:** `src/medgraph/nodes/memory_writer.py`

**Role:** After validation, generate and persist two clinical memory types to Supabase.

**Step 1 — Local Patient Memory:**
- LLM generates patient-scoped clinical summary (third-person, max 400 words)
- Format: "Patient presented with..."
- Includes: chief complaint, diagnosis, medications, safety notes, follow-up
- Categories: `episodic_visit`, `med_intolerance`, `chronic_trend`, `lab_baseline`, `general`
- Stored to `local_patient_memory` table

**Step 2 — Global Agent Memory:**
- LLM generates **de-identified** cross-patient clinical intelligence
- **Strictly NO patient identifiers**
- Extracts: diagnostic patterns, treatment efficacy, safety anomalies, symptom clusters
- Includes `pattern_graph` JSON (symptoms → diagnoses → treatments)
- Stored to `global_agent_memory` table

**Step 3 — Appointment Summary:**
- Links both memory records to the session in `appointment_summaries` table
- Includes diagnosis, triage level, medications, follow-up plan

**Error handling:** Each step independently try-caught. Memory failures don't break the pipeline.


---

## 7. Conditional Routing Logic

All routers are pure functions: `(state: MedicalState) -> str`

### `triage_router`
```python
return "emergency" if state.get("is_emergency") else "continue"
```

### `questioner_router`
```python
return "done" if state.get("question_complete") else "ask"
```

### `investigator_router`
```python
if state.get("waiting_for_tests"):     return "ask_for_test_results"
if state.get("image_paths"):           return "interpret"
return "diagnose"
```

### `validator_router`
```python
if state.get("is_safe"):  return "safe"
if retry_count < MAX_TREATMENT_RETRIES:  return "retry"
return "safe"  # max retries exceeded — proceed with warnings
```

### `_increment_retry` helper node
```python
return {"treatment_retry_count": state.get("treatment_retry_count", 0) + 1}
```

---

## 8. Safety & Compliance System

**File:** `src/medgraph/safety.py`

### Emergency Detection Keywords

**Critical keywords** (immediate emergency exit, no LLM called):
```
chest pain, difficulty breathing, can't breathe, shortness of breath,
unconscious, unresponsive, severe bleeding, vomiting blood, coughing blood,
heart attack, myocardial infarction, stroke, facial drooping, arm weakness,
speech difficulty, seizure, anaphylaxis, allergic reaction, overdose,
suicide, self-harm, severe chest tightness
```

**Urgent keywords** (escalation):
```
severe pain, high fever, fever above 39/40, confusion, sudden weakness,
sudden vision loss, severe headache, thunderclap headache,
palpitations, racing heart, irregular heartbeat, sudden numbness
```

### Dangerous Treatment Patterns (Regex)
```
stop \w+ medication immediately
ignore the symptoms
self[-\s]treat serious
delay emergency care
avoid hospital
do not seek medical
```

### `validate_treatment_safety(treatment, known_allergies)` Checks
- Missing `follow_up` → medium severity warning
- No `monitoring` → medium severity warning
- Insulin without diabetes context in text → high severity warning
- `known_allergies` (from `patient_context`, loaded by `memory_recall_node`) cross-checked
  against prescribed medication names and known drug families (e.g. penicillin allergy →
  flags amoxicillin/ampicillin/augmentin) via `check_allergy_contraindications` →
  **critical** severity warning, independent of the LLM's own judgment

### Disclaimer System
- `MEDICAL_DISCLAIMER`: Appended to all API responses and CLI reports
- `HIPAA_NOTE`: Privacy note about temporary session storage
- `add_disclaimer(response)`: Utility that attaches disclaimer to any response dict


---

## 9. Prompts System

**File:** `src/medgraph/prompts.py`

All LLM prompts are centralised in one file. Every prompt enforces: return exactly one valid JSON object, no markdown fences, strict output schema.

| Prompt Constant | Node | Purpose |
|---|---|---|
| `INTAKE_SYSTEM` | intake | Extract demographics, symptoms, history |
| `TRIAGE_SYSTEM` | triage | Classify urgency (emergency/urgent/routine) |
| `QUESTIONER_SYSTEM` | questioner | Generate SOCRATES-ordered question list |
| `CASE_BUILDER_SYSTEM` | case_builder | Synthesise clinical narrative |
| `INVESTIGATOR_SYSTEM` | investigator | Recommend evidence-based tests & imaging |
| `INTERPRETER_SYSTEM` | interpreter | Structured medical image interpretation |
| `IMAGE_ANALYSIS_PROMPT` | interpreter | Multi-modal image examination instructions |
| `DIAGNOSTICIAN_SYSTEM` | diagnostician | Ranked differential diagnosis |
| `TREATMENT_SYSTEM` | treatment | Evidence-based care plan |
| `VALIDATOR_SYSTEM` | validator | Safety and drug interaction review |
| `RADIOLOGIST_SYSTEM` | (available) | Expert radiologist imaging interpretation |
| `LOCAL_MEMORY_SUMMARY_SYSTEM` | memory_writer | Patient-scoped clinical summary |
| `GLOBAL_MEMORY_SUMMARY_SYSTEM` | memory_writer | De-identified cross-patient knowledge |
| `INTERIM_NOTE_SUMMARY_SYSTEM` | API routes | Doctor-written interim note structuring |
| `EMERGENCY_CRITICAL_RESPONSE` | emergency | Critical emergency response template |
| `EMERGENCY_URGENT_RESPONSE` | emergency | Urgent response template |
| `MEDICAL_DISCLAIMER` | CLI, API | Standard disclaimer text |
| `HIPAA_NOTE` | API | Privacy policy notice |


---

## 10. REST API

### 10.1 FastAPI Application Setup
**File:** `src/medgraph/api/app.py`

- **Framework:** FastAPI with async `lifespan` context manager
- **CORS:** Wildcard `*` origins, methods, and headers
- **Static files:** Serves frontend from `api/static/` at root path
- **OpenAPI docs:** `/docs` (Swagger UI) and `/redoc`

**Startup actions:**
1. Configure logging
2. Pre-warm compiled graph (`get_compiled_graph()`) — built once
3. Probe Ollama availability (cached)
4. Create `reports/` directory

### 10.2 API Request/Response Models
**File:** `src/medgraph/api/models.py`

**Request Models:**

| Model | Key Fields |
|---|---|
| `StartSessionRequest` | `session_id`, `patient_description`, `detected_language`, `patient_description_original` |
| `AnswerQuestionRequest` | `answer`, `detected_language`, `answer_original` |
| `AddImagesRequest` | `image_paths: list[str]` |
| `TestResultsRequest` | `image_paths`, `text_results`, `skipped` |
| `TranslateRequest` | `text`, `source_lang`, `target_lang` |

**Response Models:**

| Model | Key Fields |
|---|---|
| `SessionStartResponse` | `session_id`, `status`, `message`, `emergency`, `emergency_info`, `current_question` |
| `SessionStateResponse` | `status`, `current_phase`, `triage_level`, `current_question`, `completion_percentage` (0–100%), `demographics`, `symptoms`, `qa_pairs`, `differential_diagnosis`, `medications`, `agent_telemetry` |
| `QuestionResponse` | `next_question`, `question_complete` |
| `FinalReport` | All diagnosis + treatment + safety fields + `agent_telemetry` |
| `HealthResponse` | `status`, `llm_provider`, `active_sessions` |
| `VoiceTranscribeResponse` | `text`, `language`, `language_name`, `language_flag`, `speech_locale`, `comfort_message`, `segments` |
| `VoiceStatusResponse` | `is_loaded`, `model_name`, `device`, `gpu_available`, `gpu_name` |


### 10.3 API Endpoints Reference
**File:** `src/medgraph/api/routes.py`

**Sessions:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/sessions` | Start a new clinical reasoning session |
| `GET` | `/sessions/{session_id}` | Get current state (status, question, full data) |
| `POST` | `/sessions/{session_id}/respond` | Submit answer to current Q&A question |
| `POST` | `/sessions/{session_id}/images` | Add image file paths for analysis |
| `POST` | `/sessions/{session_id}/test_results` | Submit test results or skip |
| `GET` | `/sessions/{session_id}/report` | Get final clinical report |
| `DELETE` | `/sessions/{session_id}` | Clean up session |

**Voice & ASR:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/voice/transcribe` | Upload audio → transcribed text + detected language |
| `POST` | `/voice/speak` | Text → MP3 audio bytes (Edge Neural TTS) |
| `GET` | `/voice/status` | ASR engine load status and GPU info |

**Translation:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/translate` | Translate text between languages |

**System:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | API health check with LLM provider info |

**Memory / Database:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/patients/{patient_id}/memories` | Retrieve local patient memory records |
| `GET` | `/memories/global` | Retrieve global agent knowledge records |
| `POST` | `/patients/{patient_id}/interim_note` | Doctor writes interim note |
| `GET` | `/patients/{patient_id}/followups` | List scheduled follow-ups |

### 10.4 Session Lifecycle

```
POST /sessions  →  Status: "running"
                         (graph runs intake + triage in background)
GET  /sessions/{id}  →  Status: "awaiting_answer", current_question: "When did it start?"
POST /sessions/{id}/respond  (repeat for each question)
                         Status: "running"
                         (case_builder → investigator)
[if images requested]
GET  /sessions/{id}  →  Status: "awaiting_test_results"
POST /sessions/{id}/test_results
                         Status: "running"
                         (interpreter → diagnostician → treatment → validator → memory_writer)
GET  /sessions/{id}  →  Status: "complete"
GET  /sessions/{id}/report  →  FinalReport JSON
```


### 10.5 Human-in-the-Loop Mechanism

Uses LangGraph's checkpoint-interrupt pattern:

1. Graph compiled with `interrupt_before=["ask_human", "ask_for_test_results"]`
2. Graph reaches interrupt node → pauses, saves state to checkpointer
3. API reads `state["current_question"]` and returns to caller
4. `POST /sessions/{id}/respond` received:
   ```python
   await graph.aupdate_state(config, {
       "qa_pairs": [{"question": q, "answer": ans, "round_number": n}],
       "current_question": None,
   })
   await graph.ainvoke(None, config)  # resume from checkpoint
   ```

---

## 11. Interactive CLI

**File:** `src/medgraph/cli.py`

A Rich-powered terminal interface using Typer + Rich.

### `medgraph run` — Interactive Clinical Session
```bash
uv run medgraph run
uv run medgraph run --patient "45yo male with chest pain"
uv run medgraph run --session-id my-session --verbose
```

**Flow:**
1. Display header panel and medical disclaimer
2. Prompt for disclaimer acknowledgement
3. Accept patient description (with clinical default example)
4. Run intake + triage with spinner progress bar
5. Interactive Q&A loop: display question → `Prompt.ask()` → inject answer → resume
6. Optional: prompt for medical image file paths (comma-separated)
7. Run remaining pipeline with progress bar
8. Render **Final Clinical Report** as Rich tables and panels:
   - Triage assessment panel (colored: red/yellow/green by level)
   - Differential diagnosis table (probability percentages, ICD codes)
   - Primary diagnosis panel
   - Medications table
   - Care plan panel (lifestyle, follow-up, monitoring)
   - Safety validation panel
9. Save JSON report to `reports/report_{session_id}_{timestamp}.json`

### `medgraph serve` — Start API Server
```bash
uv run medgraph serve
uv run medgraph serve --host 0.0.0.0 --port 8000 --reload
```

---

## 12. Voice & ASR Service


**File:** `src/medgraph/services/voice.py`

### Whisper ASR (Speech-to-Text)

Powered by `faster-whisper` (CTranslate2-optimised Whisper):

- **Thread-safe singleton** (`WhisperASRManager`): One model instance, protected by `threading.Lock()`
- **Lazy loading**: Model loaded on first transcription call, not startup
- **Auto device detection**: CUDA GPU (float16) → CPU (int8) fallback
- **Model config**: Default `large-v3`, automatic fallback to `base` if large model fails
- **Two-pass transcription**: First without VAD (max sensitivity), second with VAD if first returns empty

**Supported languages:** Urdu (ur-PK), Hindi (hi-IN), English (en-US), Spanish (es-ES), Arabic (ar-SA), Chinese (zh-CN), and all other Whisper-supported languages.

**Transcription output includes:**
- Full transcript text
- Detected language (ISO code, display name, flag emoji)
- Language detection confidence (0.0–1.0)
- Audio duration (seconds)
- Multilingual comfort message
- Detailed timestamp segments

**Multilingual comfort messages:**
- Urdu: "آپ کی آواز کامیابی سے ریکارڈ ہو گئی ہے۔"
- Hindi: "आपकी आवाज़ सफलतापूर्वक रिकॉर्ड हो गई है।"
- English: "Audio transcribed successfully. Your clinical details are being processed."

### TTS (Text-to-Speech) — `synthesize_speech_async()`

**Primary: Microsoft Edge Neural TTS (`edge-tts`)**

| Language | Neural Voice |
|---|---|
| Urdu | ur-PK-AsadNeural |
| Hindi | hi-IN-SwaraNeural |
| English | en-US-AvaNeural |
| Spanish | es-ES-ElviraNeural |
| Arabic | ar-SA-HamedNeural |

**Fallback:** Google TTS (`gtts`) if Edge TTS fails.

**`clean_text_for_speech(text)`:** Pre-processes text before TTS — removes HTML, ICD brackets, markdown headers/bullets/bold markers, collapses whitespace.

---

## 13. Translation Service

**File:** `src/medgraph/services/translation.py`

Bidirectional clinical translation enabling non-English patients to interact in their native language:
- **Patient → English**: Translates input for LLM reasoning
- **English → Patient language**: Translates AI questions back for display and TTS

**Two-tier implementation (no API key required):**
1. **`deep_translator`** (primary): `GoogleTranslator` if package installed
2. **`urllib` fallback**: Directly calls `translate.googleapis.com` using stdlib only

**Language code normalisation:**

| Input | Output |
|---|---|
| "urdu", "ur" | "ur" |
| "hindi", "hi" | "hi" |
| "english", "en" | "en" |
| "spanish", "es" | "es" |
| "arabic", "ar" | "ar" |
| "chinese", "zh" | "zh-CN" |

**Helper functions:**
- `translate_to_english(text, source_lang)` — shortcut for LLM input preparation
- `translate_from_english(text, target_lang)` — shortcut for patient-facing output

---

## 14. Database Layer — Supabase

### 14.1 Schema Overview
**File:** `supabase/schema.sql`

**Extensions:** `uuid-ossp`, `pgcrypto`, `vector` (pgvector for 1536-dim embeddings)

| Table | Purpose |
|---|---|
| `user_profiles` | Extends Supabase `auth.users` — role (doctor/patient/admin), specialty, license |
| `patients` | Clinical patient profiles — MRN, demographics, allergies, medications |
| `sessions` | LangGraph session records — status, phase, triage level, completion % |
| `agent_telemetry` | Per-node execution records for observability |
| `local_patient_memory` | Tier 1: Patient-scoped episodic/semantic memory with vector embeddings |
| `global_agent_memory` | Tier 2: De-identified cross-patient collective intelligence with embeddings |
| `patient_followups` | Scheduled follow-up appointments, lab tests, medication checks |
| `appointment_summaries` | Links each session to its local + global memory records |

### 14.2 Dual-Tier Memory System

**Tier 1 — Local Patient Memory (`local_patient_memory`)**
- `memory_category`: `episodic_visit` | `med_intolerance` | `chronic_trend` | `lab_baseline` | `general`
- `embedding VECTOR(1536)`: Dense vector for semantic similarity retrieval
- `note_type`: `auto` (AI-generated) | `interim_note` (doctor-written between appointments)
- Created by: AI pipeline (`memory_writer` node) + doctors via `POST /patients/{id}/interim_note`

**Tier 2 — Global Agent Memory (`global_agent_memory`)**
- `knowledge_type`: `diagnostic_pattern` | `treatment_efficacy` | `safety_anomaly` | `symptom_cluster`
- `pattern_graph`: JSON graph of symptom → diagnosis → treatment relationships
- `case_count`: How many cases contributed to this pattern
- `confidence_score`: Aggregate confidence across contributing cases
- `embedding VECTOR(1536)`: For global semantic retrieval

### 14.3 Row Level Security (RLS)

| Table | Policy |
|---|---|
| `user_profiles` | Users view own profile only |
| `patients` | Patients see own; doctors/admins see all |
| `sessions` | Patients see own; doctors/admins manage all |
| `local_patient_memory` | Patients see own; doctors/admins manage all |
| `patient_followups` | Patients see own; doctors/admins manage all |
| `appointment_summaries` | Patients see own; doctors/admins manage all |

### 14.4 Vector Search

IVFFlat indexes for fast cosine similarity search:
```sql
CREATE INDEX local_mem_vector_idx
ON public.local_patient_memory
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX global_mem_vector_idx
ON public.global_agent_memory
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

## 15. Dual-Tier Memory Manager

**File:** `src/medgraph/db/memory_manager.py`

The `DualTierMemoryManager` class provides high-level CRUD for all memory operations, with **in-memory fallback** for development when Supabase is not configured.

| Method | Description |
|---|---|
| `store_local_memory(patient_id, title, content, memory_category, ...)` | Save local patient memory to Supabase (embeds it if an embedding provider is configured) |
| `query_local_memory(patient_id, query_text, limit)` | Retrieve patient memories — semantic search if embeddings available, else keyword relevance |
| `store_global_memory(topic, summary, knowledge_type, pattern_graph, ...)` | Save global knowledge item — reinforces (increments `case_count`, blends `confidence_score`) an existing similar-topic row instead of inserting a duplicate |
| `query_global_memory(query_text, limit)` | Retrieve global knowledge records — semantic search if embeddings available, else keyword relevance |
| `store_appointment_summary(session_id, patient_id, ...)` | Create appointment summary linking both memory tiers |
| `store_interim_note(patient_id, raw_note, doctor_id, ...)` | Doctor note → LLM-summarised → stored as local memory |

**Read side (closing the loop):** `memory_recall_node` (§6, Node 1.5) calls
`query_local_memory` and `query_global_memory` at the start of every session — both
tiers are no longer write-only. See §8 for how `patient_context.allergies` also
feeds a deterministic safety check in `validator_node`.

**Pre-seeded fallback data** (dev/test without Supabase):
- Two sample local memories (Penicillin allergy, Asthma exacerbation)
- Two global patterns (PE vs Asthma differential cues, Beta-blocker in asthma safety anomaly)

**`_compute_keyword_score(text, query)`:** Word overlap ratio for relevance ranking — the
default, and automatic fallback, whenever semantic vector search isn't available.

**Semantic retrieval (optional, `src/medgraph/embeddings.py`):** `get_embeddings()`
returns a real embeddings client (Ollama's configured embedding model, or OpenAI's
`text-embedding-3-small`) when one is configured, else `None`. When available,
`store_local_memory`/`store_global_memory` compute and persist the vector (the
`embedding VECTOR(1536)` column already existed in the schema but was previously
always `NULL`), and `query_local_memory`/`query_global_memory` retrieve via the
`match_local_memory`/`match_global_memory` pgvector cosine-similarity Postgres
functions (`supabase/schema.sql`) called through a PostgREST RPC. Any failure — no
provider configured, the RPC not migrated into Supabase yet, Supabase itself not
configured — falls straight back to keyword scoring, so this requires no
configuration change to keep working exactly as before.

---

## 16. Drug Interaction Checker Tool

**File:** `src/medgraph/tools/drug_checker.py`

A LangChain `@tool`-decorated function for fast deterministic drug-drug interaction checking.

| Drug A | Drug B | Severity |
|---|---|---|
| Warfarin | Aspirin | Major: Increased bleeding risk |
| Warfarin | Ibuprofen | Major: Increased bleeding risk |
| MAOI | SSRI | Contraindicated: Serotonin syndrome |
| MAOI | Tramadol | Contraindicated: Serotonin syndrome |
| Simvastatin | Clarithromycin | Major: Myopathy/rhabdomyolysis risk |
| Metformin | Alcohol | Moderate: Lactic acidosis risk |
| Digoxin | Amiodarone | Major: Digoxin toxicity |
| Clopidogrel | Omeprazole | Moderate: Reduced antiplatelet effect |
| Lithium | Ibuprofen | Major: Lithium toxicity |
| Methotrexate | NSAID | Major: Methotrexate toxicity |

> Note: Production deployment should call clinical drug interaction APIs such as OpenFDA, DrugBank, or RxNorm for comprehensive checking.

---

## 17. Configuration & Environment Variables

**File:** `src/medgraph/config.py`

All configuration uses `pydantic-settings` (`BaseSettings`). Reads from `.env` file and environment variables. Singleton cached via `@lru_cache(maxsize=1)`.

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server endpoint |
| `MEDGEMMA_MODEL` | `medgemma1.5` | MedGemma model name |
| `OPENAI_API_KEY` | *(empty)* | OpenAI API key (fallback) |
| `OPENAI_FALLBACK_MODEL` | `gpt-4o-mini` | OpenAI fallback model |
| `LLM_PROVIDER` | `auto` | `auto` / `ollama` / `openai` |
| `EMBEDDING_PROVIDER` | `auto` | `auto` / `ollama` / `openai` / `none` — optional, for semantic memory retrieval |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Ollama embedding model name (used when the Ollama path is active) |
| `API_HOST` | `0.0.0.0` | Server bind address |
| `API_PORT` | `8000` | Server port |
| `API_RELOAD` | `False` | Hot reload (dev only) |
| `WHISPER_MODEL` | `large-v3` | faster-whisper model size |
| `WHISPER_DEVICE` | `auto` | `auto` / `cuda` / `cpu` |
| `WHISPER_COMPUTE_TYPE` | `default` | `float16` / `int8` / `default` |
| `MAX_QUESTION_ROUNDS` | `10` | Max Q&A rounds before proceeding |
| `MAX_TREATMENT_RETRIES` | `2` | Max treatment plan retries |
| `SUPABASE_URL` | *(empty)* | Supabase project URL |
| `SUPABASE_KEY` | *(empty)* | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | *(empty)* | Supabase admin key |
| `CHECKPOINT_DB_PATH` | *(empty)* | SQLite path (blank = in-memory) |
| `REPORTS_DIR` | `./reports` | Directory for clinical report JSON files |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |

---

## 18. Testing

**Directory:** `tests/`

```bash
# Run all tests (no LLM required — uses mocked LLM)
uv run pytest tests/ -v

# With coverage report
uv run pytest tests/ -v --cov=src/medgraph --cov-report=term-missing
```

| File | Coverage |
|---|---|
| `tests/test_nodes.py` | Unit tests for each node with mocked LLM responses |
| `tests/test_graph.py` | Graph structure, edge connections, node registration |
| `tests/test_api.py` | API endpoint integration tests |

**Test config (`pyproject.toml`):**
- `asyncio_mode = "auto"` — all async tests auto-detected
- `addopts = "-v --tb=short"`
- `ruff` line-length: 100, target: py310
- `mypy` with `ignore_missing_imports=true`

**Root-level test scripts:**
- `test_parse.py`: Quick JSON parsing utility test
- `test_qa.py`: Quick Q&A flow test
- `test_qa_loop.py`: Full Q&A loop integration test

---

## 19. Data Flow — End-to-End Walkthrough

Complete trace for: *"45yo male, sudden sharp chest pain radiating to left arm, shortness of breath for 2 hours, hypertension history, smokes 1 pack/day"*

1. **Safety pre-check** (`safety.detect_emergency`): Finds "chest pain" → level="urgent" (no immediate critical exit)

2. **`intake_node`**:
   - Demographics: `{age: 45, gender: "male"}`
   - Symptoms: `[{description: "chest pain", location: "left arm radiation", severity: "severe"}]`
   - History: `[{type: "condition", description: "hypertension"}, {type: "condition", description: "smoking"}]`

3. **`triage_node`**:
   - LLM returns: `triage_level="emergency"`, `suspected_domains=["cardiology"]`
   - `is_emergency=True` → `triage_router` returns `"emergency"`

4. **`emergency_node`**:
   - Returns: "CALL EMERGENCY SERVICES IMMEDIATELY (911/999/112)"
   - Graph ends here for emergency cases.

**For a non-emergency case ("mild headache for 3 days"):**

4. `triage_node`: `triage_level="routine"`, continues to questioner
5. `questioner_node` (Round 0): LLM generates 8–12 questions (SOCRATES, medications, family history)
6. Q&A Loop: Each round pops question → pauses → user answers → resumes
7. `case_builder_node`: Synthesises "32yo female presents with bilateral frontal headache, 6/10..."
8. `investigator_node`: Recommends CBC, metabolic panel, consider CT head if no improvement
9. `interpreter_node`: (skipped if no images)
10. `diagnostician_node`: `[{"Tension Headache", 0.72, "G44.2"}, {"Migraine", 0.20}, ...]`
11. `treatment_node`: Ibuprofen 400mg TID PRN, sleep hygiene, 2-week follow-up
12. `validator_node`: Rule check OK + LLM check OK → `is_safe=True` → routes to memory_writer
13. `memory_writer`: Local memory (tension headache visit) + global memory (tension headache diagnostic pattern)
14. Report saved to `reports/`

---

## 20. Report Output Structure

The final report is a JSON representation of the completed `MedicalState`. Key fields:

```json
{
  "session_id": "patient-001",
  "started_at": "2026-08-12T08:00:00Z",
  "completed_at": "2026-08-12T08:15:32Z",
  "triage_level": "urgent",
  "suspected_domains": ["cardiology"],
  "is_emergency": false,
  "demographics": {"age": 45, "gender": "male"},
  "symptoms": [{"description": "chest pain", "severity": "severe"}],
  "primary_diagnosis": "Unstable Angina",
  "diagnosis_confidence": 0.78,
  "differential_diagnosis": [
    {
      "condition": "Unstable Angina",
      "probability": 0.78,
      "icd_code": "I20.0",
      "evidence": ["chest pain", "diaphoresis", "hypertension"],
      "rule_out_tests": ["Troponin I/T", "ECG", "Stress Test"]
    },
    {
      "condition": "NSTEMI",
      "probability": 0.65,
      "icd_code": "I21.4",
      "evidence": ["radiating pain", "shortness of breath"]
    }
  ],
  "medications": [
    {
      "name": "Aspirin",
      "dose": "300mg",
      "route": "oral",
      "frequency": "once",
      "indication": "Antiplatelet for ACS",
      "contraindications": ["active GI bleeding"]
    }
  ],
  "procedures": [{"procedure": "12-lead ECG", "urgency": "urgent"}],
  "lifestyle_modifications": ["Smoking cessation", "Low-sodium diet"],
  "follow_up": "Cardiology review within 24 hours",
  "monitoring": ["Serial troponin", "Blood pressure q4h"],
  "is_safe": true,
  "validation_warnings": [],
  "disclaimer": "FOR RESEARCH PURPOSES ONLY...",
  "local_memory_id": "uuid-...",
  "global_memory_id": "uuid-..."
}
```

---

## 21. Key Design Decisions

### Why LangGraph over CrewAI?

| Concern | CrewAI (original) | LangGraph (MedGraph) |
|---|---|---|
| State management | Global mutable `PatientState` (race conditions) | Immutable `TypedDict` per invocation |
| Branching | Fixed sequential execution | Conditional edges + router functions |
| Q&A loop | Commented out / broken | First-class graph cycle with proper interrupts |
| Emergency routing | No dedicated path | `triage_router` → early exit node |
| Session isolation | All API requests share global state | `MemorySaver` with `thread_id` per session |
| Streaming | Not supported | `astream_events()` ready |
| Observability | Print statements | `agent_telemetry` per-node timing records |

### Two-Layer Safety Philosophy

Every safety-critical decision uses a **rule-first, LLM-second** approach:
- Rules are deterministic (no LLM hallucination risk), instant, and fail-safe
- LLM layer adds nuance and clinical reasoning only AFTER rules pass
- When in doubt (LLM error), conservative defaults apply (escalate triage, flag safety)

### Memory Architecture: Why Two Tiers?

**Problem:** A single memory store creates a privacy/utility tension:
- Too patient-specific → poor generalisation, no learning
- Too anonymised → loses patient context for continuity of care

**Solution:** Two separate tables with different access patterns:
- **Local**: Rich patient context, PII included, per-patient retrieval
- **Global**: Distilled clinical intelligence, strictly de-identified, cross-patient retrieval

### Why `faster-whisper` over OpenAI Whisper?

- CTranslate2 backend → 2–4× faster inference
- Same model weights, better hardware utilisation
- GPU/CPU auto-detection for any deployment
- No network call required (fully local ASR)

### Emergency Detection: Why Not LLM-Only?

LLM calls take 1–5 seconds. In a true emergency:
- Every second of delay is clinically significant
- LLM may hallucinate or mis-classify under ambiguous input
- Rule-based detection of 25+ critical keywords is instant and deterministic

---

## 22. Installation & Setup

### Prerequisites
- Python ≥ 3.10
- `uv` package manager
- Ollama (for MedGemma) OR OpenAI API key

### 1. Clone and Install
```bash
git clone <repo-url> medgraph
cd medgraph
uv sync
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_KEY=your-anon-key
# OPENAI_API_KEY=sk-...  (optional, if not using Ollama)
```

### 3. Set Up MedGemma (Recommended)
```bash
# Install Ollama from https://ollama.com
ollama pull medgemma1.5
# Verify:
ollama run medgemma1.5 "What is the normal range for blood glucose?"
```

### 4. Set Up Supabase (Optional — for persistent memory)
```bash
# 1. Create project at supabase.com
# 2. Run schema in SQL editor:
cat supabase/schema.sql | pbcopy  # paste into Supabase SQL editor
# 3. Update .env with your project URL and anon key
```

### 5. Run the CLI
```bash
uv run medgraph run
```

### 6. Run the API Server
```bash
uv run medgraph serve
# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

---

## 23. Observability & Telemetry

### `agent_telemetry` Table

Every node execution is recorded in the `agent_telemetry` Supabase table:

| Field | Type | Description |
|---|---|---|
| `session_id` | UUID | Session reference |
| `node_name` | TEXT | Name of the executed node |
| `started_at` | TIMESTAMPTZ | Node start timestamp |
| `completed_at` | TIMESTAMPTZ | Node end timestamp |
| `duration_ms` | INTEGER | Execution time in milliseconds |
| `status` | TEXT | `success` / `error` / `skipped` |
| `error_message` | TEXT | Error detail if status=error |
| `token_count` | INTEGER | Approximate LLM tokens used |

### `SessionStateResponse.agent_telemetry`

The `/sessions/{id}` endpoint includes an `agent_telemetry` array — a list of all nodes executed so far, with timing. This powers the frontend progress visualization.

### `completion_percentage`

Calculated dynamically from the current phase:

| Phase | Percentage |
|---|---|
| `intake` | 10% |
| `triage` | 20% |
| `questioning` | 20–40% (scales with question rounds) |
| `case_building` | 50% |
| `investigation` | 60% |
| `interpretation` | 65% |
| `diagnosis` | 75% |
| `treatment` | 85% |
| `validation` | 92% |
| `complete` | 100% |

---

## 24. Known Limitations & Future Work

### Current Limitations

1. **No real drug interaction API**: The `drug_checker.py` tool uses a hardcoded 10-entry lookup. Production deployments should integrate OpenFDA, DrugBank, or RxNorm.

2. **Vector embeddings are optional, not automatic**: `DualTierMemoryManager` now supports real semantic retrieval via `src/medgraph/embeddings.py` (Ollama's embedding model, or OpenAI's `text-embedding-3-small`) against the existing Supabase pgvector columns, but falls back to keyword overlap scoring whenever no embedding provider is configured — which is the default out of the box. Configure `EMBEDDING_PROVIDER`/`EMBEDDING_MODEL` and re-run `supabase/schema.sql` (for the `match_local_memory`/`match_global_memory` functions) to enable it.

3. **MemorySaver is ephemeral**: In-memory checkpointer loses all sessions on server restart. Enable `CHECKPOINT_DB_PATH` for persistence.

4. **Single-process concurrency**: Multiple concurrent API sessions share one Python process. For high load, deploy multiple uvicorn workers or use an async task queue.

5. **No authentication on API endpoints**: The REST API has no auth middleware — any caller can start sessions or read reports. Add Supabase Auth JWT validation for production.

6. **Image paths not validated**: `AddImagesRequest.image_paths` accepts any file path string. In production, images should be uploaded via multipart form and stored server-side.

### Planned Enhancements

- [ ] Real-time streaming via Server-Sent Events (SSE) using `astream_events()`
- [ ] FHIR R4 export for EHR integration
- [ ] Actual vector embedding generation and semantic memory search
- [ ] Multi-patient dashboard with session history
- [ ] Doctor review/override workflow
- [ ] Audit log for HIPAA compliance
- [ ] Kubernetes deployment manifests
- [ ] Comprehensive E2E test suite with patient scenario fixtures

---

## 25. Glossary

| Term | Definition |
|---|---|
| **LangGraph** | A library for building stateful, multi-actor LLM applications as directed graphs |
| **MedGemma** | Google's medical-domain large language model, fine-tuned for clinical reasoning |
| **Ollama** | Local LLM server that hosts models like MedGemma on consumer hardware |
| **StateGraph** | LangGraph's primary class for defining a graph of nodes and edges over a shared state |
| **MedicalState** | The `TypedDict` schema holding all session data for one patient encounter |
| **Thread ID** | A unique string per session; used by LangGraph's checkpointer to isolate state |
| **Checkpoint** | A saved snapshot of the graph state, enabling pause-resume (human-in-the-loop) |
| **Interrupt** | A LangGraph mechanism that pauses graph execution at a specific node for human input |
| **SOCRATES** | Clinical pain assessment framework: Site, Onset, Character, Radiation, Associations, Timing, Exacerbating/Relieving, Severity |
| **ICD-10** | International Classification of Diseases, 10th Revision — standard diagnostic codes |
| **Triage Level** | Urgency classification: `emergency` (immediate threat) / `urgent` (hours) / `routine` (days) |
| **Differential Diagnosis** | A ranked list of possible diagnoses ordered by clinical probability |
| **RLS** | Row Level Security — Supabase/PostgreSQL feature for per-row access control |
| **pgvector** | PostgreSQL extension for storing and querying vector embeddings |
| **ASR** | Automatic Speech Recognition — converts spoken audio to text |
| **TTS** | Text-to-Speech — converts text to spoken audio |
| **HITL** | Human-in-the-Loop — a pattern where a human provides input mid-pipeline |
| **Pydantic** | Python data validation library using type annotations |
| **FastAPI** | Modern async Python web framework for building REST APIs |
| **Supabase** | Open-source Firebase alternative: PostgreSQL + Auth + Storage + Realtime |
