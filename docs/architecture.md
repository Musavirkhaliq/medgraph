# MedGraph Architecture

## Overview

MedGraph is a multi-agent medical reasoning system built on **LangGraph** — a
production-grade graph execution framework for stateful, multi-step AI workflows.

The system implements a complete clinical pipeline with 9 specialised reasoning
nodes, conditional routing, and a human-in-the-loop Q&A cycle.

---

## Why LangGraph?

| Feature | CrewAI (original) | LangGraph (new) |
|---|---|---|
| State management | Global mutable `PatientState` | Immutable `TypedDict` per invocation |
| Branching | Fixed sequential order | Conditional edges + router functions |
| Q&A loop | Commented out / broken | First-class graph cycle |
| Emergency routing | Heuristic post-processing | Dedicated router → early exit |
| Session isolation | Race condition (1 global state) | `MemorySaver` + `thread_id` per session |
| Streaming | Not supported | `astream_events()` out of the box |
| Observability | Print statements | Full LangGraph tracing + checkpoints |

---

## State Schema (`MedicalState`)

The entire session lives in a single `TypedDict`. Every node receives the
current state and returns a *partial update* — LangGraph merges it immutably.

```python
class MedicalState(TypedDict, total=False):
    # Session
    session_id: str
    patient_input: str

    # Intake
    demographics: DemographicsDict
    symptoms: list[SymptomDict]
    history: list[HistoryItem]

    # Triage
    triage_level: str           # emergency | urgent | routine
    suspected_domains: list[str]
    is_emergency: bool

    # Adaptive Q&A
    current_question: Optional[str]
    qa_pairs: Annotated[list[QAPair], operator.add]   # append-only
    question_round: int
    question_complete: bool

    # Clinical
    case_summary: str
    investigations: list[InvestigationEntry]
    image_paths: list[str]
    image_analysis: str

    # Diagnosis
    differential_diagnosis: list[DiagnosisEntry]
    primary_diagnosis: Optional[str]
    diagnosis_confidence: float

    # Treatment
    medications: list[MedicationEntry]
    procedures: list[dict]
    lifestyle_modifications: list[str]
    follow_up: str
    monitoring: list[str]
    treatment_retry_count: int

    # Validation
    is_safe: bool
    validation_warnings: list[ValidationWarning]   # replaced each validator pass, not appended

    # Memory recall (loaded by memory_recall_node, right after intake)
    patient_context: dict                          # allergies, chronic_conditions, current_medications
    patient_history_snippets: list[dict]           # relevant past visits for this patient
    relevant_agent_knowledge: list[dict]           # relevant cross-patient agent knowledge
```

**Key design:** `Annotated[list, operator.add]` fields are *append-only* —
multiple nodes can safely append without overwriting each other, making the
system thread-safe.

---

## Graph Topology

```mermaid
flowchart TD
    START([__start__]) --> intake[intake_node]
    intake --> memory_recall[memory_recall_node]
    memory_recall --> triage[triage_node]
    triage -->|emergency| emergency[emergency_node]
    triage -->|continue| questioner[questioner_node]
    emergency --> END([__end__])
    questioner -->|ask| questioner
    questioner -->|done| case_builder[case_builder_node]
    case_builder --> investigator[investigator_node]
    investigator -->|interpret| interpreter[interpreter_node]
    investigator -->|diagnose| diagnostician[diagnostician_node]
    interpreter --> diagnostician
    diagnostician --> treatment[treatment_node]
    treatment --> validator[validator_node]
    validator -->|safe| END
    validator -->|retry| increment_retry[increment_retry]
    increment_retry --> treatment
```

---

## Node Descriptions

### 1. `intake_node`
**Role:** Extract structured data from free-text patient input.

**Input:** `patient_input` (raw text)  
**Output:** `demographics`, `symptoms`, `history`  
**LLM config:** temperature=0.1, low tokens (facts only)

Uses a strict Pydantic output schema to ensure consistent structured extraction.

---

### 1.5 `memory_recall_node`
**Role:** Load per-patient and cross-patient memory into the session.

Runs right after intake, before triage. Deterministic and LLM-free (like
`emergency_node`), so it stays fast. If `patient_id` is set, loads the patient's
clinical profile (allergies, chronic conditions, current medications) and the
most relevant past visits from `local_patient_memory`. Always queries
`global_agent_memory` for relevant cross-patient knowledge, even for a
first-time patient. All of this is injected into every downstream node's prompt
via `build_context_prompt`, and the allergy list feeds a deterministic safety
check in `validator_node`. See **Memory Architecture** below.

---

### 2. `triage_node`
**Role:** Assess urgency and identify medical domains.

**Input:** All intake data  
**Output:** `triage_level`, `suspected_domains`, `is_emergency`

**Two-layer safety:**
1. Rule-based keyword scan (fast, no LLM) — catches obvious emergencies
2. LLM-based assessment — nuanced triage reasoning
3. Escalation logic: if rule-check says "urgent" but LLM says "routine", escalate

**Router:** `triage_router` → `"emergency"` or `"continue"`

---

### 3. `emergency_node`
**Role:** Handle critical cases with immediate guidance.

Terminates the graph early with a structured emergency response. Does NOT
run the full diagnostic pipeline — speed is more important than thoroughness
for emergencies.

---

### 4. `questioner_node` ⟳
**Role:** Adaptive clinical interviewer.

Asks ONE high-value question per round. The graph loops back to this node
until either:
- The LLM decides sufficient information exists (`next_question=null`)
- `MAX_QUESTION_ROUNDS` is reached (configurable, default: 5)

**Router:** `questioner_router` → `"ask"` (loop) or `"done"` (proceed)

In the API, the graph is interrupted here for human input via
`POST /sessions/{id}/respond`.

---

### 5. `case_builder_node`
**Role:** Synthesise all collected data into a clinical narrative.

Combines demographics, symptoms, history, triage, and Q&A answers into
a coherent case summary with key findings and clinical correlations.

---

### 6. `investigator_node`
**Role:** Recommend diagnostic tests and imaging.

**Router:** `investigator_router` → `"interpret"` (if images uploaded) or `"diagnose"`

---

### 7. `interpreter_node` (conditional)
**Role:** Analyse uploaded medical images.

Only executed if `image_paths` is populated. Generates a structured text
analysis of findings for downstream diagnosis.

---

### 8. `diagnostician_node`
**Role:** Generate differential diagnosis.

Produces a ranked list of 3-5 conditions with probability estimates, ICD codes,
and supporting evidence — considering all available information.

---

### 9. `treatment_node` ⟳
**Role:** Create comprehensive treatment plan.

On retry (triggered by validator failure), receives the validation warnings
as context and revises the plan accordingly.

---

### 10. `validator_node`
**Role:** Safety and consistency review.

**Two layers:**
1. Rule-based pre-check: missing follow-up, dangerous patterns, insulin without diabetes,
   and a deterministic allergy cross-check against `patient_context.allergies`
   (loaded by `memory_recall_node`) — independent of the LLM's own judgment
2. LLM review: drug interactions, contraindications, guideline compliance

**Router:** `validator_router`
- `"safe"` → END
- `"retry"` → loop back to treatment (up to `MAX_TREATMENT_RETRIES`)
- After max retries: proceed with warnings rather than infinite loop

---

## LLM Configuration

All LLM access goes through `medgraph.llm.get_llm(task_type)`:

```python
from medgraph.llm import get_llm

llm = get_llm("triage")     # temperature=0.0 (deterministic)
llm = get_llm("diagnosis")  # temperature=0.1, max_tokens=2048
```

**Auto-detection:**
1. Probe Ollama for MedGemma availability (cached at startup)
2. If available → `ChatOllama(model="medgemma1.5")`
3. If not → `ChatOpenAI(model="gpt-4o-mini")` (requires `OPENAI_API_KEY`)

---

## API Design

### Session Lifecycle
```
POST /sessions          → start session, runs intake + triage
GET  /sessions/{id}     → check status and current question
POST /sessions/{id}/respond → submit answer to Q&A question
POST /sessions/{id}/images  → declare image paths
GET  /sessions/{id}/report  → get final report (when complete)
DELETE /sessions/{id}   → clean up
```

### Session Isolation
Each API session maps to a LangGraph `thread_id`. All state is stored in the
`MemorySaver` checkpointer keyed by this thread. There is **no global mutable
state** — concurrent sessions cannot interfere.

### Human-in-the-Loop
```
graph.ainvoke(state, {"configurable": {"thread_id": session_id}})
  → pauses at questioner_node if question pending
  → returns current_question to API

# User submits answer:
graph.aupdate_state(config, {"qa_pairs": [qa_entry], "current_question": None})
graph.ainvoke(None, config)  # resume
```

---

## Memory Architecture

MedGraph has a **dual-tier memory system** — per-patient and cross-patient — with
both a write side (runs at session end) and a read side (runs at session start):

| Tier | Table | Written by | Read by |
|---|---|---|---|
| Per-patient profile (entity memory) | `patients` | doctor registration | `memory_recall_node` |
| Per-patient episodic memory | `local_patient_memory` | `appointment_memory_node` | `memory_recall_node` |
| Cross-patient agent memory | `global_agent_memory` | `appointment_memory_node` | `memory_recall_node` |

**Write side (`appointment_memory_node`, end of session):**
- LOCAL memory: an LLM-generated, patient-scoped clinical summary of the completed visit.
- GLOBAL memory: a de-identified diagnostic/treatment/safety pattern. `store_global_memory`
  first checks for an existing similar-topic row of the same `knowledge_type`
  (keyword-overlap ≥ 0.6) and **reinforces it** (increments `case_count`, blends
  `confidence_score`) instead of inserting an unbounded duplicate row — this is how
  the "agent-level" memory actually accumulates evidence over many cases rather than
  just growing a flat log.

**Read side (`memory_recall_node`, right after intake):**
- Loads the patient's profile (allergies, chronic conditions, current medications)
  and the most relevant past visits (`query_local_memory`).
- Always queries cross-patient knowledge (`query_global_memory`), even for a
  first-time patient — collective learning isn't gated on having a `patient_id`.
- Everything is written into `patient_context` / `patient_history_snippets` /
  `relevant_agent_knowledge`, then rendered into every downstream node's prompt by
  `build_context_prompt` — so the whole pipeline (triage, questioner, case_builder,
  diagnostician, treatment, validator) benefits from continuity of care and
  cross-patient learning, not just the memory-writing step at the end.

**Retrieval quality — semantic search with automatic fallback:**
Both memory tables have `VECTOR(1536)` embedding columns. `medgraph.embeddings.get_embeddings()`
returns a real embeddings client (Ollama's configured embedding model, or OpenAI's
`text-embedding-3-small`) when one is configured, and `None` otherwise. When available,
retrieval calls a pgvector cosine-similarity Postgres function (`match_local_memory` /
`match_global_memory` in `supabase/schema.sql`) via a PostgREST RPC. Any failure —
no provider configured, the RPC not migrated into Supabase yet, Supabase not
configured at all — falls straight back to the original keyword-overlap scoring, so
this is a strict enhancement with zero required configuration.

**Deterministic safety net:** `patient_context.allergies` is cross-checked against
prescribed medication names (and known drug families, e.g. penicillin → amoxicillin)
in `safety.check_allergy_contraindications`, called from `validate_treatment_safety`.
A match is `critical` severity and forces `is_safe=False` — this can never be missed
purely because the LLM's own reasoning overlooked it, the same rule-first/LLM-second
philosophy already used for emergency detection.

**Deliberately not built (future work):** reflection/compaction of many old episodic
entries into a single distilled per-patient trend summary; closed-loop treatment
outcome tracking (this system doesn't yet capture whether a treatment worked);
personalizing the questioner to skip things already known from history.

---

## Directory Structure

```
medgraph/
├── src/medgraph/
│   ├── __init__.py          # Package entrypoint
│   ├── config.py            # Pydantic-settings configuration
│   ├── state.py             # MedicalState TypedDict
│   ├── llm.py               # LLM factory (Ollama/OpenAI)
│   ├── embeddings.py        # Embeddings factory (optional semantic memory retrieval)
│   ├── prompts.py           # All system prompts
│   ├── safety.py            # Rule-based safety validators
│   ├── graph.py             # StateGraph builder + compiler
│   ├── cli.py               # Rich-powered interactive CLI
│   ├── nodes/
│   │   ├── _utils.py        # Shared parsing + context utilities
│   │   ├── intake.py        # Intake node
│   │   ├── memory_recall.py # Memory recall node (patient + agent memory)
│   │   ├── triage.py        # Triage node + router
│   │   ├── emergency.py     # Emergency node
│   │   ├── questioner.py    # Q&A node + router
│   │   ├── case_builder.py  # Case synthesis node
│   │   ├── investigator.py  # Investigation node + router
│   │   ├── interpreter.py   # Image interpreter node
│   │   ├── diagnostician.py # Diagnosis node
│   │   ├── treatment.py     # Treatment node
│   │   └── validator.py     # Validator node + router
│   ├── tools/
│   │   └── drug_checker.py  # LangChain drug interaction tool
│   └── api/
│       ├── app.py           # FastAPI application
│       ├── models.py        # API request/response schemas
│       └── routes.py        # Route handlers
├── tests/
│   ├── test_nodes.py        # Node unit tests (mocked LLM)
│   ├── test_graph.py        # Graph structure tests
│   └── test_api.py          # API endpoint tests
├── docs/
│   └── architecture.md     # This document
├── pyproject.toml
├── README.md
└── .env.example
```
