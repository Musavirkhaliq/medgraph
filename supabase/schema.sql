-- ============================================================================
-- MedAI by LTM Research — Production Supabase PostgreSQL Schema
-- Includes User Profiles, Doctor/Patient Auth, Dual-Tier Vector Memory, 
-- Agent Telemetry, and Patient Follow-ups.
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector"; -- Vector embeddings for local & global memory

-- 2. User Roles & Profiles (Extends Supabase auth.users)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('doctor', 'patient', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'patient',
    license_number VARCHAR(64), -- Medical license number for consulting doctors
    specialty VARCHAR(128),     -- e.g. Cardiology, Pulmonology, Internal Medicine
    department VARCHAR(128),
    phone VARCHAR(32),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Patient Accounts & Clinical Profiles
CREATE TABLE IF NOT EXISTS public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL, -- Linked Patient Auth User
    mrn VARCHAR(64) UNIQUE NOT NULL, -- Medical Record Number (e.g. MRN-2026-0891)
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(32) NOT NULL,
    phone VARCHAR(32),
    email VARCHAR(255),
    blood_type VARCHAR(8),
    allergies JSONB DEFAULT '[]'::jsonb, -- Array of allergy objects/strings
    chronic_conditions JSONB DEFAULT '[]'::jsonb, -- Array of chronic conditions
    current_medications JSONB DEFAULT '[]'::jsonb, -- Active prescribed medications
    emergency_contact JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Clinical Assessment Sessions
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(64) UNIQUE NOT NULL, -- LangGraph thread_id
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
    consulting_doctor_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    patient_description TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'running', -- running, awaiting_answer, complete, emergency, error
    current_phase VARCHAR(64) NOT NULL DEFAULT 'intake',
    triage_level VARCHAR(32), -- emergency, urgent, routine
    is_emergency BOOLEAN DEFAULT FALSE,
    emergency_info JSONB,
    completion_percentage FLOAT DEFAULT 0.0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 5. Multi-Agent Execution Telemetry
CREATE TABLE IF NOT EXISTS public.agent_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(64) NOT NULL REFERENCES public.sessions(session_id) ON DELETE CASCADE,
    agent_name VARCHAR(64) NOT NULL, -- intake_agent, triage_agent, diagnostician_agent, etc.
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, active, complete
    output_payload JSONB DEFAULT '{}'::jsonb,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_session_agent UNIQUE(session_id, agent_name)
);

-- 6. Tier 1: Local Patient Memory (Episodic & Semantic)
CREATE TABLE IF NOT EXISTS public.local_patient_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    session_id VARCHAR(64) REFERENCES public.sessions(session_id) ON DELETE SET NULL,
    memory_category VARCHAR(64) NOT NULL, -- 'episodic_visit', 'med_intolerance', 'chronic_trend', 'lab_baseline'
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    relevance_score FLOAT DEFAULT 1.0,
    embedding VECTOR(1536), -- Dense vector representation for semantic memory retrieval
    metadata JSONB DEFAULT '{}'::jsonb, -- e.g. {"icd_codes": ["J45"], "severity": "moderate"}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Tier 2: Global Agent Memory (Cross-Patient Collective Intelligence)
CREATE TABLE IF NOT EXISTS public.global_agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_type VARCHAR(64) NOT NULL, -- 'diagnostic_pattern', 'treatment_efficacy', 'safety_anomaly', 'symptom_cluster'
    topic VARCHAR(255) NOT NULL, -- e.g. 'Asthma vs PE differential cues'
    summary TEXT NOT NULL,
    case_count INT DEFAULT 1,
    confidence_score FLOAT DEFAULT 0.5,
    embedding VECTOR(1536), -- Vector index for global semantic retrieval
    pattern_graph JSONB DEFAULT '{}'::jsonb, -- Graph of symptoms -> diagnoses -> treatments
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Patient Follow-up Schedules & Reminders
CREATE TABLE IF NOT EXISTS public.patient_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(64) REFERENCES public.sessions(session_id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    followup_type VARCHAR(64) NOT NULL, -- appointment, lab_test, medication_check, general
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'scheduled', -- scheduled, completed, missed, cancelled
    reminder_sent BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE & VECTOR SEARCH
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_sessions_patient_id ON public.sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_doctor_id ON public.sessions(consulting_doctor_id);
CREATE INDEX IF NOT EXISTS idx_followups_patient_id ON public.patient_followups(patient_id);
CREATE INDEX IF NOT EXISTS idx_followups_due_date ON public.patient_followups(due_date);
CREATE INDEX IF NOT EXISTS idx_local_mem_patient_id ON public.local_patient_memory(patient_id);

-- Vector indexes using IVFFlat (or HNSW)
CREATE INDEX IF NOT EXISTS local_mem_vector_idx
ON public.local_patient_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS global_mem_vector_idx
ON public.global_agent_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- SEMANTIC MEMORY RETRIEVAL (pgvector cosine similarity via RPC)
-- PostgREST can't order by vector distance directly, so retrieval goes through
-- these functions. Called from db/client.py's rpc() helper; the Python layer
-- falls back to keyword-overlap scoring automatically if these aren't present
-- yet or no embedding is available for a query.
-- ============================================================================
CREATE OR REPLACE FUNCTION match_local_memory(
    query_embedding VECTOR(1536),
    match_patient_id UUID,
    match_count INT DEFAULT 5
)
RETURNS SETOF public.local_patient_memory
LANGUAGE sql STABLE
AS $$
    SELECT *
    FROM public.local_patient_memory
    WHERE patient_id = match_patient_id
      AND embedding IS NOT NULL
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION match_global_memory(
    query_embedding VECTOR(1536),
    match_count INT DEFAULT 5
)
RETURNS SETOF public.global_agent_memory
LANGUAGE sql STABLE
AS $$
    SELECT *
    FROM public.global_agent_memory
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_patient_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_followups ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policy
CREATE POLICY "Users can view their own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

-- 2. Patients Policy
CREATE POLICY "Patients view own profile" ON public.patients
    FOR SELECT USING (auth.uid() = account_id);

CREATE POLICY "Doctors view all patient profiles" ON public.patients
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('doctor', 'admin'))
    );

-- 3. Sessions Policy
CREATE POLICY "Patients view own sessions" ON public.sessions
    FOR SELECT USING (
        patient_id IN (SELECT id FROM public.patients WHERE account_id = auth.uid())
    );

CREATE POLICY "Doctors manage all sessions" ON public.sessions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('doctor', 'admin'))
    );

-- 4. Local Memory Policy
CREATE POLICY "Patients view own memory" ON public.local_patient_memory
    FOR SELECT USING (
        patient_id IN (SELECT id FROM public.patients WHERE account_id = auth.uid())
    );

CREATE POLICY "Doctors manage local patient memory" ON public.local_patient_memory
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('doctor', 'admin'))
    );

-- 5. Follow-ups Policy
CREATE POLICY "Patients view own followups" ON public.patient_followups
    FOR SELECT USING (
        patient_id IN (SELECT id FROM public.patients WHERE account_id = auth.uid())
    );

CREATE POLICY "Doctors manage followups" ON public.patient_followups
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('doctor', 'admin'))
    );

-- ============================================================================
-- APPOINTMENT MEMORY ADDITIONS
-- Generated dual-tier summaries + doctor interim notes
-- ============================================================================

-- Extend local_patient_memory with note type tracking
ALTER TABLE public.local_patient_memory
    ADD COLUMN IF NOT EXISTS doctor_id UUID
        REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS note_type VARCHAR(32) DEFAULT 'auto';
    -- 'auto' = AI generated at session end | 'interim_note' = doctor written between appointments

-- Full appointment summaries linking local + global memory to a session
CREATE TABLE IF NOT EXISTS public.appointment_summaries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       VARCHAR(64) UNIQUE NOT NULL
                     REFERENCES public.sessions(session_id) ON DELETE CASCADE,
    patient_id       UUID REFERENCES public.patients(id) ON DELETE CASCADE,
    local_memory_id  UUID REFERENCES public.local_patient_memory(id) ON DELETE SET NULL,
    global_memory_id UUID REFERENCES public.global_agent_memory(id) ON DELETE SET NULL,
    local_summary    TEXT NOT NULL,        -- Patient-scoped clinical summary
    global_summary   TEXT NOT NULL,        -- De-identified cross-patient knowledge
    primary_diagnosis VARCHAR(255),
    triage_level     VARCHAR(32),
    medications_prescribed JSONB DEFAULT '[]'::jsonb,
    follow_up_plan   TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_summaries_patient
    ON public.appointment_summaries(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointment_summaries_session
    ON public.appointment_summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_local_mem_note_type
    ON public.local_patient_memory(note_type);

-- RLS for appointment_summaries
ALTER TABLE public.appointment_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors manage appointment summaries" ON public.appointment_summaries
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('doctor', 'admin'))
    );

CREATE POLICY "Patients view own appointment summaries" ON public.appointment_summaries
    FOR SELECT USING (
        patient_id IN (SELECT id FROM public.patients WHERE account_id = auth.uid())
    );

-- ============================================================================
-- FEATURE ADDITIONS: guideline RAG corpus, longitudinal vitals/NEWS2,
-- and doctor review/sign-off status tracking.
-- ============================================================================

-- Doctor review & sign-off (advisory) — sessions.status already had room for
-- this per its original comment enum; the CHECK below is dropped/recreated so
-- the column keeps accepting the review-related values without a full migration.
ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS review_notes TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
-- status now additionally takes: pending_review, approved, rejected (alongside
-- the original running, awaiting_answer, complete, emergency, error)

-- 9. Guideline RAG Corpus
CREATE TABLE IF NOT EXISTS public.guideline_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condition VARCHAR(255) NOT NULL,
    chunk_text TEXT NOT NULL,
    source_citation VARCHAR(255) NOT NULL,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS guideline_chunks_vector_idx
ON public.guideline_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION match_guideline_chunks(
    query_embedding VECTOR(1536),
    match_count INT DEFAULT 5
)
RETURNS SETOF public.guideline_chunks
LANGUAGE sql STABLE
AS $$
    SELECT *
    FROM public.guideline_chunks
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

ALTER TABLE public.guideline_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read guideline corpus" ON public.guideline_chunks
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Doctors manage guideline corpus" ON public.guideline_chunks
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('doctor', 'admin'))
    );

-- 10. Longitudinal Vitals / NEWS2 Early Warning
CREATE TABLE IF NOT EXISTS public.patient_vitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    session_id VARCHAR(64) REFERENCES public.sessions(session_id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    heart_rate INT,
    resp_rate INT,
    systolic_bp INT,
    diastolic_bp INT,
    temperature_c FLOAT,
    spo2 INT,
    o2_supplemental BOOLEAN DEFAULT FALSE,
    consciousness_level VARCHAR(32) DEFAULT 'alert', -- alert / voice / pain / unresponsive
    recorded_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    news2_score INT,
    news2_risk_band VARCHAR(16) -- low / medium / high
);

CREATE INDEX IF NOT EXISTS idx_patient_vitals_patient_id ON public.patient_vitals(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_vitals_recorded_at ON public.patient_vitals(recorded_at);

ALTER TABLE public.patient_vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients view own vitals" ON public.patient_vitals
    FOR SELECT USING (
        patient_id IN (SELECT id FROM public.patients WHERE account_id = auth.uid())
    );

CREATE POLICY "Doctors manage vitals" ON public.patient_vitals
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('doctor', 'admin'))
    );
