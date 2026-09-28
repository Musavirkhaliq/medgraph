import React from 'react';
import {
  Printer,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Pill,
  Calendar,
  User,
  Stethoscope,
  AlertTriangle
} from 'lucide-react';
import { normalizeDifferential, normalizeMedications, percent } from '../../utils/clinical';

const DEMO_REPORT = {
  primary_diagnosis: "Acute Moderate Asthma Exacerbation (ICD-10 J45.909)",
  diagnosis_confidence: 0.92,
  triage_level: "urgent",
  is_safe: true,
  validation_warnings: [],
  differential_diagnosis: [
    { condition: "Acute Asthma Exacerbation (J45.909)", probability: 0.92 },
    { condition: "Community Acquired Pneumonia (J18.9)", probability: 0.42 },
    { condition: "Congestive Heart Failure Exacerbation (I50.9)", probability: 0.15 },
  ],
  medications: [
    { name: "Albuterol HFA Inhaler", dose: "90 mcg", frequency: "2 puffs Q4-6H PRN acute wheezing", duration: "30 days PRN" },
    { name: "Prednisone Oral Tablet", dose: "40 mg", frequency: "Once daily in the morning with food", duration: "5 days burst" },
    { name: "Fluticasone/Salmeterol (Advair)", dose: "250/50 mcg", frequency: "1 puff BID maintenance", duration: "Refill x3" },
  ],
  lifestyle_modifications: ["Avoid sudden temperature extremes and airborne dust", "Use valved spacer for MDI inhaler", "Maintain home peak flow monitoring"],
  follow_up: "Outpatient follow-up with pulmonology clinic in 7–10 days. Return to emergency room immediately if severe shortness of breath or cyanosis occurs.",
};

export default function FinalClinicalReport({
  patient,
  reportData,
  doctor,
  onNewConsultation
}) {
  const printReport = () => {
    window.print();
  };

  const isDemo = !reportData;
  const report = reportData || DEMO_REPORT;
  const differential = normalizeDifferential(report.differential_diagnosis);
  const medications = normalizeMedications(report.medications);
  const confidencePct = percent(report.diagnosis_confidence);
  const safetySummary = report.validation_warnings && report.validation_warnings.length > 0
    ? report.validation_warnings.map(w => `[${(w.severity || 'note').toUpperCase()}] ${w.message}`).join(' ')
    : (report.is_safe
      ? "No safety warnings identified by the Validator Agent. Treatment plan cleared against known allergies and drug interactions."
      : "Validator Agent flagged concerns — review full clinical record before finalizing this plan.");

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

      {isDemo && (
        <div className="print:hidden px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>No completed session report is available yet &mdash; showing an illustrative sample layout.</span>
        </div>
      )}

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
            <span className="text-rose-400 print:text-red-600 font-bold">{patient?.allergies?.[0] || "None on file"}</span>
          </div>
        </div>

        {/* Safety Clearance Banner */}
        <div className={`p-4 rounded-xl border flex items-center gap-3 print:bg-gray-50 print:border-gray-400 ${
          report.is_safe ? 'bg-teal-500/10 border-teal-500/20' : 'bg-rose-500/10 border-rose-500/30'
        }`}>
          <ShieldCheck className={`w-5 h-5 print:text-black shrink-0 ${report.is_safe ? 'text-teal-400' : 'text-rose-400'}`} />
          <div className={`text-xs print:text-black ${report.is_safe ? 'text-teal-200' : 'text-rose-200'}`}>
            <strong>Validator Agent Safety Profile{report.is_safe ? ' Cleared' : ' — Review Required'}:</strong> {safetySummary}
          </div>
        </div>

        {/* Primary Diagnosis Card */}
        <div className="p-5 rounded-xl bg-slate-950/80 border border-white/5 print:bg-transparent print:border-gray-300 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-cyan-400 print:text-black font-bold">
              Primary Clinical Diagnosis
            </span>
            <span className="text-xs font-mono font-bold text-teal-400 print:text-black">
              Confidence: {confidencePct}%
            </span>
          </div>
          <div className="text-lg font-bold text-white print:text-black">
            {report.primary_diagnosis || "Pending assessment"}
          </div>
          <div className="text-xs text-slate-400 print:text-gray-700">
            Triage Severity: <strong className="text-slate-200 print:text-black capitalize">{report.triage_level || "Unclassified"}</strong>
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
                <th className="py-2">Condition</th>
                <th className="py-2">Confidence</th>
                <th className="py-2">Clinical Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 print:divide-gray-300">
              {differential.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-2.5 font-semibold text-slate-200 print:text-black">{item.condition}{item.icd_code ? ` (${item.icd_code})` : ''}</td>
                  <td className="py-2.5 font-mono text-cyan-400 print:text-black font-bold">{item.confidence}%</td>
                  <td className="py-2.5 text-slate-400 print:text-gray-700">{item.status}</td>
                </tr>
              ))}
              {differential.length === 0 && (
                <tr><td colSpan={3} className="py-2.5 text-slate-500 print:text-gray-600">No differential diagnosis recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Formulated e-Prescriptions */}
        <div className="space-y-3">
          <h4 className="text-xs font-mono uppercase text-slate-400 print:text-black font-semibold">
            Therapeutic Plan &amp; Prescriptions (e-Rx)
          </h4>
          <div className="space-y-2">
            {medications.length === 0 && (
              <p className="text-xs text-slate-500 print:text-gray-600">No medications prescribed.</p>
            )}
            {medications.map((med, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-950/60 border border-white/5 print:bg-gray-50 print:border-gray-300 text-xs flex justify-between items-start gap-4">
                <div>
                  <div className="font-bold text-white print:text-black">{med.name}{med.dosage ? ` — ${med.dosage}` : ''}</div>
                  <div className="text-slate-400 print:text-gray-700 mt-0.5">Sig: {med.frequency || 'As directed'}{med.route ? ` (${med.route})` : ''}</div>
                  {med.warnings && <div className="text-amber-400 print:text-gray-800 mt-0.5">{med.warnings}</div>}
                </div>
                <div className="font-mono text-cyan-400 print:text-black text-right shrink-0">
                  {med.duration}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lifestyle & Follow-up */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 print:bg-gray-50 print:border-gray-300 space-y-1">
            <span className="font-bold text-slate-300 print:text-black block">Lifestyle &amp; Non-Pharmacological</span>
            <p className="text-slate-400 print:text-gray-700 leading-relaxed">{(report.lifestyle_modifications || []).join('. ') || "None specified."}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 print:bg-gray-50 print:border-gray-300 space-y-1">
            <span className="font-bold text-slate-300 print:text-black block">Follow-up &amp; Red Flag Instructions</span>
            <p className="text-slate-400 print:text-gray-700 leading-relaxed">{report.follow_up || "To be determined."}</p>
          </div>
        </div>

        {/* Physician Signature & Legal Disclaimer */}
        <div className="pt-6 border-t border-white/10 print:border-black flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
          <div>
            <div className="font-bold text-white print:text-black">
              {doctor?.full_name || "Attending Physician"}
              {doctor?.license_number ? ` • LIC #${doctor.license_number}` : ''}
            </div>
            <div className="text-slate-400 print:text-gray-600 text-[11px]">{doctor?.specialty || "MedAI Clinical Reasoning Core"}</div>
          </div>
          <div className="text-right text-[11px] text-teal-400 print:text-black font-semibold">
            ✓ Digitally Verified &amp; Signed via MedAI Consensus Graph
          </div>
        </div>

      </div>

    </div>
  );
}
