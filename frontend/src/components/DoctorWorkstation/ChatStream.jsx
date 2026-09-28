import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Image as ImageIcon, 
  Paperclip, 
  AlertTriangle, 
  CheckCircle2, 
  Bot, 
  User, 
  Sparkles, 
  Clock, 
  FileCheck,
  ChevronRight,
  Loader2
} from 'lucide-react';

const QUICK_CHIPS = [
  "❌ No retrosternal chest pain or radiation reported.",
  "🌙 Symptoms worsen with physical exertion and at night.",
  "🫁 Auscultation reveals bilateral expiratory wheezing.",
  "🌡️ Patient denies fever, chills, or night sweats.",
  "💊 Currently taking Albuterol 90mcg inhaler as needed."
];

export default function ChatStream({
  messages,
  onSendMessage,
  isWaitingAnswer,
  currentQuestion,
  isWaitingTests,
  investigations = [],
  onSubmitTests,
  onSkipTests,
  onUploadImage,
  isEmergency,
  emergencyInfo,
  currentPhase,
  phaseProgress = 10,
  phaseText = "Synthesizing clinical findings...",
  onToggleManualTests,
  language = "en"
}) {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [testResultsText, setTestResultsText] = useState("");
  const [attachedTestImage, setAttachedTestImage] = useState(null);
  const [attachedTestImagePreview, setAttachedTestImagePreview] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const testFileInputRef = useRef(null);
  const timerRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isWaitingAnswer, isWaitingTests]);

  // Voice recording timer simulation / Web Speech API
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setRecordingSeconds(0);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Toggle Voice Dictation
  const toggleVoice = () => {
    if (!isRecording) {
      setIsRecording(true);
      // Browser Speech Recognition if supported
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.lang = language === 'ur' ? 'ur-PK' : language === 'hi' ? 'hi-IN' : 'en-US';
          rec.continuous = false;
          rec.interimResults = false;
          rec.onresult = (evt) => {
            const transcript = evt.results[0][0].transcript;
            setInputText(prev => prev ? `${prev} ${transcript}` : transcript);
            setIsRecording(false);
          };
          rec.onerror = () => setIsRecording(false);
          rec.onend = () => setIsRecording(false);
          rec.start();
        } catch (err) {
          console.warn("Speech recognition error:", err);
        }
      } else {
        // Fallback simulation for environments without Web Speech
        setTimeout(() => {
          setIsRecording(false);
          setInputText(prev => prev ? `${prev} [Dictated Findings]` : "Patient confirms dyspnea worsens with heavy dust exposure.");
        }, 3500);
      }
    } else {
      setIsRecording(false);
    }
  };

  // Format timer seconds
  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950/40">
      
      {/* Emergency Alert Banner */}
      {isEmergency && (
        <div className="p-4 bg-rose-950/70 border-b border-rose-500/50 flex items-start gap-3 text-rose-200">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold text-sm text-rose-300">
              🚨 CRITICAL EMERGENCY DETECTED
            </div>
            <div>{emergencyInfo?.message || "Immediate clinical intervention required. Prioritize emergency airway and vitals stabilization."}</div>
          </div>
        </div>
      )}

      {/* Phase Context Bar */}
      <div className="px-6 py-2.5 bg-slate-900/50 border-b border-white/5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-medium">{phaseText}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-28 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, Math.max(5, phaseProgress))}%` }}
            />
          </div>
          <span className="font-mono text-[11px] text-cyan-400 font-semibold">{phaseProgress}%</span>
        </div>
      </div>

      {/* Chat Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user' || msg.role === 'doctor';
          return (
            <div 
              key={idx} 
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                isUser 
                  ? 'bg-cyan-500 text-slate-950' 
                  : 'bg-slate-800 border border-white/10 text-cyan-400'
              }`}>
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble */}
              <div className={`max-w-xl rounded-2xl p-4 text-xs sm:text-sm leading-relaxed space-y-2 shadow-glass ${
                isUser 
                  ? 'bg-gradient-to-br from-cyan-600/90 to-teal-700/90 text-white rounded-tr-none' 
                  : 'bg-slate-900/90 border border-white/10 text-slate-200 rounded-tl-none'
              }`}>
                {!isUser && msg.agent && (
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/5 text-[10px] text-cyan-400 font-mono">
                    <span className="font-semibold uppercase">{msg.agent}</span>
                    <span className="text-slate-500">{msg.timestamp || 'Just now'}</span>
                  </div>
                )}

                {/* Check if this is an Investigator Agent Test Recommendations Card */}
                {msg.type === 'investigation_prompt' || (msg.agent === 'Investigator Agent' && msg.tests && msg.tests.length > 0) ? (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div className="font-bold text-sm text-cyan-300 flex items-center gap-1.5">
                        <FileCheck className="w-4 h-4 text-cyan-400" />
                        <span>Diagnostic Workup &amp; Imaging Ordered</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold">
                        {msg.tests?.length || 3} Tests
                      </span>
                    </div>

                    <div className="space-y-2">
                      {(msg.tests || []).map((t, tidx) => {
                        const pri = (t.priority || '').toLowerCase();
                        const isUrgent = pri === 'urgent' || pri === 'high';
                        return (
                          <div key={tidx} className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-xs text-white">{t.test_name || t}</span>
                              <span className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                                isUrgent 
                                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' 
                                  : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                              }`}>
                                {t.priority || 'Routine'}
                              </span>
                            </div>
                            {t.indication && (
                              <div className="text-[11px] text-slate-400">
                                Indication: {t.indication}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        <strong>Action Required:</strong> Enter findings or attach radiograph images below. Click <strong>Skip</strong> to proceed without tests.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap font-sans">{msg.text}</div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Diagnostic Tests / Lab Results Wrap when investigator requested */}
      {isWaitingTests && (
        <div className="p-4 bg-slate-900/95 border-t border-cyan-500/40 shadow-glow-cyan space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
              <FileCheck className="w-4 h-4 text-cyan-400" />
              <span>Investigator Agent: Diagnostic Test &amp; Image Submission</span>
            </div>
            <button
              type="button"
              onClick={onSkipTests}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              Skip Tests ⏩
            </button>
          </div>

          {/* Quick insert test chips */}
          {investigations && investigations.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-500 font-medium">Quick Insert:</span>
              {investigations.map((t, idx) => {
                const name = t.test_name || t;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTestResultsText(prev => prev ? `${prev}\n${name}: ` : `${name}: `)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-white/5 text-cyan-300 text-[10px] transition-colors"
                  >
                    + {name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Textarea for results */}
          <textarea
            value={testResultsText}
            onChange={(e) => setTestResultsText(e.target.value)}
            rows={2}
            placeholder="Type or paste laboratory findings / imaging impression (e.g. CXR: bilateral hyperinflation, no pneumothorax. Spirometry: FEV1 64% predicted with +16% reversibility)..."
            className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />

          {/* Action Row: Attach Image + Submit Results + Skip */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={testFileInputRef}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    const file = e.target.files[0];
                    setAttachedTestImage(file);
                    setAttachedTestImagePreview(URL.createObjectURL(file));
                  }
                }}
                accept="image/*,.dcm"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => testFileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-medium text-slate-300 hover:text-white transition-colors"
              >
                <Paperclip className="w-3.5 h-3.5 text-cyan-400" />
                <span>{attachedTestImage ? "Change Image" : "Attach Image / DICOM"}</span>
              </button>

              {attachedTestImage && (
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-cyan-500/30 text-xs text-cyan-300">
                  {attachedTestImagePreview && (
                    <img src={attachedTestImagePreview} alt="Thumb" className="w-5 h-5 rounded object-cover" />
                  )}
                  <span className="truncate max-w-[140px] text-[11px] font-mono">{attachedTestImage.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedTestImage(null);
                      setAttachedTestImagePreview(null);
                    }}
                    className="text-slate-400 hover:text-rose-400 text-xs ml-1"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSkipTests}
                className="px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition-colors"
              >
                Skip ⏩
              </button>

              <button
                type="button"
                onClick={() => {
                  onSubmitTests(testResultsText, attachedTestImage, false);
                  setTestResultsText("");
                  setAttachedTestImage(null);
                  setAttachedTestImagePreview(null);
                }}
                disabled={!testResultsText.trim() && !attachedTestImage}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs transition-all shadow-glow-cyan"
              >
                Submit Results &amp; Continue →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Input Dock */}
      <div className="p-4 border-t border-white/10 bg-slate-950/80 backdrop-blur-md space-y-2.5">
        
        {/* Quick Reply Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
          <span className="text-slate-500 font-semibold shrink-0">Quick Reply:</span>
          {QUICK_CHIPS.map((chip, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInputText(chip)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white shrink-0 transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Recording Waveform HUD */}
        {isRecording && (
          <div className="p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-500/50 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-cyan-300">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span className="font-semibold">Recording ({language.toUpperCase()})...</span>
              <span className="font-mono text-slate-400">{formatTime(recordingSeconds)}</span>
            </div>
            <button
              onClick={() => setIsRecording(false)}
              className="px-2.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] hover:bg-rose-500 hover:text-white transition-colors"
            >
              Stop &amp; Transcribe
            </button>
          </div>
        )}

        {/* Input Bar Form */}
        <form onSubmit={handleSend} className="flex items-center gap-2">
          {/* File attachment */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files?.[0]) {
                onUploadImage(e.target.files[0]);
              }
            }}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-slate-900 border border-white/10 hover:border-cyan-500/40 text-slate-400 hover:text-cyan-400 transition-colors"
            title="Attach Clinical Photo or DICOM Image"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Voice toggle */}
          <button
            type="button"
            onClick={toggleVoice}
            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
              isRecording
                ? 'bg-rose-500 border-rose-400 text-white shadow-glow-rose'
                : 'bg-slate-900 border-white/10 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-400'
            }`}
            title={`Voice Input (${language.toUpperCase()})`}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-cyan-400" />}
            <span className="hidden sm:inline">Voice</span>
          </button>

          {/* Main Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isWaitingAnswer 
                ? "Answer the Questioner Agent's query..." 
                : "Type clinical observation, exam finding, or prompt..."
            }
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 transition-all shadow-glow-cyan"
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

      </div>

    </div>
  );
}
