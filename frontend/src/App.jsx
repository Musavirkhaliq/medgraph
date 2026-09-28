import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import PortalHub from './components/PortalHub';
import PatientDirectory, { DEFAULT_PATIENTS } from './components/DoctorWorkstation/PatientDirectory';
import LanguageSetup from './components/DoctorWorkstation/LanguageSetup';
import ConsultationWorkspace from './components/DoctorWorkstation/ConsultationWorkspace';
import FinalClinicalReport from './components/DoctorWorkstation/FinalClinicalReport';
import PatientDashboard from './components/PatientPortal/PatientDashboard';
import AdminDashboard from './components/AdminPortal/AdminDashboard';
import AuthLoginModal from './components/Modals/AuthLoginModal';
import TelemetryModal from './components/Modals/TelemetryModal';
import ClinicalMemoryModal from './components/Modals/ClinicalMemoryModal';

import { 
  startSession, 
  getSessionState, 
  submitSessionAnswer, 
  submitTestResults, 
  uploadSessionImage, 
  analyzeSessionImage, 
  getFinalReport, 
  translateText 
} from './services/api';

export default function App() {
  // Navigation & Views: 'hub' | 'doctor-directory' | 'doctor-language' | 'doctor-active' | 'doctor-report' | 'patient-portal' | 'admin-dashboard'
  const getInitialView = () => {
    const hash = window.location.hash.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    if (hash.includes('doctor') || path.includes('doctor')) return 'doctor-directory';
    if (hash.includes('patient') || path.includes('patient')) return 'patient-portal';
    if (hash.includes('admin') || path.includes('admin')) return 'admin-dashboard';
    return 'hub';
  };

  const [currentView, setCurrentView] = useState(getInitialView);

  // Sync hash with view
  useEffect(() => {
    if (currentView === 'hub') {
      history.replaceState(null, '', window.location.pathname);
    } else {
      window.location.hash = currentView;
    }
  }, [currentView]);
  
  // Active User session (initially null - requires authentication)
  const [user, setUser] = useState(null);


  // Selected Patient & Parameters
  const [selectedPatient, setSelectedPatient] = useState(DEFAULT_PATIENTS[0]);
  const [selectedLanguage, setSelectedLanguage] = useState("en");

  // Active Session State
  const [sessionId, setSessionId] = useState(null);
  const [currentPhase, setCurrentPhase] = useState("intake");
  const [messages, setMessages] = useState([]);
  const [isWaitingAnswer, setIsWaitingAnswer] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [isWaitingTests, setIsWaitingTests] = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [triageLevel, setTriageLevel] = useState("Urgent");
  const [triageConfidence, setTriageConfidence] = useState(94);
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState("Acute Moderate Asthma Exacerbation (J45.909)");
  const [differential, setDifferential] = useState([]);
  const [medications, setMedications] = useState([]);
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyInfo, setEmergencyInfo] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Modals & Audio
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authDefaultRole, setAuthDefaultRole] = useState('doctor');
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [selectedTelemetryKey, setSelectedTelemetryKey] = useState('intake_agent');
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const pollIntervalRef = useRef(null);
  const lastQuestionRef = useRef(null);
  const isWaitingTestsRef = useRef(false);
  const hasPromptedTestsRef = useRef(false);

  // Web Audio subtle clinical chime
  const playChime = (type = 'message') => {
    if (!soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'alert') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {}
  };

  // Role Portal selection handler from Hub: opens authentication window
  const handleSelectRole = (role) => {
    // If user is already authenticated as that role, transition immediately
    if (user && user.role === role) {
      if (role === 'doctor') setCurrentView('doctor-directory');
      else if (role === 'patient') setCurrentView('patient-portal');
      else if (role === 'admin') setCurrentView('admin-dashboard');
    } else {
      // Otherwise display login modal for that role
      setAuthDefaultRole(role);
      setIsAuthOpen(true);
    }
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setIsAuthOpen(false);
    playChime('message');
    if (userData.role === 'doctor') {
      setCurrentView('doctor-directory');
    } else if (userData.role === 'patient') {
      setCurrentView('patient-portal');
    } else if (userData.role === 'admin') {
      setCurrentView('admin-dashboard');
    }
  };


  // Start Consultation Pipeline
  const handleStartConsultation = async (description, lang) => {
    setIsLoading(true);
    const newSessionId = `web_${Date.now()}`;
    setSessionId(newSessionId);

    // Initial message from doctor
    const initMsg = {
      role: 'doctor',
      text: description,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([initMsg]);
    setCurrentView('doctor-active');

    try {
      let finalDesc = description;
      if (lang !== 'en') {
        finalDesc = await translateText(description, lang, 'en');
      }

      await startSession({
        sessionId: newSessionId,
        patientId: selectedPatient?.id || 'pat-001',
        description: finalDesc,
        language: lang,
        originalDesc: description
      });

      startPolling(newSessionId);
    } catch (err) {
      console.warn("Backend session call failed, entering simulated clinical reasoning mode:", err);
      // Resilient local simulation of the 9-agent pipeline
      simulateLocalPipeline();
    } finally {
      setIsLoading(false);
    }
  };

  // Polling loop for active session
  const startPolling = (sid) => {
    clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const state = await getSessionState(sid);
        if (!state) return;

        if (state.current_phase) setCurrentPhase(state.current_phase);
        if (state.triage_level) setTriageLevel(state.triage_level);
        if (state.triage_confidence) setTriageConfidence(Math.round(state.triage_confidence * 100));
        if (state.primary_diagnosis) setPrimaryDiagnosis(state.primary_diagnosis);
        if (state.differential_diagnosis) setDifferential(state.differential_diagnosis);
        if (state.medications) setMedications(state.medications);
        if (state.investigations) setInvestigations(state.investigations);

        if (state.is_emergency) {
          setIsEmergency(true);
          setEmergencyInfo(state.emergency_info);
          playChime('alert');
          clearInterval(pollIntervalRef.current);
          return;
        }

        // When Questioner Agent has a question for the doctor
        if (state.current_question) {
          if (state.current_question !== lastQuestionRef.current) {
            lastQuestionRef.current = state.current_question;
            setIsWaitingAnswer(true);
            setCurrentQuestion(state.current_question);
            playChime('message');
            setMessages(prev => [
              ...prev,
              {
                role: 'ai',
                agent: 'Questioner Agent',
                text: state.current_question,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]);
          }
          // Stop polling while waiting for human input!
          clearInterval(pollIntervalRef.current);
          return;
        }

        // When Investigator Agent requests diagnostic tests
        const isInvestigatorPhase = state.waiting_for_tests || 
          state.current_phase === "investigation_waiting" || 
          (state.investigations && state.investigations.length > 0 && !hasPromptedTestsRef.current && state.current_phase !== "intake" && state.current_phase !== "triage" && state.current_phase !== "questioning");

        if (isInvestigatorPhase) {
          if (!hasPromptedTestsRef.current) {
            hasPromptedTestsRef.current = true;
            isWaitingTestsRef.current = true;
            setIsWaitingTests(true);

            const tests = (state.investigations && state.investigations.length > 0)
              ? state.investigations
              : [
                  { test_name: "Posteroanterior Chest Radiograph (CXR)", priority: "Urgent", indication: "Assess bilateral hyperinflation and rule out pneumothorax or focal infiltrate" },
                  { test_name: "Bedside Spirometry (FEV1 / FVC)", priority: "High", indication: "Assess reversible airflow limitation and post-bronchodilator response" },
                  { test_name: "Complete Blood Count (CBC) with Diff", priority: "Routine", indication: "Evaluate peripheral blood eosinophils" }
                ];
            setInvestigations(tests);
            playChime('message');
            setMessages(prev => [
              ...prev,
              {
                role: 'ai',
                agent: 'Investigator Agent',
                type: 'investigation_prompt',
                tests: tests,
                text: `🔬 Diagnostic Investigations Recommended:\nBased on the clinical case and presentation, the Investigator Agent recommends ${tests.length} diagnostic tests and imaging. Please enter findings or attach radiographs/reports below, or click Skip to continue.`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]);
          }
          clearInterval(pollIntervalRef.current);
          return;
        }

        if (state.completed_at || state.current_phase === "complete") {
          clearInterval(pollIntervalRef.current);
          setCurrentPhase("complete");
          const rep = await getFinalReport(sid).catch(() => null);
          if (rep) setReportData(rep);
        }
      } catch (e) {
        // Continue polling
      }
    }, 2000);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => clearInterval(pollIntervalRef.current);
  }, []);

  // Resilient Local Pipeline Simulation if backend is starting up or in standalone UI demo
  const simulateLocalPipeline = () => {
    setTimeout(() => {
      setCurrentPhase("triage");
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          agent: 'Triage Agent',
          text: "Triage complete: Patient categorized as Urgent (ESI Level 3). Stable airway and hemodynamics, but significant respiratory effort noted. Initiating clinical history expansion.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      playChime('message');
    }, 1500);

    setTimeout(() => {
      setCurrentPhase("questioning");
      setIsWaitingAnswer(true);
      setCurrentQuestion("Does the shortness of breath worsen with cold air or chemical fumes, and do you experience audible wheezing at night?");
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          agent: 'Questioner Agent',
          text: "Does the shortness of breath worsen with cold air or chemical fumes, and do you experience audible wheezing at night?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      playChime('message');
    }, 3200);
  };

  // Doctor sends message / answers question
  const handleSendMessage = async (text) => {
    const userMsg = {
      role: 'doctor',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsg]);
    setIsWaitingAnswer(false);
    setCurrentQuestion("");

    if (sessionId) {
      try {
        await submitSessionAnswer(sessionId, text);
        // Resume polling for next graph node or question
        startPolling(sessionId);
        return;
      } catch (err) {
        console.warn("API answer failed, advancing local simulation:", err);
      }
    }

    // Advance pipeline simulation only when running offline / standalone demo
    setTimeout(() => {
      setCurrentPhase("case_building");
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          agent: 'Case Builder',
          text: "Clinical evidence integrated. Primary findings indicate reversible lower airway obstruction triggered by occupational dust exposure. Formulating diagnostic orders and differential matrix.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      playChime('message');
    }, 1800);

    setTimeout(() => {
      setCurrentPhase("investigation_waiting");
      setIsWaitingTests(true);
      isWaitingTestsRef.current = true;
      setInvestigations([
        { test_name: "Posteroanterior Chest Radiograph (CXR)", reason: "Rule out pneumothorax and infiltrate" },
        { test_name: "Pre/Post Bronchodilator Spirometry", reason: "Confirm FEV1 reversibility" }
      ]);
      playChime('message');
    }, 3600);
  };

  // Submit Test Results or Upload Images
  const handleSubmitTests = async (resultsText, imageFile = null, skipped = false) => {
    setIsWaitingTests(false);
    isWaitingTestsRef.current = false;
    hasPromptedTestsRef.current = true;

    const displayText = skipped
      ? "Diagnostic investigations deferred by attending physician. Proceeding directly to differential diagnosis."
      : `Diagnostic Results Submitted: ${resultsText || "Clinical findings provided."}${imageFile ? ` [Attached: ${imageFile.name}]` : ""}`;

    setMessages(prev => [
      ...prev,
      {
        role: 'doctor',
        text: displayText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    if (sessionId) {
      try {
        if (imageFile) {
          await uploadSessionImage(sessionId, imageFile).catch(() => null);
        }
        await submitTestResults(sessionId, { results: skipped ? "" : resultsText, skipped });
        startPolling(sessionId);
        return;
      } catch (e) {
        console.warn("API submit tests failed, advancing local simulation:", e);
      }
    }

    setTimeout(() => {
      setCurrentPhase("diagnosis");
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          agent: 'Diagnostician Agent',
          text: "Differential diagnosis synthesized. Primary Diagnosis: Acute Asthma Exacerbation (ICD-10 J45.909) with 92% confidence. Community Acquired Pneumonia considered secondary (42%). Transferring to Treatment Agent.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      playChime('message');
    }, 2000);

    setTimeout(() => {
      setCurrentPhase("treatment");
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          agent: 'Treatment & Validator Agents',
          text: "Therapeutic regimen formulated: Inhaled Albuterol HFA, oral Prednisone 5-day burst, and Advair maintenance. Validator Agent confirms ZERO cross-reactivity with documented Penicillin allergy. Complete assessment report generated.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setCurrentPhase("complete");
      playChime('alert');
    }, 4200);
  };

  const handleSkipTests = () => {
    handleSubmitTests("", null, true);
  };

  const handleUploadImage = async (file) => {
    if (sessionId) {
      try {
        await uploadSessionImage(sessionId, file);
      } catch (e) {}
    }
    setMessages(prev => [
      ...prev,
      {
        role: 'doctor',
        text: `📎 Attached Clinical Radiograph: ${file.name}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const handleAnalyzeImage = async (file) => {
    if (sessionId) {
      return await analyzeSessionImage(sessionId, file);
    }
    return null;
  };

  const handleResetSession = () => {
    clearInterval(pollIntervalRef.current);
    lastQuestionRef.current = null;
    isWaitingTestsRef.current = false;
    hasPromptedTestsRef.current = false;
    setSessionId(null);
    setCurrentPhase("intake");
    setMessages([]);
    setIsWaitingAnswer(false);
    setCurrentQuestion("");
    setIsWaitingTests(false);
    setCurrentView('doctor-directory');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950">
      
      {/* Universal Top Navigation */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        user={user}
        onLogout={() => {
          setUser(null);
          setCurrentView('hub');
        }}
        onOpenAuth={(role = 'doctor') => {
          setAuthDefaultRole(role);
          setIsAuthOpen(true);
        }}
        activePatient={currentView.startsWith('doctor') ? selectedPatient : null}

        onOpenTelemetry={() => {
          setSelectedTelemetryKey('intake_agent');
          setIsTelemetryOpen(true);
        }}
        onOpenMemory={() => setIsMemoryOpen(true)}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        onResetSession={handleResetSession}
        activeSessionId={sessionId}
        aiStatus={currentPhase === 'complete' ? 'Completed' : 'Reasoning Active'}
      />

      {/* Main View Router */}
      <div className="flex-1 flex flex-col">
        {currentView === 'hub' && (
          <PortalHub
            onSelectRole={handleSelectRole}
            onOpenAuth={(role) => {
              setAuthDefaultRole(role);
              setIsAuthOpen(true);
            }}
          />
        )}

        {currentView === 'doctor-directory' && (
          <PatientDirectory
            onSelectPatient={(pat) => {
              setSelectedPatient(pat);
              setCurrentView('doctor-language');
            }}
            onRegisterNewClick={() => {
              setCurrentView('admin-dashboard');
            }}
          />
        )}

        {currentView === 'doctor-language' && (
          <LanguageSetup
            patient={selectedPatient}
            selectedLanguage={selectedLanguage}
            setSelectedLanguage={setSelectedLanguage}
            onBack={() => setCurrentView('doctor-directory')}
            onStartConsultation={handleStartConsultation}
            isLoading={isLoading}
          />
        )}

        {currentView === 'doctor-active' && (
          <ConsultationWorkspace
            patient={selectedPatient}
            sessionId={sessionId}
            currentPhase={currentPhase}
            messages={messages}
            onSendMessage={handleSendMessage}
            isWaitingAnswer={isWaitingAnswer}
            currentQuestion={currentQuestion}
            isWaitingTests={isWaitingTests}
            investigations={investigations}
            onSubmitTests={handleSubmitTests}
            onSkipTests={handleSkipTests}
            onUploadImage={handleUploadImage}
            onAnalyzeImage={handleAnalyzeImage}
            isEmergency={isEmergency}
            emergencyInfo={emergencyInfo}
            triageLevel={triageLevel}
            triageConfidence={triageConfidence}
            differential={differential}
            primaryDiagnosis={primaryDiagnosis}
            medications={medications}
            onOpenAgentTelemetry={(key = 'intake_agent') => {
              setSelectedTelemetryKey(key);
              setIsTelemetryOpen(true);
            }}
            onOpenFinalReport={() => setCurrentView('doctor-report')}
            onToggleManualTests={() => setIsWaitingTests(prev => !prev)}
            language={selectedLanguage}
          />
        )}

        {currentView === 'doctor-report' && (
          <FinalClinicalReport
            patient={selectedPatient}
            reportData={reportData}
            onNewConsultation={handleResetSession}
          />
        )}

        {currentView === 'patient-portal' && (
          <PatientDashboard
            onBackToHub={() => setCurrentView('hub')}
          />
        )}

        {currentView === 'admin-dashboard' && (
          <AdminDashboard
            onBackToHub={() => setCurrentView('hub')}
          />
        )}
      </div>

      {/* Global Modals */}
      <AuthLoginModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        defaultRole={authDefaultRole}
        onLoginSuccess={handleLoginSuccess}
      />


      <TelemetryModal
        isOpen={isTelemetryOpen}
        onClose={() => setIsTelemetryOpen(false)}
        selectedAgentKey={selectedTelemetryKey}
      />

      <ClinicalMemoryModal
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        patient={selectedPatient}
      />

    </div>
  );
}
