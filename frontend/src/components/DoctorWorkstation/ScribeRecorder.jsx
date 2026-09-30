import React, { useRef, useState } from 'react';
import { Mic, Square, Loader2, Sparkles } from 'lucide-react';
import { uploadScribeAudio, generateScribeNote } from '../../services/api';

const CHUNK_MS = 12000; // record in short, independently-decodable segments

export default function ScribeRecorder({ sessionId, transcript, onTranscriptAppend, onSoapGenerated }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingChunk, setIsUploadingChunk] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const stopRequestedRef = useRef(false);
  const restartTimeoutRef = useRef(null);

  const uploadChunk = async (blob) => {
    if (!sessionId || blob.size === 0) return;
    setIsUploadingChunk(true);
    try {
      const result = await uploadScribeAudio(sessionId, blob, `chunk_${Date.now()}.webm`);
      if (result?.text) {
        onTranscriptAppend?.(result.text);
      }
    } catch (err) {
      console.warn('Scribe chunk upload failed:', err);
    } finally {
      setIsUploadingChunk(false);
    }
  };

  const recordOneChunk = () => {
    if (!streamRef.current || stopRequestedRef.current) return;
    const recorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' });
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      uploadChunk(blob);
      if (!stopRequestedRef.current) {
        restartTimeoutRef.current = setTimeout(recordOneChunk, 50);
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    setTimeout(() => {
      if (recorderRef.current === recorder && recorder.state === 'recording') {
        recorder.stop();
      }
    }, CHUNK_MS);
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stopRequestedRef.current = false;
      setIsRecording(true);
      recordOneChunk();
    } catch (err) {
      setError('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    stopRequestedRef.current = true;
    clearTimeout(restartTimeoutRef.current);
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
  };

  const handleGenerate = async () => {
    if (!sessionId) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateScribeNote(sessionId);
      onSoapGenerated?.(result.scribe_note);
    } catch (err) {
      setError(err.message || 'Failed to generate SOAP note.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isRecording ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-cyan-500/10 text-cyan-400'}`}>
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Ambient Clinical Scribe</div>
            <div className="text-[11px] text-slate-400">
              {isRecording ? 'Recording consultation…' : 'Record the consultation to auto-generate a SOAP note.'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={!sessionId}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-40"
            >
              <Mic className="w-3.5 h-3.5" />
              Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition-all"
            >
              <Square className="w-3.5 h-3.5" />
              Stop Recording
            </button>
          )}

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !transcript}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all disabled:opacity-40"
          >
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate SOAP Note
          </button>
        </div>
      </div>

      {isUploadingChunk && (
        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Transcribing latest segment…
        </div>
      )}
      {error && <div className="text-[11px] text-rose-400">{error}</div>}

      {transcript && (
        <div className="max-h-32 overflow-y-auto p-3 rounded-xl bg-slate-950/70 border border-white/5 text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
          {transcript}
        </div>
      )}
    </div>
  );
}
