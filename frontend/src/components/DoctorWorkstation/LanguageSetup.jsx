import React, { useState } from 'react';
import { 
  Languages, 
  ArrowLeft, 
  ArrowRight, 
  Sparkles, 
  Check, 
  Mic, 
  FileText, 
  Stethoscope, 
  ShieldCheck,
  Zap
} from 'lucide-react';

const LANGUAGES = [
  {
    code: "ur",
    flag: "🇵🇰",
    name: "اردو (Urdu)",
    sub: "سفارش کی گئی — مکمل اردو بولنے اور سننے کی سہولت",
    locale: "ur-PK"
  },
  {
    code: "hi",
    flag: "🇮🇳",
    name: "हिंदी (Hindi)",
    sub: "अनुशंसित — पूर्ण हिंदी बोलने और सुनने की सुविधा",
    locale: "hi-IN"
  },
  {
    code: "en",
    flag: "🇺🇸",
    name: "English",
    sub: "Standard clinical dialogue & international terminology",
    locale: "en-US"
  }
];

const PRESETS = [
  {
    label: "Shortness of Breath (Asthma / COPD)",
    text: "50-year-old male presenting with shortness of breath that comes and goes, triggered by heavy duty work. History of mild asthma and severe penicillin allergy. Vitals: BP 138/85, HR 92 bpm, SpO2 94% on room air."
  },
  {
    label: "Acute Retrosternal Chest Pain",
    text: "62-year-old female presenting with retrosternal chest pressure radiating to the left arm for 45 minutes, accompanied by diaphoresis and mild nausea. History of hypertension and hyperlipidemia."
  },
  {
    label: "Fever & Productive Cough",
    text: "44-year-old male presenting with 4-day history of productive cough with rust-colored sputum, high grade fever (38.9°C), right-sided pleuritic chest pain, and chills. SpO2 93%."
  },
  {
    label: "Severe Throbbing Migraine",
    text: "35-year-old female presenting with severe throbbing unilateral headache (8/10), photophobia, phonophobia, and visual scintillating scotoma for 3 hours. No focal neurological deficits."
  }
];

export default function LanguageSetup({ 
  patient, 
  selectedLanguage, 
  setSelectedLanguage, 
  onBack, 
  onStartConsultation,
  isLoading 
}) {
  const [description, setDescription] = useState(patient?.initialStory || "");

  const handleStart = (e) => {
    e.preventDefault();
    if (!description.trim()) return;
    onStartConsultation(description, selectedLanguage);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
            Step 2 of 3: Consultation Parameters
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
            Language &amp; Clinical Presentation
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Configure conversation language and specify presenting clinical findings.
          </p>
        </div>

        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-medium text-slate-300 hover:text-white hover:border-white/20 transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Directory</span>
        </button>
      </div>

      {/* Linked Patient Summary Banner */}
      {patient && (
        <div className="mb-6 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
              {patient.name[0]}
            </div>
            <div>
              <div className="text-xs text-cyan-300 uppercase tracking-wider font-semibold">Linked Medical Record</div>
              <div className="text-base font-bold text-white">
                {patient.name} <span className="font-mono text-sm text-cyan-400 font-normal">({patient.mrn})</span>
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-slate-300">
            <div>Allergies: <span className="text-rose-400 font-semibold">{patient.allergies.join(', ')}</span></div>
            <div className="text-slate-400">{patient.gender}, {patient.age}y &bull; SpO2: {patient.vitals.spo2}</div>
          </div>
        </div>
      )}

      <form onSubmit={handleStart} className="space-y-6">
        
        {/* Language Selection Grid */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-white flex items-center gap-2">
            <Languages className="w-4 h-4 text-cyan-400" />
            <span>Select Consultation Language:</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {LANGUAGES.map((lang) => {
              const isSelected = selectedLanguage === lang.code;
              return (
                <div
                  key={lang.code}
                  onClick={() => setSelectedLanguage(lang.code)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 text-center ${
                    isSelected
                      ? 'bg-cyan-500/10 border-cyan-500 shadow-glow-cyan'
                      : 'bg-slate-900/60 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="text-3xl mb-1">{lang.flag}</div>
                  <div className={`font-bold text-sm ${isSelected ? 'text-cyan-400' : 'text-white'}`}>
                    {lang.name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                    {lang.sub}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dual-Translation Explainer Callout */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div className="text-xs text-slate-300 leading-relaxed">
            <strong className="text-cyan-400">Multilingual Bridge Active:</strong> Spoken audio and written input in Urdu or Hindi are transcribed with Faster-Whisper (large-v3), mapped to standardized English clinical terminology for 9-agent reasoning, and synthesized back into your selected language.
          </div>
        </div>

        {/* Presenting Findings / Patient Story Input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>Initial Clinical Presentation / Chief Complaint:</span>
            </label>
            <span className="text-xs text-slate-400">Minimum 10 characters</span>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDescription(preset.text)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white text-[11px] font-medium transition-colors"
              >
                + {preset.label}
              </button>
            ))}
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Describe the patient's symptoms, onset, severity, vitals, triggers, and clinical history..."
            required
            className="w-full p-4 rounded-xl bg-slate-900/90 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 leading-relaxed font-sans"
          />
        </div>

        {/* Submit Consultation */}
        <button
          type="submit"
          disabled={isLoading || description.trim().length < 8}
          className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold text-base transition-all shadow-glow-cyan flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>Initializing 9-Agent Consensus Graph...</span>
            </>
          ) : (
            <>
              <span>Initiate Multi-Agent Consultation</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>

      </form>

    </div>
  );
}
