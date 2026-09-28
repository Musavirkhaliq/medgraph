import React, { useState } from 'react';
import { 
  MessageSquare, 
  Network, 
  FileCheck, 
  FileEdit, 
  Calendar, 
  Activity, 
  FileText,
  Stethoscope
} from 'lucide-react';
import AgentPipelineSidebar from './AgentPipelineSidebar';
import ChatStream from './ChatStream';
import DifferentialMatrix from './DifferentialMatrix';
import DicomLabsViewer from './DicomLabsViewer';
import SoapNotesStudio from './SoapNotesStudio';
import PatientTimeline from './PatientTimeline';
import RightIntelligenceHud from './RightIntelligenceHud';
import { percent, phaseLabel } from '../../utils/clinical';

export default function ConsultationWorkspace({
  patient,
  sessionId,
  currentPhase,
  completionPercentage = 10,
  messages,
  onSendMessage,
  isWaitingAnswer,
  currentQuestion,
  isWaitingTests,
  investigations,
  onSubmitTests,
  onSkipTests,
  onUploadImage,
  onAnalyzeImage,
  isEmergency,
  emergencyInfo,
  triageLevel,
  triageConfidence,
  symptoms,
  differential,
  primaryDiagnosis,
  diagnosisConfidence,
  medications,
  caseSummary,
  followUp,
  monitoring,
  lifestyleModifications,
  agentTelemetry,
  onOpenAgentTelemetry,
  onOpenFinalReport,
  onToggleManualTests,
  language
}) {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'diff' | 'labs' | 'soap' | 'history'

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      
      {/* Workstation Tab Bar */}
      <div className="px-4 sm:px-6 bg-slate-950/80 border-b border-white/10 flex items-center justify-between gap-4 shrink-0 overflow-x-auto">
        <nav className="flex items-center gap-1 py-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'chat'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-glow-cyan'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Clinical Stream &amp; Interactive Q&amp;A</span>
          </button>

          <button
            onClick={() => setActiveTab('diff')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'diff'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-glow-cyan'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>ICD-10 Differential &amp; Knowledge Graph</span>
          </button>

          <button
            onClick={() => setActiveTab('labs')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'labs'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-glow-cyan'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Diagnostic DICOM Imaging &amp; Labs</span>
          </button>

          <button
            onClick={() => setActiveTab('soap')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'soap'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-glow-cyan'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <FileEdit className="w-3.5 h-3.5" />
            <span>Auto SOAP Note &amp; e-Prescriptions</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'history'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-glow-cyan'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Longitudinal Patient Timeline</span>
          </button>
        </nav>

        <button
          onClick={onOpenFinalReport}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-glow-cyan shrink-0"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Generate Final Report</span>
        </button>
      </div>

      {/* 3-Column Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: 9-Agent Pipeline Stepper */}
        <AgentPipelineSidebar
          currentPhase={currentPhase}
          onOpenAgentTelemetry={onOpenAgentTelemetry}
          patient={patient}
        />

        {/* Center: Main Pane */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950/30">
          {activeTab === 'chat' && (
            <ChatStream
              messages={messages}
              onSendMessage={onSendMessage}
              isWaitingAnswer={isWaitingAnswer}
              currentQuestion={currentQuestion}
              isWaitingTests={isWaitingTests}
              investigations={investigations}
              onSubmitTests={onSubmitTests}
              onSkipTests={onSkipTests}
              onUploadImage={onUploadImage}
              isEmergency={isEmergency}
              emergencyInfo={emergencyInfo}
              currentPhase={currentPhase}
              phaseProgress={percent(completionPercentage)}
              phaseText={phaseLabel(currentPhase)}
              onToggleManualTests={onToggleManualTests}
              language={language}
            />
          )}

          {activeTab === 'diff' && (
            <DifferentialMatrix
              primaryDiagnosis={primaryDiagnosis}
              confidence={percent(diagnosisConfidence)}
              differential={differential}
            />
          )}

          {activeTab === 'labs' && (
            <DicomLabsViewer
              sessionId={sessionId}
              investigations={investigations}
              onAnalyzeImage={onAnalyzeImage}
            />
          )}

          {activeTab === 'soap' && (
            <SoapNotesStudio
              patient={patient}
              primaryDiagnosis={primaryDiagnosis}
              diagnosisConfidence={diagnosisConfidence}
              differential={differential}
              medications={medications}
              caseSummary={caseSummary}
              followUp={followUp}
              monitoring={monitoring}
              lifestyleModifications={lifestyleModifications}
            />
          )}

          {activeTab === 'history' && (
            <PatientTimeline
              patient={patient}
            />
          )}
        </main>

        {/* Right: Clinical Intelligence HUD */}
        <RightIntelligenceHud
          triageLevel={triageLevel}
          triageConfidence={triageConfidence}
          symptoms={symptoms}
          tests={investigations}
          differential={differential}
          onGenerateReportClick={onOpenFinalReport}
        />

      </div>

    </div>
  );
}
