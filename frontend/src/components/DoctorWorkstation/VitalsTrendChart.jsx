import React, { useState, useEffect } from 'react';
import { HeartPulse, Plus, Loader2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getPatientVitals, recordPatientVitals } from '../../services/api';

const RISK_BAND_CLASS = {
  high: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  low: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
};

export default function VitalsTrendChart({ patient, sessionId }) {
  const patientId = patient?.id || 'pat-001';
  const [readings, setReadings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    heart_rate: '', resp_rate: '', systolic_bp: '', diastolic_bp: '',
    temperature_c: '', spo2: '', o2_supplemental: false, consciousness_level: 'alert',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadVitals = async () => {
    setIsLoading(true);
    try {
      const res = await getPatientVitals(patientId, 30);
      if (res?.readings) setReadings([...res.readings].reverse());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadVitals(); }, [patientId]);

  const chartData = readings.map((r) => ({
    time: r.recorded_at ? new Date(r.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    heart_rate: r.heart_rate,
    spo2: r.spo2,
    systolic_bp: r.systolic_bp,
    news2_score: r.news2_score,
  }));

  const latest = readings[readings.length - 1];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        heart_rate: form.heart_rate ? Number(form.heart_rate) : null,
        resp_rate: form.resp_rate ? Number(form.resp_rate) : null,
        systolic_bp: form.systolic_bp ? Number(form.systolic_bp) : null,
        diastolic_bp: form.diastolic_bp ? Number(form.diastolic_bp) : null,
        temperature_c: form.temperature_c ? Number(form.temperature_c) : null,
        spo2: form.spo2 ? Number(form.spo2) : null,
        o2_supplemental: form.o2_supplemental,
        consciousness_level: form.consciousness_level,
        session_id: sessionId,
      };
      await recordPatientVitals(patientId, payload);
      await loadVitals();
    } catch (err) {
      setError(err.message || 'Failed to record vitals.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-cyan-400" />
          <span>Longitudinal Vitals &amp; NEWS2 Early Warning</span>
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Tracks vitals over time and computes the NEWS2 deterioration score on every reading.
        </p>
      </div>

      {latest && (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${RISK_BAND_CLASS[latest.news2_risk_band] || 'bg-slate-800 text-slate-400 border-white/10'}`}>
          Latest NEWS2: {latest.news2_score} &bull; {latest.news2_risk_band} risk
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3">
          <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Vitals Trend
          </h4>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-slate-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading vitals history…
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-500 text-xs">
              No vitals recorded yet — add the first reading to start tracking trends.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="heart_rate" name="Heart Rate" stroke="#06b6d4" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="spo2" name="SpO2" stroke="#10b981" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="systolic_bp" name="Systolic BP" stroke="#f59e0b" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="news2_score" name="NEWS2" stroke="#f43f5e" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3">
          <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            Record New Reading
          </h4>
          <form onSubmit={handleSubmit} className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Heart Rate" value={form.heart_rate}
                onChange={(e) => setForm((f) => ({ ...f, heart_rate: e.target.value }))}
                className="px-2.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500" />
              <input type="number" placeholder="Resp Rate" value={form.resp_rate}
                onChange={(e) => setForm((f) => ({ ...f, resp_rate: e.target.value }))}
                className="px-2.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500" />
              <input type="number" placeholder="Systolic BP" value={form.systolic_bp}
                onChange={(e) => setForm((f) => ({ ...f, systolic_bp: e.target.value }))}
                className="px-2.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500" />
              <input type="number" placeholder="Diastolic BP" value={form.diastolic_bp}
                onChange={(e) => setForm((f) => ({ ...f, diastolic_bp: e.target.value }))}
                className="px-2.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500" />
              <input type="number" step="0.1" placeholder="Temp (°C)" value={form.temperature_c}
                onChange={(e) => setForm((f) => ({ ...f, temperature_c: e.target.value }))}
                className="px-2.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500" />
              <input type="number" placeholder="SpO2 %" value={form.spo2}
                onChange={(e) => setForm((f) => ({ ...f, spo2: e.target.value }))}
                className="px-2.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500" />
            </div>
            <select value={form.consciousness_level}
              onChange={(e) => setForm((f) => ({ ...f, consciousness_level: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500">
              <option value="alert">Alert</option>
              <option value="voice">Responds to Voice</option>
              <option value="pain">Responds to Pain</option>
              <option value="unresponsive">Unresponsive</option>
            </select>
            <label className="flex items-center gap-2 text-slate-300">
              <input type="checkbox" checked={form.o2_supplemental}
                onChange={(e) => setForm((f) => ({ ...f, o2_supplemental: e.target.checked }))} />
              On supplemental oxygen
            </label>
            {error && <div className="text-rose-400">{error}</div>}
            <button type="submit" disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold transition-all">
              {isSubmitting ? 'Recording…' : 'Record Vitals & Score NEWS2'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
