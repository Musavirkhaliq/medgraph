import React from 'react';
import { 
  Activity, 
  User, 
  Brain, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  ShieldAlert, 
  Stethoscope, 
  SlidersHorizontal,
  Lock
} from 'lucide-react';

export default function Navbar({ 
  currentView, 
  setCurrentView, 
  user, 
  onLogout, 
  onOpenAuth,
  activePatient, 
  onOpenTelemetry, 
  onOpenMemory, 
  soundEnabled, 
  setSoundEnabled, 
  onResetSession,
  activeSessionId,
  aiStatus = "Standby" 
}) {

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        
        {/* Brand & Identity */}
        <div 
          className="flex items-center gap-3 cursor-pointer group select-none"
          onClick={() => setCurrentView('hub')}
          title="Return to Portal Hub"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-slate-950 shadow-glow-cyan shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            <Activity className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-white font-sans">
                Med<span className="text-cyan-400">AI</span>
              </span>
              <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                v2.0
              </span>
            </div>
            <p className="text-xs text-slate-400 -mt-0.5">Clinical Decision Support</p>
          </div>
        </div>

        {/* Center: Live AI State / Patient Pill */}
        <div className="hidden md:flex items-center gap-3">
          {activeSessionId && (
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-900/80 border border-cyan-500/30 text-xs text-slate-200">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span className="font-mono text-cyan-300 font-medium">Session: {activeSessionId.slice(-8)}</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300 truncate max-w-[180px]">{aiStatus}</span>
            </div>
          )}

          {activePatient && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/70 border border-white/10 text-xs text-slate-300">
              <Stethoscope className="w-3.5 h-3.5 text-teal-400" />
              <span className="font-semibold text-white">{activePatient.name}</span>
              <span className="text-slate-400 font-mono text-[11px]">({activePatient.mrn})</span>
            </div>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Memory Hub Trigger */}
          <button
            onClick={onOpenMemory}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 hover:border-cyan-500/40 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            title="Open Dual-Tier Clinical Memory Hub"
          >
            <Brain className="w-3.5 h-3.5 text-indigo-400" />
            <span>Memory Hub</span>
          </button>

          {/* Telemetry Trigger */}
          <button
            onClick={onOpenTelemetry}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 hover:border-cyan-500/40 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            title="Inspect 9-Agent Pipeline Telemetry"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Telemetry</span>
          </button>

          {/* SFX Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg border text-xs transition-colors ${
              soundEnabled 
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' 
                : 'bg-slate-900 border-white/10 text-slate-500'
            }`}
            title={soundEnabled ? "Audio Effects Enabled" : "Audio Effects Muted"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* New Session */}
          {currentView === 'doctor-active' && (
            <button
              onClick={onResetSession}
              className="p-2 rounded-lg bg-slate-900 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition-colors"
              title="Reset and Start New Consultation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* User Profile / Portal Nav */}
          <div className="flex items-center gap-2 pl-2 border-l border-white/10">
            {user ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-semibold text-cyan-300">
                  {user.role === 'doctor' ? 'MD' : user.role === 'admin' ? 'AD' : 'PT'}
                </div>
                <button
                  onClick={onLogout}
                  className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
                >
                  Exit
                </button>
              </div>
            ) : (
              <button
                onClick={() => onOpenAuth ? onOpenAuth('doctor') : setCurrentView('hub')}
                className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-all shadow-glow-cyan flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}

          </div>
        </div>

      </div>
    </header>
  );
}
