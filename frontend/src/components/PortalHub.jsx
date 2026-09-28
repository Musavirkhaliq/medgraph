import React from 'react';
import { 
  Stethoscope, 
  User, 
  ShieldCheck, 
  ArrowRight, 
  Activity, 
  Database, 
  Sparkles, 
  FileText, 
  Layers, 
  Mic, 
  CheckCircle2,
  Lock
} from 'lucide-react';

export default function PortalHub({ onSelectRole, onOpenAuth }) {
  const handleLaunch = (role) => {
    if (onOpenAuth) {
      onOpenAuth(role);
    } else if (onSelectRole) {
      onSelectRole(role);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      
      {/* Hero Header */}
      <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Next-Generation Multi-Agent Clinical Reasoning Engine</span>
        </div>
        
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
          Autonomous Clinical AI <br />
          <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
            Decision Intelligence Portal
          </span>
        </h1>
        
        <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
          Built on LangGraph 9-Agent reasoning, Supabase vector long-term memory, and real-time multi-lingual speech transcription. Select your portal to begin.
        </p>

        {/* Feature Highlights Ticker */}
        <div className="pt-4 flex flex-wrap justify-center gap-2 sm:gap-4 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/60 border border-white/5">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
            <span>9-Agent Consensus Graph</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/60 border border-white/5">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
            <span>Faster-Whisper Multilingual ASR</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/60 border border-white/5">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
            <span>DICOM & Multimodal Vision</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/60 border border-white/5">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
            <span>Dual-Tier Supabase Memory</span>
          </div>
        </div>
      </div>

      {/* Role Portal Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        
        {/* Doctor Portal Card */}
        <div 
          onClick={() => handleLaunch('doctor')}
          className="group relative flex flex-col justify-between p-7 rounded-2xl bg-slate-900/70 border border-white/10 hover:border-cyan-500/50 hover:bg-slate-900/90 transition-all duration-300 shadow-glass cursor-pointer hover:-translate-y-1"
        >
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-colors duration-300">
              <Stethoscope className="w-7 h-7" />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white group-hover:text-cyan-400 transition-colors">
                  Doctor Workstation
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Doctor Login
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Conduct clinical consultations with 9-agent diagnostic assistance, real-time voice capture (Urdu/Hindi/EN), ICD-10 differentials, and auto SOAP documentation.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>Patient Directory & Longitudinal Records</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>Interactive Clinical Q&A Stream</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>DICOM Imaging & Diagnostic Investigations</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>e-Prescription & Printable Final Report</span>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLaunch('doctor');
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-all shadow-glow-cyan"
            >
              <Lock className="w-4 h-4" />
              <span>Doctor Sign In &amp; Launch</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Patient Portal Card */}
        <div 
          onClick={() => handleLaunch('patient')}
          className="group relative flex flex-col justify-between p-7 rounded-2xl bg-slate-900/70 border border-white/10 hover:border-emerald-500/50 hover:bg-slate-900/90 transition-all duration-300 shadow-glass cursor-pointer hover:-translate-y-1"
        >
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors duration-300">
              <User className="w-7 h-7" />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                  Patient Portal
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Patient Login
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Review personal health records, active prescriptions, verified allergy alerts, laboratory findings, and scheduled follow-up visits.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Longitudinal Health Records & Vitals</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Active Medication & Dosage Schedule</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Allergy & Contraindication Guardrails</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Upcoming Appointment Reminders</span>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLaunch('patient');
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-all shadow-glow-emerald"
            >
              <Lock className="w-4 h-4" />
              <span>Patient Sign In &amp; Enter</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Executive Admin Card */}
        <div 
          onClick={() => handleLaunch('admin')}
          className="group relative flex flex-col justify-between p-7 rounded-2xl bg-slate-900/70 border border-white/10 hover:border-indigo-500/50 hover:bg-slate-900/90 transition-all duration-300 shadow-glass cursor-pointer hover:-translate-y-1"
        >
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-slate-950 transition-colors duration-300">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">
                  System Admin
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Admin Auth
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Hospital system management: register physician accounts, onboard patient MRNs, oversee database connectivity, and inspect the cross-patient collective memory graph.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <span>Physician & Patient Account Provisioning</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <span>Supabase Live Connection Telemetry</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <span>Global Collective Intelligence Clusters</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <span>System Health & Safety Audit Logs</span>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLaunch('admin');
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-glow-indigo"
            >
              <Lock className="w-4 h-4" />
              <span>Admin Sign In &amp; Manage</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      {/* Safety & Educational Disclaimer Bar */}

      <div className="mt-16 p-4 rounded-xl bg-slate-900/40 border border-white/5 text-center max-w-3xl mx-auto text-xs text-slate-400 flex items-center justify-center gap-3">
        <span className="text-amber-400 font-semibold flex items-center gap-1">
          <Activity className="w-4 h-4" /> Clinical Decision Support Notice:
        </span>
        <span>
          MedAI is designed for research, clinical decision verification, and educational decision support. Not a replacement for licensed medical judgment.
        </span>
      </div>

    </div>
  );
}
