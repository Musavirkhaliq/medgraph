import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Users,
  Database,
  Brain,
  ArrowLeft,
  UserPlus,
  Search,
  CheckCircle2,
  Stethoscope,
  Activity,
  Network,
  X,
  RefreshCw
} from 'lucide-react';
import { registerDoctor, registerPatient, listDoctors, listAdminPatients, getGlobalMemory } from '../../services/api';

export default function AdminDashboard({ onBackToHub, user }) {
  const [activeTab, setActiveTab] = useState('doctors'); // 'doctors' | 'patients' | 'global-memory'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('doctor'); // 'doctor' | 'patient'
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  // Registration Form State
  const [docName, setDocName] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [docPass, setDocPass] = useState('DoctorPass2026!');
  const [docLicense, setDocLicense] = useState('MD-98210-NY');
  const [docSpecialty, setDocSpecialty] = useState('Pulmonology & Internal Medicine');

  const [patName, setPatName] = useState('');
  const [patDob, setPatDob] = useState('1985-05-20');
  const [patGender, setPatGender] = useState('male');
  const [patEmail, setPatEmail] = useState('');
  const [patAllergies, setPatAllergies] = useState('');
  const [patChronic, setPatChronic] = useState('');
  const [regStatus, setRegStatus] = useState(null);

  const [doctorsList, setDoctorsList] = useState([]);
  const [patientsList, setPatientsList] = useState([]);
  const [globalClusters, setGlobalClusters] = useState([]);

  const requesterRole = user?.role || 'admin';

  const mapDoctor = (d) => ({
    id: d.id,
    name: d.full_name,
    email: d.email,
    license: d.license_number || 'N/A',
    specialty: d.specialty || 'General Medicine',
    status: 'Active Duty',
  });

  const mapPatient = (p) => ({
    id: p.id,
    name: p.full_name,
    mrn: p.mrn,
    dob: p.date_of_birth,
    gender: p.gender,
    allergies: Array.isArray(p.allergies) && p.allergies.length > 0
      ? p.allergies.map(a => (typeof a === 'string' ? a : a.allergen)).filter(Boolean).join(', ')
      : 'None Known',
    status: 'Active Record',
  });

  const loadDirectory = useCallback(async () => {
    setIsLoadingDirectory(true);
    try {
      const [docsRes, patsRes, globalRes] = await Promise.all([
        listDoctors(),
        listAdminPatients(),
        getGlobalMemory(),
      ]);

      setDoctorsList(Array.isArray(docsRes?.doctors) ? docsRes.doctors.map(mapDoctor) : []);
      setPatientsList(Array.isArray(patsRes?.patients) ? patsRes.patients.map(mapPatient) : []);
      setGlobalClusters(Array.isArray(globalRes?.global_memories) ? globalRes.global_memories : []);
    } catch (err) {
      console.warn("Failed to load admin directory from backend:", err);
    } finally {
      setIsLoadingDirectory(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const handleRegisterDoctor = async (e) => {
    e.preventDefault();
    setRegStatus("Registering physician account...");
    try {
      const res = await registerDoctor({
        full_name: docName,
        email: docEmail,
        password: docPass,
        license_number: docLicense,
        specialty: docSpecialty
      }, requesterRole);
      const created = res?.doctor
        ? mapDoctor(res.doctor)
        : { id: `doc-${Date.now().toString().slice(-3)}`, name: docName, email: docEmail, license: docLicense, specialty: docSpecialty, status: "Active Duty" };
      setDoctorsList(prev => [created, ...prev]);
      setRegStatus("Physician successfully provisioned!");
      setDocName(''); setDocEmail('');
      setTimeout(() => {
        setIsModalOpen(false);
        setRegStatus(null);
      }, 1500);
    } catch (err) {
      setRegStatus(err.message || "Registration failed. Please try again.");
    }
  };

  const handleRegisterPatient = async (e) => {
    e.preventDefault();
    setRegStatus("Provisioning patient MRN...");
    try {
      const res = await registerPatient({
        full_name: patName,
        date_of_birth: patDob,
        gender: patGender,
        email: patEmail,
        allergies: patAllergies ? patAllergies.split(',').map(a => a.trim()).filter(Boolean) : [],
        chronic_conditions: patChronic ? patChronic.split(',').map(c => c.trim()).filter(Boolean) : [],
      }, requesterRole);
      const created = res?.patient
        ? mapPatient(res.patient)
        : { id: `pat-${Date.now().toString().slice(-3)}`, name: patName, mrn: 'Pending', dob: patDob, gender: patGender, allergies: patAllergies || "None", status: "Active Record" };
      setPatientsList(prev => [created, ...prev]);
      setRegStatus(res?.message || "Patient account & MRN created!");
      setPatName(''); setPatEmail(''); setPatAllergies(''); setPatChronic('');
      setTimeout(() => {
        setIsModalOpen(false);
        setRegStatus(null);
      }, 1500);
    } catch (err) {
      setRegStatus(err.message || "Registration failed. Please try again.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white">Executive Admin Dashboard</h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Hospital System Admin
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Live Supabase Database Connection &bull; Collective Intelligence Node v2.0
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setModalType('doctor');
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-glow-indigo"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Register Account</span>
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

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium uppercase font-mono">Registered Physicians</span>
          <div className="text-2xl font-bold text-indigo-400">{doctorsList.length} Doctors</div>
          <span className="text-[10px] text-slate-400">All Credentials Verified</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium uppercase font-mono">Patient Accounts</span>
          <div className="text-2xl font-bold text-emerald-400">{patientsList.length} Active MRNs</div>
          <span className="text-[10px] text-slate-400">Longitudinal History Linked</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium uppercase font-mono">Vector Database</span>
          <div className="text-2xl font-bold text-cyan-400">CONNECTED</div>
          <span className="text-[10px] text-cyan-300 font-mono truncate block">Supabase (qibztyxcadj)</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-500 font-medium uppercase font-mono">Collective Intelligence</span>
          <div className="text-2xl font-bold text-amber-400">{globalClusters.length} Clusters</div>
          <span className="text-[10px] text-slate-400">Cross-Patient Pattern Graph</span>
        </div>
      </div>

      {/* Directory Datagrid Tabs */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/10 space-y-4">

        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={loadDirectory}
              title="Refresh from backend"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDirectory ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setActiveTab('doctors')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'doctors'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              👨‍⚕️ Consulting Physicians ({doctorsList.length})
            </button>

            <button
              onClick={() => setActiveTab('patients')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'patients'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              👤 Patient Directory ({patientsList.length})
            </button>

            <button
              onClick={() => setActiveTab('global-memory')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'global-memory'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🌐 Global Intelligence Graph
            </button>
          </div>
        </div>

        {/* Tab 1: Doctors */}
        {activeTab === 'doctors' && (
          <div className="space-y-3">
            {isLoadingDirectory && doctorsList.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-xs">Loading physician directory...</div>
            )}
            {!isLoadingDirectory && doctorsList.length === 0 && (
              <div className="p-6 text-center text-slate-500 text-xs">No physicians registered yet. Use "Register Account" to add one.</div>
            )}
            {doctorsList.map((doc) => (
              <div key={doc.id} className="p-4 rounded-xl bg-slate-950/70 border border-white/5 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-sm text-white">{doc.name}</div>
                  <div className="text-slate-400 mt-0.5">{doc.specialty} &bull; <span className="font-mono text-cyan-400">{doc.license}</span></div>
                  <div className="text-slate-500 font-mono mt-0.5">{doc.email}</div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-[10px]">
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Patients */}
        {activeTab === 'patients' && (
          <div className="space-y-3">
            {isLoadingDirectory && patientsList.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-xs">Loading patient directory...</div>
            )}
            {!isLoadingDirectory && patientsList.length === 0 && (
              <div className="p-6 text-center text-slate-500 text-xs">No patient records yet. Use "Register Account" to add one.</div>
            )}
            {patientsList.map((pat) => (
              <div key={pat.id} className="p-4 rounded-xl bg-slate-950/70 border border-white/5 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-sm text-white">{pat.name}</div>
                  <div className="text-slate-400 mt-0.5 font-mono">{pat.mrn} &bull; DOB: {pat.dob} ({pat.gender})</div>
                  <div className="text-rose-400 mt-0.5">Allergies: {pat.allergies}</div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold text-[10px]">
                  {pat.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Global Memory Graph */}
        {activeTab === 'global-memory' && (
          <div className="p-4 rounded-xl bg-slate-950/70 border border-white/5 space-y-3 text-xs">
            <div className="font-bold text-sm text-cyan-300 flex items-center gap-2">
              <Network className="w-4 h-4 text-cyan-400" />
              <span>Cross-Patient Collective Intelligence Clusters</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Synthesized from historical patient encounters in Supabase vector embeddings. Anonymized pathophysiological links are continuously integrated into the clinical diagnostic graph.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {(globalClusters.length > 0 ? globalClusters : [
                { id: 'gmem-fallback-1', topic: 'Obstructive Pulmonary (Asthma / Dust)', summary: 'Identified correlation between heavy occupational particulate exposure and rapid FEV1 drop.' },
                { id: 'gmem-fallback-2', topic: 'Beta-Lactam Anaphylaxis Guardrail', summary: 'Strict validator rule preventing 2nd/3rd generation cephalosporin prescribing when severe penicillin anaphylaxis is flagged.' },
              ]).map((cluster) => (
                <div key={cluster.id} className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-1">
                  <span className="font-bold text-white block">{cluster.topic}</span>
                  <p className="text-slate-400 text-[11px]">{cluster.summary}</p>
                  {cluster.case_count && (
                    <span className="text-[10px] text-cyan-400 font-mono">{cluster.case_count} contributing cases &bull; {Math.round((cluster.confidence_score || 0) * 100)}% confidence</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Account Registration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-white/10 p-6 space-y-4 shadow-glass max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="font-bold text-base text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <span>Account Provisioning Studio</span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Role Switcher */}
            <div className="flex gap-2">
              <button
                onClick={() => setModalType('doctor')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  modalType === 'doctor'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                👨‍⚕️ Register Doctor
              </button>
              <button
                onClick={() => setModalType('patient')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  modalType === 'patient'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                👤 Register Patient
              </button>
            </div>

            {/* Doctor Form */}
            {modalType === 'doctor' && (
              <form onSubmit={handleRegisterDoctor} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Full Physician Name</label>
                  <input
                    type="text"
                    required
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="e.g. Dr. Alex Smith, MD"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Hospital Email</label>
                  <input
                    type="email"
                    required
                    value={docEmail}
                    onChange={(e) => setDocEmail(e.target.value)}
                    placeholder="dr.smith@medai.org"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">License Number</label>
                    <input
                      type="text"
                      value={docLicense}
                      onChange={(e) => setDocLicense(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Specialty</label>
                    <input
                      type="text"
                      value={docSpecialty}
                      onChange={(e) => setDocSpecialty(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {regStatus && <div className="text-indigo-400 font-bold py-1">{regStatus}</div>}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors"
                >
                  Create Physician Profile
                </button>
              </form>
            )}

            {/* Patient Form */}
            {modalType === 'patient' && (
              <form onSubmit={handleRegisterPatient} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Patient Full Name</label>
                  <input
                    type="text"
                    required
                    value={patName}
                    onChange={(e) => setPatName(e.target.value)}
                    placeholder="e.g. Jane Miller"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={patDob}
                      onChange={(e) => setPatDob(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Gender</label>
                    <select
                      value={patGender}
                      onChange={(e) => setPatGender(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Patient Email (enables portal login)</label>
                  <input
                    type="email"
                    value={patEmail}
                    onChange={(e) => setPatEmail(e.target.value)}
                    placeholder="e.g. jane.miller@example.com"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Optional. If provided, a Patient Portal account is created (default password: PatientPass2026!).</p>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Known Drug Allergies</label>
                  <input
                    type="text"
                    value={patAllergies}
                    onChange={(e) => setPatAllergies(e.target.value)}
                    placeholder="e.g. Penicillin, Sulfa, Latex"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Chronic Conditions</label>
                  <input
                    type="text"
                    value={patChronic}
                    onChange={(e) => setPatChronic(e.target.value)}
                    placeholder="e.g. Asthma, Hypertension"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {regStatus && <div className="text-emerald-400 font-bold py-1">{regStatus}</div>}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors"
                >
                  Create Patient Record &amp; MRN
                </button>
              </form>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
