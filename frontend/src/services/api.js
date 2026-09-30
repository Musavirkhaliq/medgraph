// MedAI REST API Client
const API_BASE = "";

export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { status: "degraded", error: err.message };
  }
}

export async function startSession({ sessionId, description, language = "en", originalDesc = "", patientId = null }) {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      patient_id: patientId,
      patient_description: description,
      detected_language: language,
      patient_description_original: originalDesc || description,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || "Failed to start clinical session");
  }
  return await res.json();
}


export async function getSessionState(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch session state: ${res.status}`);
  }
  return await res.json();
}

export async function submitSessionAnswer(sessionId, answerText) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer: answerText }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || "Failed to submit answer");
  }
  return await res.json();
}

export async function submitTestResults(sessionId, { results = "", skipped = false }) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/test_results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text_results: results, skipped }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || "Failed to submit test results");
  }
  return await res.json();
}

export async function uploadSessionImage(sessionId, file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/upload-image`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Image upload failed: ${res.status}`);
  }
  return await res.json();
}

export async function analyzeSessionImage(sessionId, file, notes = "") {
  const formData = new FormData();
  formData.append("file", file);
  if (notes) formData.append("notes", notes);
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/analyse-image`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Image analysis failed: ${res.status}`);
  }
  return await res.json();
}

export async function getFinalReport(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/report`);
  if (!res.ok) {
    throw new Error(`Report retrieval failed: ${res.status}`);
  }
  return await res.json();
}

export async function translateText(text, sourceLang = "auto", targetLang = "en") {
  if (!text || !text.trim()) return "";
  try {
    const res = await fetch(`${API_BASE}/api/v1/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        source_lang: sourceLang,
        target_lang: targetLang,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.translated_text || text;
    }
  } catch (e) {
    console.warn("Translation failed, falling back to source:", e);
  }
  return text;
}

export async function loginUser(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Invalid credentials" }));
    throw new Error(err.detail || "Authentication failed");
  }
  return await res.json();
}

export async function searchPatients(query = "") {
  try {
    const res = await fetch(`${API_BASE}/patients/search?query=${encodeURIComponent(query)}`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("Search patients API unavailable, fallback:", e);
  }
  return null;
}

export async function getPatientHistory(patientId) {
  try {
    const res = await fetch(`${API_BASE}/patients/${patientId}/history`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("Patient history API fallback:", e);
  }
  return null;
}

export async function getGlobalMemory() {
  try {
    const res = await fetch(`${API_BASE}/memory/global`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("Global memory API fallback:", e);
  }
  return null;
}

export async function getPatientMemoryTimeline(patientId) {
  try {
    const res = await fetch(`${API_BASE}/patients/${patientId}/memory-timeline`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("Patient memory timeline API fallback:", e);
  }
  return null;
}

export async function addInterimNote(patientId, { note, doctorId = null, sessionId = null, patientName = null }) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/interim-note`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      note,
      doctor_id: doctorId,
      session_id: sessionId,
      patient_name: patientName,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || "Failed to append interim note");
  }
  return await res.json();
}

export async function getSessionSummary(sessionId) {
  try {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/appointment-summary`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("Session summary API fallback:", e);
  }
  return null;
}


export async function registerDoctor(data) {
  const res = await fetch(`${API_BASE}/admin/register-doctor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Registration failed" }));
    throw new Error(err.detail || "Doctor registration failed");
  }
  return await res.json();
}

export async function registerPatient(data) {
  const res = await fetch(`${API_BASE}/admin/register-patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Registration failed" }));
    throw new Error(err.detail || "Patient registration failed");
  }
  return await res.json();
}

// ── Doctor review & sign-off (advisory) ──────────────────────────────────────

export async function submitReportReview(sessionId, { status, reviewerId = null, notes = null, editedReport = null }) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      reviewer_id: reviewerId,
      notes,
      edited_report: editedReport,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || "Failed to submit review");
  }
  return await res.json();
}

// ── EHR / FHIR ────────────────────────────────────────────────────────────────

export async function getPatientEHRData(patientId) {
  try {
    const res = await fetch(`${API_BASE}/patients/${patientId}/ehr`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("EHR API fallback:", e);
  }
  return null;
}

// ── Longitudinal vitals / NEWS2 ───────────────────────────────────────────────

export async function recordPatientVitals(patientId, vitals) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/vitals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vitals),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || "Failed to record vitals");
  }
  return await res.json();
}

export async function getPatientVitals(patientId, limit = 20) {
  try {
    const res = await fetch(`${API_BASE}/patients/${patientId}/vitals?limit=${limit}`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("Vitals history API fallback:", e);
  }
  return null;
}

export async function getPatientLatestVitals(patientId) {
  try {
    const res = await fetch(`${API_BASE}/patients/${patientId}/vitals/latest`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("Latest vitals API fallback:", e);
  }
  return null;
}

// ── Ambient clinical scribe ────────────────────────────────────────────────────

export async function uploadScribeAudio(sessionId, blob, filename = "chunk.webm") {
  const formData = new FormData();
  formData.append("file", blob, filename);
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/scribe/audio`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Scribe audio upload failed: ${res.status}`);
  }
  return await res.json();
}

export async function getScribeNote(sessionId) {
  try {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/scribe`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("Scribe fetch fallback:", e);
  }
  return null;
}

export async function generateScribeNote(sessionId, additionalNotes = null) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/scribe/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ additional_notes: additionalNotes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || "Failed to generate SOAP note");
  }
  return await res.json();
}
