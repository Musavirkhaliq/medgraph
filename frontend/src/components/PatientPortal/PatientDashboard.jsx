import React, { useState, useEffect, useCallback } from 'react';
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
  Activity,
  RefreshCw
} from 'lucide-react';
import { getPatientHistory, getPatientMemoryTimeline } from '../../services/api';

function computeAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000)));
}

export default function PatientDashboard({ user, onBackToHub }) {
  const [patient, setPatient] = useState(null);
  const [followups, setFollowups] = useState([]);
  const [recentNotes, setRecentNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const patientAccountId = user?.id || 'pat-001';

  const loadPatientData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [historyRes, timelineRes] = await Promise.all([
        getPatientHistory(patientAccountId),
        getPatientMemoryTimeline(patientAccountId),
      ]);

      if (historyRes?.patient) {
        setPatient(historyRes.patient);
        setFollowups(Array.isArray(historyRes.followups) ? historyRes.followups : []);
      } else {
        setLoadError("No linked clinical record was found for this account. Please contact your care team or the front desk.");
      }

      const timeline = timelineRes?.timeline;
      if (Array.isArray(timeline)) {
        setRecentNotes(timeline.slice(0, 6));
      }
    } catch (err) {
      console.warn("Failed to load patient portal data:", err);
      setLoadError("Unable to reach the clinical records service. Please try again shortly.");
    } finally {
      setIsLoading(false);
    }
  }, [patientAccountId]);

  useEffect(() => {
    loadPatientData();
  }, [loadPatientData]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
        <span className="text-sm">Loading your clinical record...</span>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Patient Portal</h2>
          <button
            onClick={onBackToHub}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-medium text-slate-300 hover:text-white hover:border-white/20 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit to Portals</span>
          </button>
        </div>
        <div className="p-6 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-200">
            {loadError || "Your clinical record could not be loaded."}
          </div>
        </div>
        <button
          onClick={loadPatientData}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-medium text-slate-300 hover:text-white transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const age = computeAge(patient.date_of_birth);
  const primaryAllergy = (patient.allergies || [])[0];
  const upcomingFollowups = followups.filter(f => f.status === 'scheduled');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xl">
            {patient.full_name?.[0] || "P"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white">{patient.full_name}</h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Patient Account Active
              </span>
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              {patient.mrn} &bull; DOB: {patient.date_of_birth}{age != null ? ` (${age}y, ${patient.gender})` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadPatientData}
            title="Refresh my record"
            className="p-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onBackToHub}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-medium text-slate-300 hover:text-white hover:border-white/20 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit to Portals</span>
          </button>
        </div>
      </div>

      {/* Allergies Alert Banner */}
      {primaryAllergy ? (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold text-rose-300 text-sm">
              Critical Allergy Alert: {typeof primaryAllergy === 'string' ? primaryAllergy : primaryAllergy.allergen} {primaryAllergy.severity ? `(${primaryAllergy.severity})` : ''}
            </div>
            <p className="text-rose-200/80">
              All medical providers and pharmacies linked to this record are alerted to this allergy before prescribing.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 flex items-center gap-3 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>No known drug allergies (NKDA) documented on this record.</span>
        </div>
      )}

      {/* Overview Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium">Blood Type</span>
          <div className="text-lg font-bold text-white">{patient.blood_type || "Unknown"}</div>
          <span className="text-[10px] text-slate-400">On file</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium">Chronic Conditions</span>
          <div className="text-lg font-bold text-white">{(patient.chronic_conditions || []).length}</div>
          <span className="text-[10px] text-slate-400">Documented</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium">Active Prescriptions</span>
          <div className="text-lg font-bold text-cyan-400">{(patient.current_medications || []).length}</div>
          <span className="text-[10px] text-slate-400">On file</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium">Contact</span>
          <div className="text-sm font-bold text-white truncate">{patient.phone || patient.email || "Not on file"}</div>
          <span className="text-[10px] text-slate-400">Primary contact</span>
        </div>
      </div>

      {/* Chronic Conditions */}
      {(patient.chronic_conditions || []).length > 0 && (
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-rose-400" />
            <span>Chronic Conditions</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {patient.chronic_conditions.map((c, i) => (
              <span key={i} className="px-3 py-1.5 rounded-full bg-slate-950/70 border border-white/5 text-xs text-slate-300">
                {typeof c === 'string' ? c : `${c.condition}${c.status ? ` • ${c.status}` : ''}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Active Prescriptions & Medications */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Pill className="w-5 h-5 text-emerald-400" />
            <span>My Active Prescriptions &amp; Medication Schedule</span>
          </h3>
          <span className="text-xs text-slate-400">{(patient.current_medications || []).length} Active Rx</span>
        </div>

        {(patient.current_medications || []).length === 0 ? (
          <p className="text-xs text-slate-500">No active prescriptions on file.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {patient.current_medications.map((rx, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-950/70 border border-white/5 space-y-2 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm text-white">{rx.name}</div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Active
                    </span>
                  </div>
                  <div className="text-xs font-mono text-cyan-400">{rx.dosage}</div>
                  <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-white/5">
                    {rx.route ? `Route: ${rx.route}. ` : ''}{rx.frequency || ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
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
            {upcomingFollowups.length === 0 && (
              <p className="text-xs text-slate-500">No upcoming follow-ups scheduled.</p>
            )}
            {upcomingFollowups.map((f) => (
              <div key={f.id} className="p-4 rounded-xl bg-slate-950/70 border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-cyan-300">{f.due_date}</span>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400">
                    {f.status}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white">{f.title}</div>
                <div className="text-xs text-slate-400">{f.description || f.followup_type}</div>
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
            {recentNotes.length === 0 && (
              <p className="text-xs text-slate-500">No encounter summaries recorded yet.</p>
            )}
            {recentNotes.map((note, i) => (
              <div key={note.id || i} className="p-4 rounded-xl bg-slate-950/70 border border-white/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-300">
                    {note.created_at ? new Date(note.created_at).toLocaleDateString() : "Recent"}
                  </span>
                  <span className="text-[11px] text-teal-400 font-medium">
                    {note.source === 'doctor' ? "Attending Physician" : "MedAI Clinical Engine"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {note.summary || note.title}
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
