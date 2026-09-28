// Shared helpers to normalize MedGraph backend clinical shapes into display-ready shapes.
// Backend shapes (see src/medgraph/state.py):
//   DiagnosisEntry:    { condition, probability(0-1), icd_code, evidence[], rule_out_tests[] }
//   MedicationEntry:   { name, dose, route, frequency, duration, indication, contraindications[] }
//   InvestigationEntry:{ test_name, category, indication, priority, expected_findings }
//   SymptomDict:       { description, severity, onset, duration, location, character, aggravating, relieving }

export function normalizeDifferential(differential = []) {
  if (!Array.isArray(differential) || differential.length === 0) return [];
  return differential.map((d, idx) => {
    let confidence;
    if (typeof d.probability === "number") {
      confidence = Math.round(d.probability * 100);
    } else if (typeof d.confidence === "number") {
      confidence = d.confidence <= 1 ? Math.round(d.confidence * 100) : Math.round(d.confidence);
    } else {
      confidence = 0;
    }
    let status = d.status;
    if (!status) {
      if (idx === 0) status = "PRIMARY DX";
      else if (confidence >= 30) status = "SECONDARY";
      else status = "RULED OUT";
    }
    return {
      condition: d.condition || d.name || "Unspecified condition",
      category: d.category || d.icd_code || "",
      confidence,
      status,
      supporting: d.supporting || d.evidence || [],
      refuting: d.refuting || d.rule_out_tests || [],
      icd_code: d.icd_code || null,
    };
  });
}

export function normalizeMedications(medications = []) {
  if (!Array.isArray(medications)) return [];
  return medications.map((m) => ({
    name: m.name || "Unnamed medication",
    dosage: m.dose || m.dosage || "",
    route: m.route || "",
    frequency: m.frequency || "",
    duration: m.duration || "",
    indication: m.indication || "",
    warnings: (m.contraindications && m.contraindications.length > 0)
      ? `Contraindications: ${m.contraindications.join(", ")}`
      : (m.warnings || null),
  }));
}

export function normalizeInvestigations(investigations = []) {
  if (!Array.isArray(investigations)) return [];
  return investigations.map((t) => ({
    name: t.test_name || t.name || String(t),
    category: t.category || "",
    priority: t.priority || "routine",
    status: t.status || "Ordered",
    result: t.result || t.expected_findings || null,
    indication: t.indication || null,
  }));
}

export function normalizeSymptoms(symptoms = []) {
  if (!Array.isArray(symptoms)) return [];
  return symptoms.map((s) => {
    if (typeof s === "string") return { entity: s, status: "Reported" };
    return {
      entity: s.description || "Symptom",
      status: s.severity ? s.severity.toUpperCase() : "REPORTED",
    };
  });
}

export function percent(value) {
  if (value === null || value === undefined) return 0;
  if (value <= 1) return Math.round(value * 100);
  return Math.round(value);
}

export function phaseLabel(phase) {
  const labels = {
    intake: "Extracting demographics & clinical entities...",
    triage: "Assessing urgency & emergency screening...",
    questioning: "Gathering adaptive clinical history...",
    case_building: "Synthesizing unified clinical case...",
    investigation_waiting: "Awaiting diagnostic test results...",
    investigation: "Recommending diagnostic workup...",
    interpretation: "Analyzing medical imaging...",
    diagnosis: "Ranking differential diagnosis...",
    treatment: "Formulating therapeutic plan...",
    validation: "Validating safety & drug interactions...",
    complete: "Clinical assessment complete.",
  };
  return labels[phase] || "Synthesizing clinical findings...";
}
