import React from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  Activity, 
  FileText, 
  ChevronRight, 
  Stethoscope,
  Sparkles,
  ShieldAlert
} from 'lucide-react';

export default function RightIntelligenceHud({ 
  triageLevel = "Urgent", 
  triageConfidence = 94, 
  symptoms = [], 
  tests = [], 
  differential = [], 
  onGenerateReportClick,
  canGenerateReport = true 
}) {
  const defaultSymptoms = symptoms.length > 0 ? symptoms : [
    { entity: "Shortness of breath (Dyspnea)", status: "Reported Present" },
    { entity: "Expiratory wheezing", status: "Auscultated" },
    { entity: "Occupational dust exposure", status: "Identified Trigger" },
    { entity: "Retrosternal chest pressure", status: "Ruled Out" },
    { entity: "Fever & Chills", status: "Absent" }
  ];

  const getTriageColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'resuscitation':
      case 'critical':
      case 'emergent':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      case 'urgent':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'semi-urgent':
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      default:
        return 'bg-teal-500/15 text-teal-400 border-teal-500/30';
    }
  };

  return (
    <aside className="w-72 shrink-0 p-4 bg-slate-950/60 border-l border-white/10 overflow-y-auto space-y-4">
      
      {/* Triage Level Card */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono uppercase tracking-wider text-[10px]">Triage Level</span>
          <span className="font-mono text-[10px] text-cyan-400">{triageConfidence}% Conf</span>
        </div>

        <div className={`py-1.5 px-3 rounded-lg border text-center font-bold text-xs uppercase tracking-wide ${getTriageColor(triageLevel)}`}>
          🚨 {triageLevel || "Urgent (Level 3)"}
        </div>
      </div>

      {/* Extracted Clinical Symptoms & Entities */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Extracted Clinical Entities
          </span>
          <span className="text-[10px] font-mono text-cyan-400">{defaultSymptoms.length}</span>
        </div>

        <div className="space-y-1.5">
          {defaultSymptoms.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-950/60 text-xs">
              <span className="text-slate-200 truncate">{s.entity || s}</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 shrink-0">
                {s.status || "CONFIRMED"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Diagnostic Investigations */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Diagnostic Workup
          </span>
        </div>

        <div className="space-y-1 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 text-teal-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Chest Radiograph (CXR PA)</span>
          </div>
          <div className="flex items-center gap-1.5 text-teal-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Pre/Post Spirometry (FEV1)</span>
          </div>
          <div className="flex items-center gap-1.5 text-teal-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>CBC with Diff (Eosinophils)</span>
          </div>
        </div>
      </div>

      {/* Differential Ranking Quick Bar */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-2.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
          Top Differentials
        </div>

        <div className="space-y-2 text-xs">
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-white font-medium truncate">1. Asthma Exacerbation</span>
              <span className="text-cyan-400 font-mono font-bold">92%</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-400 rounded-full" style={{ width: '92%' }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-300 truncate">2. Pneumonia (J18.9)</span>
              <span className="text-amber-400 font-mono font-bold">42%</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: '42%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Generate Report Primary CTA */}
      <div className="pt-2">
        <button
          onClick={onGenerateReportClick}
          disabled={!canGenerateReport}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-glow-cyan flex items-center justify-center gap-2"
        >
          <FileText className="w-4 h-4" />
          <span>Final Consultation Report →</span>
        </button>
      </div>

    </aside>
  );
}
