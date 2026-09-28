# 🩺 MedGraph — Multi-Agent Medical Reasoning System

A production-grade clinical AI pipeline built on **LangGraph** and **MedGemma**.
Implements a complete 9-node clinical workflow with conditional routing, adaptive
Q&A, safety validation, and per-session state isolation.

> ⚠️ **MEDICAL DISCLAIMER**: For research and educational purposes only.
> Not for clinical use. All outputs must be reviewed by qualified healthcare professionals.

---

## ✨ What's New vs. the Original CrewAI Version

| Problem in original | Fix in MedGraph |
|---|---|
| Global mutable `PatientState` (not thread-safe) | Immutable `MedicalState TypedDict` per invocation |
| Fixed sequential execution | Conditional graph edges + router functions |
| Q&A loop commented out / broken | First-class LangGraph cycle with proper interrupts |
| No emergency routing | Dedicated `triage_router` → early exit node |
| API sessions share global state | `MemorySaver` checkpointer with `thread_id` isolation |
| Dead code (`main.py` 400+ commented lines) | Clean graph + 9 focused node files |
| No streaming | `astream_events()` ready |
| Minimal testing | Full test suite with mocked LLM |

---

## 🏗️ Architecture

```
START
  │
  ▼
[intake] → extract demographics, symptoms, history
  │
  ▼
[memory_recall] → load patient profile/history + cross-patient agent knowledge
  │
  ▼
[triage] → assess urgency (2-layer: rule-based + LLM)
  │
  ├─ emergency ──→ [emergency] ──→ END (immediate guidance)
  │
  └─ continue
       ▼
    [questioner] ◄──────────────────┐  (adaptive Q&A loop)
       │                            │
       ├─ ask (human input) ────────┘
       │
       └─ done
            ▼
         [case_builder] → synthesise clinical narrative
            │
            ▼
         [investigator] → recommend tests & imaging
            │
            ├─ images uploaded ──→ [interpreter] → analyse images
            │
            └──────────────────────────────────────┐
                                                   ▼
                                              [diagnostician] → differential Dx
                                                   │
                                                   ▼
                                              [treatment] → care plan
                                                   │
                                                   ▼
                                              [validator] → safety check
                                                   │
                                              ├─ safe ──→ END
                                              └─ retry ──→ [treatment]
```

---

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Install Ollama (for MedGemma)
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull medgemma1.5

# Or use OpenAI as fallback (set OPENAI_API_KEY in .env)
```

### 2. Install

```bash
cd medgraph

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings

# Install dependencies
pip install uv  # if not already installed
uv sync
```

### 3. Interactive CLI

```bash
uv run medgraph run
# or
uv run python -m medgraph.cli run
```

With a custom patient description:
```bash
uv run medgraph run --patient "65yo female with progressive dyspnoea for 3 weeks"
```

### 4. REST API Server

```bash
uv run medgraph serve
# or
uv run medgraph-api

# API docs: http://localhost:8000/docs
```

---

## 🔌 REST API Reference

### Start a Session
```http
POST /sessions
Content-Type: application/json

{
  "session_id": "patient-001",
  "patient_description": "45yo male with chest pain and shortness of breath"
}
```

### Check Status / Current Question
```http
GET /sessions/patient-001
```

### Answer a Question
```http
POST /sessions/patient-001/respond
Content-Type: application/json

{
  "answer": "The pain started about 2 hours ago after climbing stairs"
}
```

### Add Medical Images
```http
POST /sessions/patient-001/images
Content-Type: application/json

{
  "image_paths": ["/path/to/chest_xray.jpg", "/path/to/ecg.png"]
}
```

### Get Final Report
```http
GET /sessions/patient-001/report
```

### Session Status Flow
```
starting → running → awaiting_answer → running → ... → complete
```

---

## 🧪 Testing

```bash
# Run all tests (no LLM required — uses mocks)
uv run pytest tests/ -v

# With coverage report
uv run pytest tests/ -v --cov=src/medgraph --cov-report=term-missing
```

---

## ⚙️ Configuration

All settings are configured via `.env` or environment variables:

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `MEDGEMMA_MODEL` | `medgemma1.5` | MedGemma model name |
| `OPENAI_API_KEY` | *(empty)* | OpenAI key for fallback |
| `OPENAI_FALLBACK_MODEL` | `gpt-4o-mini` | Fallback model |
| `LLM_PROVIDER` | `auto` | `auto`, `ollama`, or `openai` |
| `MAX_QUESTION_ROUNDS` | `5` | Max adaptive Q&A rounds |
| `MAX_TREATMENT_RETRIES` | `2` | Max treatment plan retries |
| `CHECKPOINT_DB_PATH` | *(empty)* | SQLite path (empty = in-memory) |
| `REPORTS_DIR` | `./reports` | Directory for saving reports |
| `API_PORT` | `8000` | REST API port |
| `LOG_LEVEL` | `INFO` | Logging level |

---

## 📁 Project Structure

```
medgraph/
├── src/medgraph/
│   ├── __init__.py
│   ├── config.py           # Centralised settings (pydantic-settings)
│   ├── state.py            # MedicalState TypedDict
│   ├── llm.py              # LLM factory (Ollama/OpenAI auto-detect)
│   ├── prompts.py          # All system prompts
│   ├── safety.py           # Rule-based safety validators
│   ├── graph.py            # LangGraph StateGraph builder
│   ├── cli.py              # Rich-powered interactive CLI
│   ├── nodes/
│   │   ├── _utils.py       # Shared parsing + context utilities
│   │   ├── intake.py       # Node 1: Patient data extraction
│   │   ├── triage.py       # Node 2: Urgency assessment + router
│   │   ├── emergency.py    # Node 3: Emergency guidance (early exit)
│   │   ├── questioner.py   # Node 4: Adaptive Q&A + router
│   │   ├── case_builder.py # Node 5: Clinical case synthesis
│   │   ├── investigator.py # Node 6: Test recommendations + router
│   │   ├── interpreter.py  # Node 7: Image analysis (conditional)
│   │   ├── diagnostician.py# Node 8: Differential diagnosis
│   │   ├── treatment.py    # Node 9: Treatment planning
│   │   └── validator.py    # Node 10: Safety validation + router
│   ├── tools/
│   │   └── drug_checker.py # Drug interaction tool
│   └── api/
│       ├── app.py          # FastAPI application + lifespan
│       ├── models.py       # API Pydantic schemas
│       └── routes.py       # Route handlers
├── tests/
│   ├── test_nodes.py       # Node unit tests
│   ├── test_graph.py       # Graph integration tests
│   └── test_api.py         # API endpoint tests
├── docs/
│   └── architecture.md     # Detailed architecture documentation
├── reports/                # Generated clinical reports
├── pyproject.toml
├── .env.example
└── README.md
```

---

## 🔒 Safety & Compliance

### Emergency Detection (Two Layers)
1. **Rule-based** (fast, no LLM): keyword scan for critical/urgent conditions
2. **LLM-based**: nuanced assessment with escalation if layers disagree

### Treatment Validation (Two Layers)
1. **Rule-based**: checks for missing follow-up, dangerous patterns, insulin without context
2. **LLM-based**: drug interactions, contraindications, guideline compliance

### Session Isolation
No global state — each session has an isolated `thread_id` in the checkpointer.
Concurrent API requests cannot interfere with each other.

---

## 📊 Example Report Structure

```json
{
  "session_id": "patient-001",
  "triage_level": "urgent",
  "primary_diagnosis": "Unstable Angina",
  "diagnosis_confidence": 0.78,
  "differential_diagnosis": [
    {
      "condition": "Unstable Angina",
      "probability": 0.78,
      "icd_code": "I20.0",
      "evidence": ["chest pain", "diaphoresis", "hypertension"]
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
      "indication": "Antiplatelet for ACS"
    }
  ],
  "is_safe": true,
  "disclaimer": "⚠️ FOR RESEARCH PURPOSES ONLY..."
}
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Add tests for new nodes or tools
4. Run tests: `uv run pytest tests/ -v`
5. Submit a pull request

---

**⚠️ MEDICAL DISCLAIMER**: MedGraph is an AI research system for educational and
research purposes only. It does not constitute medical advice, diagnosis, or treatment.
All outputs must be reviewed by qualified healthcare professionals before any clinical
action is taken. In a medical emergency, call emergency services immediately.
