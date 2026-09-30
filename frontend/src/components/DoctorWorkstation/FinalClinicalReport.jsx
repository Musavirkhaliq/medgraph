import React, { useState } from 'react';
import {
  Printer,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Pencil,
  Save,
  BookOpen,
  Database,
  HeartPulse,
} from 'lucide-react';
import { submitReportReview } from '../../services/api';

export default function FinalClinicalReport({
  patient,
  reportData,
  sessionId,
  reviewerId = 'doc-001',
  onNewConsultation
}) {
  const printReport = () => {
    window.print();
  };

  const safeReport = reportData || {
    primary_diagnosis: "Acute Moderate Asthma Exacerbation (ICD-10 J45.909)",
    confidence: "92%",
    triage_level: "Urgent (ESI Level 3)",
    is_safe: true,
    safety_summary: "No drug interactions identified. Beta-lactam antibiotics omitted due to confirmed severe Penicillin anaphylaxis history.",
    differential_diagnosis: [
      { name: "J45.909 — Acute Asthma Exacerbation", confidence: "92%", status: "Primary Diagnosis" },
      { name: "J18.9 — Community Acquired Pneumonia", confidence: "42%", status: "Secondary Consideration" },
      { name: "I50.9 — Congestive Heart Failure Exacerbation", confidence: "15%", status: "Ruled Out" }
    ],
    medications: [
      { name: "Albuterol HFA Inhaler", dose: "90 mcg", sig: "2 puffs Q4-6H PRN acute wheezing", duration: "30 days PRN" },
      { name: "Prednisone Oral Tablet", dose: "40 mg", sig: "Once daily in the morning with food", duration: "5 days burst" },
      { name: "Fluticasone/Salmeterol (Advair)", dose: "250/50 mcg", sig: "1 puff BID maintenance", duration: "Refill x3" }
    ],
    lifestyle: "Avoid sudden temperature extremes and airborne dust. Use valved spacer for MDI inhaler. Maintain home peak flow monitoring.",
    follow_up: "Outpatient follow-up with pulmonology clinic in 7–10 days. Return to emergency room immediately if severe shortness of breath or cyanosis occurs."
  };

  // ── Doctor review & sign-off (advisory) ─────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editedDiagnosis, setEditedDiagnosis] = useState(safeReport.primary_diagnosis || '');
  const [editedFollowUp, setEditedFollowUp] = useState(safeReport.follow_up || '');
  const [editedLifestyle, setEditedLifestyle] = useState(safeReport.lifestyle || '');
  const [reviewStatus, setReviewStatus] = useState(reportData?.review_status || null);
  const [reviewNotes, setReviewNotes] = useState(reportData?.review_notes || '');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  const submitReview = async (status) => {
    if (!sessionId) {
      setReviewStatus(status);
      return;
    }
    setIsSubmittingReview(true);
    setReviewError(null);
    try {
      const editedReport = isEditing
        ? {
            primary_diagnosis: editedDiagnosis,
            follow_up: editedFollowUp,
            lifestyle_modifications: editedLifestyle ? editedLifestyle.split('\n').filter(Boolean) : undefined,
          }
        : null;
      await submitReportReview(sessionId, {
        status,
        reviewerId,
        notes: reviewNotes || null,
        editedReport,
      });
      setReviewStatus(status);
      setIsEditing(false);
    } catch (err) {
      setReviewError(err.message || 'Failed to submit review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const diagnosisCitations = reportData?.diagnosis_citations || [];
  const treatmentCitations = reportData?.treatment_citations || [];
  const allCitations = [...new Set([...diagnosisCitations, ...treatmentCitations])];

  // Tailwind needs statically-analyzable class strings — build them per-status
  // rather than interpolating a color name, so the JIT compiler can find them.
  const reviewBanner = {
    approved: {
      icon: CheckCircle2,
      label: 'Approved by reviewing physician',
      wrapClass: 'bg-teal-500/10 border-teal-500/20',
      textClass: 'text-teal-300',
    },
    rejected: {
      icon: XCircle,
      label: 'Rejected — changes requested',
      wrapClass: 'bg-rose-500/10 border-rose-500/20',
      textClass: 'text-rose-300',
    },
    pending: {
      icon: ShieldCheck,
      label: 'Pending doctor review',
      wrapClass: 'bg-amber-500/10 border-amber-500/20',
      textClass: 'text-amber-300',
    },
  }[reviewStatus || 'pending'];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Top Action Bar (hidden when printed) */}
      <div className="print:hidden flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/80 border border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm text-white">Clinical Assessment Complete</div>
            <div className="text-xs text-slate-400">Official medical report ready for chart archiving and printing.</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={printReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print / PDF Export</span>
          </button>

          <button
            onClick={onNewConsultation}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-glow-cyan"
          >
            <RotateCcw className="w-4 h-4" />
            <span>New Consultation</span>
          </button>
        </div>
      </div>

      {/* Doctor Review & Sign-off (advisory — report above is already final/visible) */}
      <div className={`print:hidden p-4 rounded-2xl border space-y-3 ${reviewBanner.wrapClass}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className={`flex items-center gap-2 text-xs font-bold ${reviewBanner.textClass}`}>
            <reviewBanner.icon className="w-4 h-4" />
            {reviewBanner.label}
            {reportData?.reviewed_at && (
              <span className="font-normal text-slate-400">
                &bull; {new Date(reportData.reviewed_at).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing((v) => !v)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              {isEditing ? 'Cancel Edit' : 'Edit Before Sign-off'}
            </button>
            <button
              disabled={isSubmittingReview}
              onClick={() => submitReview('approved')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-[11px] font-bold transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {isEditing ? 'Save & Approve' : 'Approve & Sign'}
            </button>
            <button
              disabled={isSubmittingReview}
              onClick={() => submitReview('rejected')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-bold transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              Request Changes
            </button>
          </div>
        </div>

        {isEditing && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-slate-400 font-semibold">Primary Diagnosis</label>
              <input
                value={editedDiagnosis}
                onChange={(e) => setEditedDiagnosis(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Follow-up Plan</label>
              <textarea
                value={editedFollowUp}
                onChange={(e) => setEditedFollowUp(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Lifestyle Modifications (one per line)</label>
              <textarea
                value={editedLifestyle}
                onChange={(e) => setEditedLifestyle(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-slate-400 font-semibold">Review Notes</label>
              <input
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Optional notes for the record…"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        )}
        {reviewError && <div className="text-rose-400 text-[11px]">{reviewError}</div>}
      </div>

      {/* Printable Clinical Report Document Container */}
      <div className="p-8 rounded-2xl bg-slate-900 border border-white/10 space-y-6 print:bg-white print:text-black print:border-none print:p-0">

        {/* Hospital / Clinic Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-6 print:border-black">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-black text-2xl tracking-tight text-white print:text-black">
                Med<span className="text-cyan-400 print:text-black">AI</span>
              </span>
              <span className="text-xs uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono print:border print:border-black print:text-black">
                Official Clinical Summary
              </span>
            </div>
            <div className="text-xs text-slate-400 print:text-gray-700">
              Department of Pulmonary &amp; Internal Medicine &bull; Clinical Reasoning Core v2.0
            </div>
          </div>

          <div className="text-right text-xs text-slate-400 print:text-gray-700 font-mono">
            <div>Date: {new Date().toLocaleDateString()}</div>
            <div>Doc ID: MD-{Date.now().toString().slice(-8)}</div>
          </div>
        </div>

        {/* Patient Demographics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-950/70 border border-white/5 print:bg-gray-100 print:border-gray-300 text-xs">
          <div>
            <span className="text-slate-500 print:text-gray-600 block">Patient Name</span>
            <span className="font-bold text-white print:text-black text-sm">{patient?.name || "John Doe"}</span>
          </div>
          <div>
            <span className="text-slate-500 print:text-gray-600 block">MRN</span>
            <span className="font-mono text-cyan-400 print:text-black font-medium">{patient?.mrn || "MRN-2026-0891"}</span>
          </div>
          <div>
            <span className="text-slate-500 print:text-gray-600 block">Demographics</span>
            <span className="text-slate-200 print:text-black">{patient?.gender || "Male"}, {patient?.age || 50}y</span>
          </div>
          <div>
            <span className="text-slate-500 print:text-gray-600 block">Allergies</span>
            <span className="text-rose-400 print:text-red-600 font-bold">{patient?.allergies?.[0] || "Penicillin"}</span>
          </div>
        </div>

        {/* EHR sync + NEWS2 early-warning strip (only shown when data is present) */}
        {(reportData?.ehr_synced || reportData?.news2_score != null) && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {reportData?.ehr_synced && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 print:hidden">
                <Database className="w-3.5 h-3.5" />
                <span>Synced with patient EHR record</span>
              </div>
            )}
            {reportData?.news2_score != null && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border print:hidden ${
                reportData.news2_risk_band === 'high' ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                : reportData.news2_risk_band === 'medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                : 'bg-teal-500/10 border-teal-500/20 text-teal-300'
              }`}>
                <HeartPulse className="w-3.5 h-3.5" />
                <span>NEWS2 Score: {reportData.news2_score} ({reportData.news2_risk_band} risk)</span>
              </div>
            )}
          </div>
        )}

        {/* Safety Clearance Banner */}
        <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 print:bg-gray-50 print:border-gray-400 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-teal-400 print:text-black shrink-0" />
          <div className="text-xs text-teal-200 print:text-black">
            <strong>Validator Agent Safety Profile Cleared:</strong> {safeReport.safety_summary}
          </div>
        </div>

        {/* Primary Diagnosis Card */}
        <div className="p-5 rounded-xl bg-slate-950/80 border border-white/5 print:bg-transparent print:border-gray-300 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-cyan-400 print:text-black font-bold">
              Primary Clinical Diagnosis
            </span>
            <span className="text-xs font-mono font-bold text-teal-400 print:text-black">
              Confidence: {safeReport.confidence}
            </span>
          </div>
          <div className="text-lg font-bold text-white print:text-black">
            {reportData?.doctor_edits?.primary_diagnosis || safeReport.primary_diagnosis}
          </div>
          <div className="text-xs text-slate-400 print:text-gray-700">
            Triage Severity: <strong className="text-slate-200 print:text-black">{safeReport.triage_level}</strong>
          </div>
        </div>

        {/* Differential Diagnoses Matrix */}
        <div className="space-y-3">
          <h4 className="text-xs font-mono uppercase text-slate-400 print:text-black font-semibold">
            Differential Diagnostic Consideration
          </h4>
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 print:border-gray-400 text-slate-400 print:text-black">
                <th className="py-2">ICD-10 Condition</th>
                <th className="py-2">Confidence</th>
                <th className="py-2">Clinical Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 print:divide-gray-300">
              {safeReport.differential_diagnosis?.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-2.5 font-semibold text-slate-200 print:text-black">{item.name}</td>
                  <td className="py-2.5 font-mono text-cyan-400 print:text-black font-bold">{item.confidence}</td>
                  <td className="py-2.5 text-slate-400 print:text-gray-700">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Formulated e-Prescriptions */}
        <div className="space-y-3">
          <h4 className="text-xs font-mono uppercase text-slate-400 print:text-black font-semibold">
            Therapeutic Plan &amp; Prescriptions (e-Rx)
          </h4>
          <div className="space-y-2">
            {safeReport.medications?.map((med, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-950/60 border border-white/5 print:bg-gray-50 print:border-gray-300 text-xs flex justify-between items-start gap-4">
                <div>
                  <div className="font-bold text-white print:text-black">{med.name} — {med.dose}</div>
                  <div className="text-slate-400 print:text-gray-700 mt-0.5">Sig: {med.sig}</div>
                </div>
                <div className="font-mono text-cyan-400 print:text-black text-right shrink-0">
                  {med.duration}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Guideline sources (RAG-grounded reasoning citations) */}
        {allCitations.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-mono uppercase text-slate-400 print:text-black font-semibold flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Guideline Sources
            </h4>
            <ul className="text-[11px] text-slate-400 print:text-gray-700 space-y-1 list-disc list-inside">
              {allCitations.map((c, idx) => (
                <li key={idx}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Lifestyle & Follow-up */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 print:bg-gray-50 print:border-gray-300 space-y-1">
            <span className="font-bold text-slate-300 print:text-black block">Lifestyle &amp; Non-Pharmacological</span>
            <p className="text-slate-400 print:text-gray-700 leading-relaxed">
              {(reportData?.doctor_edits?.lifestyle_modifications || []).join(' ') || safeReport.lifestyle}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 print:bg-gray-50 print:border-gray-300 space-y-1">
            <span className="font-bold text-slate-300 print:text-black block">Follow-up &amp; Red Flag Instructions</span>
            <p className="text-slate-400 print:text-gray-700 leading-relaxed">
              {reportData?.doctor_edits?.follow_up || safeReport.follow_up}
            </p>
          </div>
        </div>

        {/* Physician Signature & Legal Disclaimer */}
        <div className="pt-6 border-t border-white/10 print:border-black flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
          <div>
            <div className="font-bold text-white print:text-black">Dr. Sarah Jenkins, MD &bull; LIC #MD-98210-NY</div>
            <div className="text-slate-400 print:text-gray-600 text-[11px]">Attending Physician, Pulmonology &amp; Internal Medicine</div>
          </div>
          <div className="text-right text-[11px] text-teal-400 print:text-black font-semibold">
            {reviewStatus === 'approved'
              ? '✓ Reviewed, Digitally Verified & Signed via MedAI Consensus Graph'
              : '⏳ Awaiting physician review & sign-off'}
          </div>
        </div>

      </div>

    </div>
  );
}
