import React, { useState } from 'react';
import { 
  User, 
  Pill, 
  ShieldAlert, 
  Calendar, 
  Clock, 
  ArrowLeft, 
  CheckCircle2, 
  FileText, 
  HeartPulse, 
  AlertCircle,
  PhoneCall,
  Activity
} from 'lucide-react';

export default function PatientDashboard({ onBackToHub }) {
  const patient = {
    name: "John Doe",
    mrn: "MRN-2026-0891",
    dob: "1976-03-14 (50y, Male)",
    primaryPhysician: "Dr. Sarah Jenkins, MD",
    emergencyContact: "Mary Doe (Spouse) &bull; +1 (555) 349-2910",
    allergies: [
      { name: "Penicillin", severity: "Severe Anaphylaxis", noted: "Hospital Records Verified" }
    ],
    vitals: {
      bp: "128/82 mmHg",
      hr: "76 bpm",
      spo2: "98%",
      temp: "36.7 °C"
    },
    prescriptions: [
      {
        name: "Albuterol Sulfate (Ventolin HFA)",
        dosage: "90 mcg Inhaler",
        instructions: "Inhale 2 puffs every 4 to 6 hours as needed for wheezing or acute shortness of breath.",
        status: "Active",
        refills: "3 remaining"
      },
      {
        name: "Fluticasone / Salmeterol (Advair Diskus)",
        dosage: "250/50 mcg Oral Inhalation",
        instructions: "1 inhalation twice daily (morning and evening). Rinse mouth with water after use.",
        status: "Active",
        refills: "2 remaining"
      },
      {
        name: "Lisinopril Oral Tablet",
        dosage: "10 mg Daily",
        instructions: "Take 1 tablet by mouth every morning with or without food for blood pressure maintenance.",
        status: "Active",
        refills: "5 remaining"
      }
    ],
    followups: [
      {
        date: "September 18, 2026 at 10:30 AM",
        provider: "Dr. Sarah Jenkins, MD (Pulmonology)",
        reason: "Post-Exacerbation Asthma & Spirometry Review",
        location: "Outpatient Pulmonary Pavilion, Suite 402"
      }
    ],
    recentNotes: [
      {
        date: "September 4, 2026",
        provider: "Dr. Sarah Jenkins, MD",
        summary: "Clinical consultation for acute exertional dyspnea. Prescribed short oral corticosteroid course and daily controller inhaler. Allergen avoidance reviewed."
      }
    ]
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xl">
            {patient.name[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white">{patient.name}</h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Patient Account Active
              </span>
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              {patient.mrn} &bull; DOB: {patient.dob}
            </div>
          </div>
        </div>

        <button
          onClick={onBackToHub}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-medium text-slate-300 hover:text-white hover:border-white/20 transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit to Portals</span>
        </button>
      </div>

      {/* Allergies Alert Banner */}
      <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <div className="font-bold text-rose-300 text-sm">
            Critical Allergy Alert: {patient.allergies[0].name} ({patient.allergies[0].severity})
          </div>
          <p className="text-rose-200/80">
            All medical providers and pharmacies are electronically alerted to avoid penicillin and related beta-lactam antibiotics.
          </p>
        </div>
      </div>

      {/* Health Vitals & Overview Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium">Blood Pressure</span>
          <div className="text-lg font-bold text-white">{patient.vitals.bp}</div>
          <span className="text-[10px] text-emerald-400">Normal Range</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium">Heart Rate</span>
          <div className="text-lg font-bold text-white">{patient.vitals.hr}</div>
          <span className="text-[10px] text-emerald-400">Resting Regular</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium">Blood Oxygen (SpO2)</span>
          <div className="text-lg font-bold text-cyan-400">{patient.vitals.spo2}</div>
          <span className="text-[10px] text-slate-400">Room Air</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium">Attending Physician</span>
          <div className="text-sm font-bold text-white truncate">{patient.primaryPhysician}</div>
          <span className="text-[10px] text-slate-400">Internal Medicine</span>
        </div>
      </div>

      {/* Active Prescriptions & Medications */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Pill className="w-5 h-5 text-emerald-400" />
            <span>My Active Prescriptions &amp; Medication Schedule</span>
          </h3>
          <span className="text-xs text-slate-400">{patient.prescriptions.length} Active Rx</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {patient.prescriptions.map((rx, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-slate-950/70 border border-white/5 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-sm text-white">{rx.name}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                    {rx.status}
                  </span>
                </div>
                <div className="text-xs font-mono text-cyan-400">{rx.dosage}</div>
                <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-white/5">
                  {rx.instructions}
                </p>
              </div>

              <div className="pt-2 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Refills: {rx.refills}</span>
                <span className="text-emerald-400 font-medium">Verified e-Rx</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Follow-ups & Recent Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Scheduled Appointments */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/10 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-cyan-400" />
            <span>Upcoming Medical Consultations</span>
          </h3>

          <div className="space-y-3">
            {patient.followups.map((f, i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-950/70 border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-cyan-300">{f.date}</span>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400">
                    Confirmed
                  </span>
                </div>
                <div className="text-sm font-semibold text-white">{f.provider}</div>
                <div className="text-xs text-slate-400">{f.reason}</div>
                <div className="text-[11px] text-slate-500">{f.location}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Clinical Notes Summary */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/10 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <span>Physician Encounter Summaries</span>
          </h3>

          <div className="space-y-3">
            {patient.recentNotes.map((note, i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-950/70 border border-white/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-300">{note.date}</span>
                  <span className="text-[11px] text-teal-400 font-medium">{note.provider}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {note.summary}
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
