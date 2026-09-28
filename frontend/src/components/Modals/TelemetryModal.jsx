import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, X, Copy, Check, Bot, Sparkles, CheckCircle2 } from 'lucide-react';

const AGENTS = [
  { key: 'intake_agent', name: 'Intake Agent', role: 'Entity Extraction & Parsing' },
  { key: 'triage_agent', name: 'Triage Agent', role: 'ESI Emergency Stratification' },
  { key: 'questioner_agent', name: 'Questioner Agent', role: 'Human-in-the-Loop Adaptive Q&A' },
  { key: 'case_builder_agent', name: 'Case Builder', role: 'Longitudinal Case Synthesis' },
  { key: 'investigator_agent', name: 'Investigator Agent', role: 'Evidence-Based Diagnostic Orders' },
  { key: 'diagnostician_agent', name: 'Diagnostician', role: 'Bayesian ICD-10 Differential' },
  { key: 'treatment_agent', name: 'Treatment Agent', role: 'Pharmacological e-Prescriptions' },
  { key: 'validator_agent', name: 'Validator Agent', role: 'Drug Interactions & Allergy Rules' }
];

export default function TelemetryModal({ isOpen, onClose, selectedAgentKey = 'intake_agent', agentTelemetry = null }) {
  const [activeKey, setActiveKey] = useState(selectedAgentKey);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) setActiveKey(selectedAgentKey);
  }, [isOpen, selectedAgentKey]);

  if (!isOpen) return null;

  const getAgentPayload = (key) => {
    // Prefer live telemetry captured from the running session (see
    // `_build_agent_telemetry` in src/medgraph/api/routes.py) over demo data.
    if (agentTelemetry && agentTelemetry[key]) {
      return agentTelemetry[key];
    }
    return getDemoAgentPayload(key);
  };

  const getDemoAgentPayload = (key) => {
    switch (key) {
      case 'intake_agent':
        return {
          agent: "intake_agent",
          status: "SUCCESS",
          execution_time_ms: 320,
          extracted_entities: {
            age: 50,
            gender: "male",
            chief_complaint: "Dyspnea & episodic dry cough",
            triggers: ["dust exposure", "strenuous physical labor"],
            history: ["Mild persistent asthma", "Severe penicillin anaphylaxis"],
            vitals: { bp: "138/85", hr: 92, spo2: "94%" }
          }
        };
      case 'triage_agent':
        return {
          agent: "triage_agent",
          status: "SUCCESS",
          execution_time_ms: 410,
          triage_level: "Urgent",
          esi_category: 3,
          confidence: 0.94,
          vital_signs_stability: "Stable but elevated respiratory rate",
          red_flags_evaluated: ["Silent chest: Negative", "Stridor: Negative", "Cyanosis: Negative"]
        };
      case 'questioner_agent':
        return {
          agent: "questioner_agent",
          status: "SUCCESS",
          execution_time_ms: 540,
          current_question_round: 2,
          questions_asked: [
            "Does the shortness of breath radiate to your arm, or is it accompanied by chest tightness?",
            "Do you wake up coughing at night or use a rescue inhaler?"
          ],
          patient_response: "Worse at night and with heavy exertion. Albuterol gives partial relief."
        };
      case 'diagnostician_agent':
        return {
          agent: "diagnostician_agent",
          status: "SUCCESS",
          execution_time_ms: 890,
          primary_dx: {
            name: "Acute Moderate Asthma Exacerbation",
            icd10: "J45.909",
            confidence: 0.92
          },
          differential: [
            { icd10: "J45.909", confidence: 0.92, likelihood: "Primary" },
            { icd10: "J18.9", confidence: 0.42, likelihood: "Secondary" },
            { icd10: "I50.9", confidence: 0.15, likelihood: "Ruled Out" }
          ]
        };
      case 'treatment_agent':
        return {
          agent: "treatment_agent",
          status: "SUCCESS",
          execution_time_ms: 670,
          rx_prescriptions: [
            { drug: "Albuterol HFA", dose: "90 mcg", sig: "2 puffs Q4-6H PRN" },
            { drug: "Prednisone", dose: "40 mg", sig: "Daily PO x 5 days" },
            { drug: "Advair Diskus", dose: "250/50 mcg", sig: "1 puff BID" }
          ]
        };
      case 'validator_agent':
        return {
          agent: "validator_agent",
          status: "SUCCESS",
          execution_time_ms: 290,
          is_safe: true,
          allergy_checks: {
            "Penicillin": "CLEARED — No beta-lactams prescribed"
          },
          drug_interactions: "Zero clinical interactions detected"
        };
      default:
        return {
          agent: key,
          status: "ACTIVE",
          execution_time_ms: 450,
          consensus: "Valid"
        };
    }
  };

  const payload = getAgentPayload(activeKey);
  const jsonString = JSON.stringify(payload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-4xl rounded-2xl bg-slate-900 border border-white/10 p-6 space-y-4 shadow-glass max-h-[85vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">9-Agent Consensus Telemetry Inspector</h3>
              <p className="text-xs text-slate-400">Live JSON payload inspection, agent latency, and clinical decision rationale.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body 2-col */}
        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          
          {/* Left Agent List */}
          <div className="w-56 shrink-0 space-y-1.5 overflow-y-auto pr-2">
            {AGENTS.map((ag) => (
              <button
                key={ag.key}
                onClick={() => setActiveKey(ag.key)}
                className={`w-full text-left p-2.5 rounded-xl text-xs transition-all ${
                  activeKey === ag.key
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <div>{ag.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{ag.role}</div>
              </button>
            ))}
          </div>

          {/* Right JSON View */}
          <div className="flex-1 flex flex-col rounded-xl bg-slate-950 border border-white/5 p-4 min-h-0 overflow-hidden space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-cyan-400 font-semibold uppercase flex items-center gap-2">
                {activeKey} Output Payload
                {agentTelemetry && agentTelemetry[activeKey] ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">LIVE SESSION</span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-white/5">DEMO</span>
                )}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 hover:text-white transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied!" : "Copy JSON"}</span>
              </button>
            </div>

            <pre className="flex-1 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed p-2 bg-slate-900/50 rounded-lg">
              {jsonString}
            </pre>
          </div>

        </div>

      </div>
    </div>
  );
}
