import React from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  SlidersHorizontal, 
  User, 
  ShieldCheck, 
  Sparkles,
  ChevronRight
} from 'lucide-react';

export const AGENT_PIPELINE_STEPS = [
  { id: 'intake', key: 'intake_agent', name: 'Intake Agent', desc: 'Demographics & entity parsing' },
  { id: 'triage', key: 'triage_agent', name: 'Triage Agent', desc: 'Emergency level & urgency' },
  { id: 'questioning', key: 'questioner_agent', name: 'Questioner Agent', desc: 'Clinical history gathering' },
  { id: 'case_building', key: 'case_builder_agent', name: 'Case Builder', desc: 'Synthesizes clinical case' },
  { id: 'investigation_waiting', key: 'investigator_agent', name: 'Investigator', desc: 'Orders diagnostic tests' },
  { id: 'diagnosis', key: 'diagnostician_agent', name: 'Diagnostician', desc: 'ICD-10 differential matrix' },
  { id: 'treatment', key: 'treatment_agent', name: 'Treatment Agent', desc: 'Rx & therapeutic plan' },
  { id: 'validation', key: 'validator_agent', name: 'Validator Agent', desc: 'Drug interactions & safety' },
];

export default function AgentPipelineSidebar({ 
  currentPhase = 'intake', 
  completedPhases = [], 
  onOpenAgentTelemetry, 
  patient 
}) {
  const phaseIndexMap = {
    intake: 0,
    triage: 1,
    questioning: 2,
    case_building: 3,
    investigation_waiting: 4,
    diagnosis: 5,
    treatment: 6,
    validation: 7,
    complete: 8,
  };

  const currentIndex = phaseIndexMap[currentPhase] ?? 0;

  return (
    <aside className="w-64 shrink-0 flex flex-col justify-between p-4 bg-slate-950/60 border-r border-white/10 overflow-y-auto">
      
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
              9-Agent Consensus
            </span>
          </div>
          <button 
            onClick={() => onOpenAgentTelemetry()}
            className="text-[11px] text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
            title="Inspect Agent State"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Telemetry</span>
          </button>
        </div>

        {/* Stepper Steps */}
        <div className="relative pl-3 space-y-3">
          {/* Vertical Connecting Line */}
          <div className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-slate-800" />

          {AGENT_PIPELINE_STEPS.map((step, idx) => {
            const isCompleted = currentIndex > idx || currentPhase === 'complete';
            const isCurrent = currentIndex === idx && currentPhase !== 'complete';
            
            return (
              <div 
                key={step.id}
                onClick={() => onOpenAgentTelemetry(step.key)}
                className={`relative flex items-start gap-3 p-2 rounded-xl transition-all cursor-pointer group ${
                  isCurrent 
                    ? 'bg-cyan-500/10 border border-cyan-500/30' 
                    : 'hover:bg-slate-900/60 border border-transparent'
                }`}
              >
                {/* Node Icon */}
                <div className="relative z-10 shrink-0 mt-0.5">
                  {isCompleted ? (
                    <div className="w-5 h-5 rounded-full bg-teal-500/20 border border-teal-500 text-teal-400 flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  ) : isCurrent ? (
                    <div className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-glow-cyan">
                      <Loader2 className="w-3 h-3 animate-spin" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-900 border border-white/10 text-slate-600 flex items-center justify-center group-hover:border-white/20">
                      <Circle className="w-2 h-2 fill-current" />
                    </div>
                  )}
                </div>

                {/* Node Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold truncate ${
                      isCurrent ? 'text-cyan-400' : isCompleted ? 'text-slate-200' : 'text-slate-400 group-hover:text-slate-300'
                    }`}>
                      {step.name}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Patient Strip at Bottom */}
      {patient && (
        <div className="mt-4 p-3 rounded-xl bg-slate-900/80 border border-white/10 space-y-1.5 text-xs">
          <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-semibold">
            Active Patient
          </div>
          <div className="font-bold text-white truncate">
            {patient.name}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {patient.mrn} &bull; {patient.gender}, {patient.age}y
          </div>
          {patient.allergies?.length > 0 && (
            <div className="text-[10px] text-rose-400 truncate pt-1 border-t border-white/5">
              ⚠️ {patient.allergies[0]}
            </div>
          )}
        </div>
      )}

    </aside>
  );
}
