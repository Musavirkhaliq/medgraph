import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  FileText, 
  Activity, 
  Plus, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { getPatientMemoryTimeline, addInterimNote } from '../../services/api';

export default function PatientTimeline({ patient }) {
  const [interimNote, setInterimNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notesList, setNotesList] = useState([
    {
      date: "Today — Active Consultation",
      author: "MedAI Clinical Decision Engine",
      type: "Acute Evaluation",
      summary: "Evaluated for acute recurrent dyspnea with wheezing. Formulated comprehensive acute asthma exacerbation management plan with oral prednisone burst and inhaled bronchodilator.",
      vitals: "BP 138/85 | HR 92 | SpO2 94%"
    },
    {
      date: "3 Weeks Ago",
      author: "Dr. Alex Smith, MD",
      type: "Follow-up",
      summary: "Patient reported mild seasonal allergies. Continued baseline albuterol inhaler. Recommended allergen reduction measures at home.",
      vitals: "BP 132/80 | HR 78 | SpO2 98%"
    },
    {
      date: "3 Months Ago",
      author: "Dr. Sarah Jenkins, MD",
      type: "Annual Health Maintenance",
      summary: "Comprehensive cardiovascular and pulmonary evaluation. Hypertension well controlled. Advised annual influenza vaccination.",
      vitals: "BP 130/82 | HR 74 | SpO2 99%"
    }
  ]);

  useEffect(() => {
    const fetchTimeline = async () => {
      const pid = patient?.id || 'pat-001';
      setIsLoading(true);
      try {
        const data = await getPatientMemoryTimeline(pid);
        if (data && Array.isArray(data) && data.length > 0) {
          const mapped = data.map(item => ({
            date: item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "Recent",
            author: item.source === 'doctor' ? "Attending Physician" : "MedAI Memory Engine",
            type: item.category || (item.source === 'doctor' ? "Interim Chart Note" : "Episodic Summary"),
            summary: item.summary || item.title,
            vitals: item.vitals || null
          }));
          setNotesList(mapped);
        }
      } catch (err) {
        console.warn("Could not fetch live patient memory timeline:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTimeline();
  }, [patient]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!interimNote.trim()) return;

    const noteText = interimNote.trim();
    setIsSubmitting(true);

    try {
      const pid = patient?.id || 'pat-001';
      await addInterimNote(pid, {
        note: noteText,
        doctorId: "doc-001",
        patientName: patient?.name
      }).catch(err => console.warn("Interim note backend call warning:", err));

      setNotesList(prev => [
        {
          date: "Just now (Interim Note)",
          author: "Attending Physician",
          type: "Doctor Interim Note",
          summary: noteText,
          vitals: "Documented in chart"
        },
        ...prev
      ]);
      setInterimNote("");
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Calendar className="w-5 h-5 text-cyan-400" />
          <span>Patient Longitudinal Timeline &amp; Clinical History</span>
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Comprehensive historical encounters, interim notes, and disease trajectory over time.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Timeline Events Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-4">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
              Longitudinal Visit Encounters
            </h4>

            <div className="relative pl-4 space-y-6">
              {/* Connecting vertical line */}
              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-800" />

              {notesList.map((entry, idx) => (
                <div key={idx} className="relative pl-4 space-y-1.5">
                  {/* Dot */}
                  <div className="absolute -left-2.5 top-1.5 w-3.5 h-3.5 rounded-full bg-cyan-500 border-2 border-slate-950" />

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-xs text-cyan-300">{entry.date}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                      {entry.type}
                    </span>
                  </div>

                  <div className="text-xs text-slate-200 font-medium">{entry.author}</div>
                  <p className="text-xs text-slate-400 leading-relaxed">{entry.summary}</p>
                  
                  {entry.vitals && (
                    <div className="text-[11px] font-mono text-teal-400 pt-1">
                      Vitals: {entry.vitals}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Add Interim Note */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              <span>Add Interim Physician Note</span>
            </h4>

            <form onSubmit={handleAddNote} className="space-y-3">
              <textarea
                value={interimNote}
                onChange={(e) => setInterimNote(e.target.value)}
                rows={4}
                placeholder="Enter interim clinical observations, phone consultation notes, or patient update..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />

              <button
                type="submit"
                disabled={!interimNote.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs transition-all shadow-glow-cyan"
              >
                Append Note to Patient Record
              </button>
            </form>
          </div>
        </div>

      </div>

    </div>
  );
}
