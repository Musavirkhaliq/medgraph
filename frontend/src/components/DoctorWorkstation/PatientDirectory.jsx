import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  UserPlus,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowRight,
  ChevronRight,
  ShieldAlert,
  User,
  Stethoscope,
  HeartPulse,
  RefreshCw
} from 'lucide-react';
import { searchPatients } from '../../services/api';

export const DEFAULT_PATIENTS = [
  {
    id: "pat-001",
    name: "John Doe",
    mrn: "MRN-2026-0891",
    gender: "Male",
    age: 50,
    activeDx: ["Asthma (J45.909)", "Essential Hypertension"],
    allergies: ["Penicillin (Severe Anaphylaxis)"],
    allergyLevel: "critical",
    lastVisit: "3 days ago",
    status: "Active Record",
    vitals: { bp: "138/85", hr: "92 bpm", spo2: "94%" },
    initialStory: "50-year-old male presenting with shortness of breath that comes and goes, triggered by heavy duty work. History of mild asthma and severe penicillin allergy. Vitals: BP 138/85, HR 92 bpm, SpO2 94% on room air."
  },
  {
    id: "pat-002",
    name: "Jane Miller",
    mrn: "MRN-2026-1042",
    gender: "Female",
    age: 41,
    activeDx: ["Essential Hypertension", "Type 2 Diabetes Mellitus"],
    allergies: ["No Known Drug Allergies (NKDA)"],
    allergyLevel: "safe",
    lastVisit: "1 week ago",
    status: "Active Record",
    vitals: { bp: "128/82", hr: "76 bpm", spo2: "98%" },
    initialStory: "41-year-old female presenting with routine follow-up for hypertension and mild fatigue. Denies chest pain or shortness of breath. Glucose slightly elevated."
  },
  {
    id: "pat-003",
    name: "Robert Chen",
    mrn: "MRN-2026-0419",
    gender: "Male",
    age: 68,
    activeDx: ["Severe COPD", "Hyperlipidemia"],
    allergies: ["Sulfa Drugs (Erythema / Rash)"],
    allergyLevel: "warning",
    lastVisit: "2 weeks ago",
    status: "Active Record",
    vitals: { bp: "142/88", hr: "88 bpm", spo2: "91%" },
    initialStory: "68-year-old male with severe COPD presenting with productive morning cough, increased sputum volume, and mild wheezing."
  }
];

function computeAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const diff = Date.now() - birth.getTime();
  return Math.max(0, Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
}

function mapPatientProfile(p) {
  const allergyNames = (p.allergies || []).map(a => (typeof a === 'string' ? a : a.allergen)).filter(Boolean);
  const hasSevere = (p.allergies || []).some(a => typeof a === 'object' && /sever|anaphyla/i.test(a.severity || ''));
  const allergyLevel = allergyNames.length === 0 ? 'safe' : (hasSevere ? 'critical' : 'warning');
  const activeDx = (p.chronic_conditions || []).map(c => (typeof c === 'string' ? c : c.condition)).filter(Boolean);

  return {
    id: p.id,
    name: p.full_name,
    mrn: p.mrn,
    gender: (p.gender || '').charAt(0).toUpperCase() + (p.gender || '').slice(1),
    age: computeAge(p.date_of_birth),
    activeDx: activeDx.length > 0 ? activeDx : ["No active diagnoses on file"],
    allergies: allergyNames.length > 0 ? allergyNames : ["No Known Drug Allergies (NKDA)"],
    allergyLevel,
    lastVisit: "See longitudinal timeline",
    status: "Active Record",
    vitals: { bp: "Not recorded", hr: "Not recorded", spo2: "Not recorded" },
    initialStory: `${computeAge(p.date_of_birth) || 'Unknown age'}-year-old ${p.gender || 'patient'} (MRN ${p.mrn}) presenting for clinical assessment.${activeDx.length ? ` Known history: ${activeDx.join(', ')}.` : ''}${allergyNames.length ? ` Documented allergies: ${allergyNames.join(', ')}.` : ' No known drug allergies.'}`,
  };
}

export default function PatientDirectory({ onSelectPatient, onRegisterNewClick }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [patients, setPatients] = useState(DEFAULT_PATIENTS);
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);

  const loadPatients = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await searchPatients('');
      if (res && Array.isArray(res.patients) && res.patients.length > 0) {
        setPatients(res.patients.map(mapPatientProfile));
        setIsLive(true);
      }
    } catch (err) {
      console.warn("Could not load live patient directory, using demo records:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const filteredPatients = patients.filter(pat => {
    const q = searchTerm.toLowerCase();
    const matchesQuery = 
      pat.name.toLowerCase().includes(q) ||
      pat.mrn.toLowerCase().includes(q) ||
      pat.activeDx.some(d => d.toLowerCase().includes(q)) ||
      pat.allergies.some(a => a.toLowerCase().includes(q));
    
    if (filter === 'critical') return matchesQuery && pat.allergyLevel === 'critical';
    return matchesQuery;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
            Step 1 of 3: Clinical Record Linking
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
            Patient Directory &amp; Longitudinal Records
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Select a verified patient account to link medical history and begin an AI-assisted clinical consultation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadPatients}
            title="Refresh patient directory"
            className="p-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onRegisterNewClick}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs sm:text-sm transition-all shadow-glow-cyan"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register New Patient</span>
          </button>
        </div>
      </div>

      {!isLive && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
          Showing demo records &mdash; live backend directory unavailable or empty.
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Patient Name, MRN, Condition (e.g. John, Asthma, MRN-2026)..."
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-white/10 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${filter === 'all' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
          >
            All Patients
          </button>
          <button
            onClick={() => setFilter('critical')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${filter === 'critical' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            High Risk / Allergies
          </button>
        </div>
      </div>

      {/* Patient Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredPatients.map((patient) => (
          <div
            key={patient.id}
            onClick={() => onSelectPatient(patient)}
            className="group relative flex flex-col justify-between p-5 rounded-2xl bg-slate-900/70 border border-white/10 hover:border-cyan-500/50 hover:bg-slate-900/90 transition-all duration-200 cursor-pointer shadow-glass hover:-translate-y-1"
          >
            <div>
              {/* Card Header: Avatar & MRN */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm">
                    {patient.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white group-hover:text-cyan-400 transition-colors">
                      {patient.name}
                    </h3>
                    <div className="text-xs text-slate-400 font-mono">
                      {patient.mrn} &bull; {patient.gender}, {patient.age != null ? `${patient.age}y` : 'Age unknown'}
                    </div>
                  </div>
                </div>

                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {patient.status}
                </span>
              </div>

              {/* Conditions & Allergies */}
              <div className="space-y-2 py-3 border-t border-white/5 text-xs">
                <div>
                  <span className="text-slate-500 font-medium">Active Diagnoses:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {patient.activeDx.map((dx, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium text-[11px]">
                        {dx}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 font-medium">Documented Allergies:</span>
                  <div className="mt-1">
                    {patient.allergies.map((allg, i) => (
                      <div 
                        key={i} 
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium ${
                          patient.allergyLevel === 'critical'
                            ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                            : patient.allergyLevel === 'warning'
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>{allg}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vitals Snapshot */}
                <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>BP: <strong className="text-slate-200">{patient.vitals.bp}</strong></span>
                  <span>HR: <strong className="text-slate-200">{patient.vitals.hr}</strong></span>
                  <span>SpO2: <strong className="text-slate-200">{patient.vitals.spo2}</strong></span>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Last visit: {patient.lastVisit}</span>
              </span>
              <span className="text-cyan-400 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                <span>Select</span>
                <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
