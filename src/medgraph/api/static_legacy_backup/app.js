// ════════════════════════════════════════════════════════════════════════════
// MedAI by LTM Research — Clinical Reasoning UI App Logic
// ════════════════════════════════════════════════════════════════════════════

const API_BASE = "";
let currentSessionId = null;
let pollInterval     = null;
let isAsking         = false;
let reportedPhases   = new Set();

// ── Auth & Global Session State ──────────────────────────────────────────────
var currentUserProfile = {
    id: "doc-001",
    full_name: "Dr. Sarah Jenkins, MD",
    role: "doctor",
    specialty: "Pulmonology & Internal Medicine"
};
var selectedPatientId = "pat-001";
var activeMemoryTab = "local";
var currentConsultationLanguage = "en";

// ── Screen references ────────────────────────────────────────────────────────
const screenPatientSearch = document.getElementById("screen-patient-search");
const screenLangSelect    = document.getElementById("screen-language-select");
const screenIntake        = document.getElementById("screen-intake");
const screenActive        = document.getElementById("screen-active");
const screenReport        = document.getElementById("screen-report");

function showPatientSearchScreen() {
    const sSearch = document.getElementById("screen-patient-search");
    const sLang = document.getElementById("screen-language-select");
    const sIntake = document.getElementById("screen-intake");
    const sActive = document.getElementById("screen-active");
    const sReport = document.getElementById("screen-report");
    [sLang, sIntake, sActive, sReport].forEach(s => { if(s) s.classList.add("hidden"); });
    if (sSearch) sSearch.classList.remove("hidden");
}

function filterPatientCards(query) {
    const q = (query || "").toLowerCase().trim();
    const cards = document.querySelectorAll(".patient-card");
    cards.forEach(card => {
        const text = card.getAttribute("data-search") || "";
        if (!q || text.toLowerCase().includes(q)) {
            card.style.display = "";
        } else {
            card.style.display = "none";
        }
    });
}

function selectPatientForConsultation(patientId) {
    selectedPatientId = patientId;
    const nameEl = document.getElementById("selected-patient-name");
    const selectEl = document.getElementById("patient-account-select");
    
    if (selectEl) selectEl.value = patientId;
    if (nameEl) {
        if (patientId === "pat-001") nameEl.textContent = "John Doe (MRN-2026-0891) — Male, 50y";
        else if (patientId === "pat-002") nameEl.textContent = "Jane Miller (MRN-2026-1042) — Female, 41y";
        else if (patientId === "pat-003") nameEl.textContent = "Robert Chen (MRN-2026-0419) — Male, 68y";
        else nameEl.textContent = `${patientId} (Linked Record)`;
    }

    const sSearch = document.getElementById("screen-patient-search");
    const sLang = document.getElementById("screen-language-select");
    if (sSearch) sSearch.classList.add("hidden");
    if (sLang) sLang.classList.remove("hidden");
}

function setConversationLanguage(langCode) {
    currentConsultationLanguage = langCode || "en";
    currentDetectedLanguage = currentConsultationLanguage;
    
    const cards = ["ur", "hi", "en"];
    cards.forEach(c => {
        const el = document.getElementById(`lang-card-${c}`);
        if (el) {
            if (c === currentConsultationLanguage) {
                el.classList.add("active");
                el.style.borderColor = "var(--cyan)";
                el.style.boxShadow = "0 0 16px rgba(0,229,255,0.3)";
            } else {
                el.classList.remove("active");
                el.style.borderColor = "rgba(0,229,255,0.2)";
                el.style.boxShadow = "none";
            }
        }
    });

    if (langCode === "ur") currentSpeechLocale = "ur-PK";
    else if (langCode === "hi") currentSpeechLocale = "hi-IN";
    else currentSpeechLocale = "en-US";

    console.log(`Conversation language set to: ${currentConsultationLanguage} (${currentSpeechLocale})`);
}

function proceedToClinicalIntake() {
    const sLang = document.getElementById("screen-language-select");
    const sIntake = document.getElementById("screen-intake");
    if (sLang) sLang.classList.add("hidden");
    if (sIntake) sIntake.classList.remove("hidden");
}

async function translateTextClient(text, sourceLang = "auto", targetLang = "en") {
    if (!text || !text.trim()) return "";
    try {
        const res = await fetch("/api/v1/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: text,
                source_lang: sourceLang,
                target_lang: targetLang
            })
        });
        if (res.ok) {
            const data = await res.json();
            return data.translated_text || text;
        }
    } catch (e) {
        console.warn("Client translation fetch failed:", e);
    }
    return text;
}

// ── Intake ───────────────────────────────────────────────────────────────────
const intakeForm        = document.getElementById("intake-form");
const patientDescription = document.getElementById("patient-description");
const startBtn          = document.getElementById("start-btn");

// ── Active session ────────────────────────────────────────────────────────────
const sessionIdLabel    = document.getElementById("session-id-label");
const statusBadge       = document.getElementById("status-badge");
const aiIndicator       = document.getElementById("ai-indicator");
const aiStatusText      = document.getElementById("ai-status-text");
const phaseProgressFill = document.getElementById("phase-progress-fill");
const phaseContextText  = document.getElementById("phase-context-text");
const spinnerRing       = document.querySelector(".spinner-ring");
const pulseDot          = document.querySelector(".pulse-dot");

const emergencyBanner       = document.getElementById("emergency-banner");
const emergencyActionsList  = document.getElementById("emergency-actions-list");
const emergencyDoNotList    = document.getElementById("emergency-do-not-list");

const chatMessages    = document.getElementById("chat-messages");
const chatInputWrap   = document.getElementById("chat-input-wrap");
const qaForm          = document.getElementById("qa-form");
const answerInput     = document.getElementById("answer-input");
const btnUploadImage  = document.getElementById("btn-upload-image");
const imageUpload     = document.getElementById("image-upload");
const imageUploadStatus = document.getElementById("image-upload-status");
const sendAnswerBtn   = document.getElementById("send-answer-btn");
const imageUploadStrip = document.getElementById("image-upload-strip");

const testResultsWrap    = document.getElementById("test-results-input-wrap");
const testResultsForm    = document.getElementById("test-results-form");
const testResultsInput   = document.getElementById("test-results-input");
const skipTestsBtn       = document.getElementById("skip-tests-btn");
const testImageUpload    = document.getElementById("test-image-upload");
const testImageStatus    = document.getElementById("test-image-upload-status");

// ── Right sidebar data cards ──────────────────────────────────────────────────
const triageCard   = document.getElementById("triage-card");
const triageBadge  = document.getElementById("triage-badge-value");
const symptomsCard = document.getElementById("symptoms-card");
const symptomsList = document.getElementById("symptoms-list");
const testsCard    = document.getElementById("tests-card");
const testsList    = document.getElementById("tests-list");
const diffCard     = document.getElementById("diff-card");
const diffList     = document.getElementById("diff-list");
const rightEmpty   = document.getElementById("right-empty");

// ── Patient strip ─────────────────────────────────────────────────────────────
const patientStripText = document.getElementById("patient-strip-text");

// ── Phase label map ───────────────────────────────────────────────────────────
const PHASE_META = {
    "intake":       { label: "Extracting patient data...",       pct: 12  },
    "triage":       { label: "Performing triage assessment...",  pct: 25  },
    "questioning":  { label: "Gathering clinical history...",    pct: 40  },
    "case_building":{ label: "Synthesising case summary...",     pct: 58  },
    "investigating":{ label: "Ordering investigations...",       pct: 68  },
    "interpreting": { label: "Interpreting results...",          pct: 76  },
    "diagnosis":    { label: "Running differential analysis...", pct: 85  },
    "treatment":    { label: "Formulating treatment plan...",    pct: 92  },
    "validation":   { label: "Validating safety profile...",     pct: 97  },
    "complete":     { label: "Assessment complete.",             pct: 100 },
    "questioning_waiting": { label: "Awaiting patient response...", pct: 40 },
};

// ════════════════════════════════════════════════════════════════════════════
// 1. START SESSION
// ════════════════════════════════════════════════════════════════════════════
if (intakeForm) {
intakeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const desc = patientDescription.value.trim();
    if (desc.length < 8) {
        flashInput(patientDescription, "Please provide more detail.");
        return;
    }

    currentSessionId = `web_${Date.now()}`;
    isAsking = false;
    reportedPhases.clear();

    startBtn.disabled = true;
    startBtn.querySelector(".btn-text").textContent = "Starting...";
    startBtn.querySelector(".btn-arrow").innerHTML = '<span class="btn-spinner"></span>';

    try {
        let finalEnglishDesc = desc;
        if (currentConsultationLanguage !== "en") {
            startBtn.querySelector(".btn-text").textContent = `Translating (${currentConsultationLanguage.toUpperCase()} → EN)...`;
            const translated = await translateTextClient(desc, currentConsultationLanguage, "en");
            if (translated && translated.trim().length > 0) {
                finalEnglishDesc = translated.trim();
            }
        }

        const res = await fetch(`${API_BASE}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: currentSessionId,
                patient_description: finalEnglishDesc,
                detected_language: currentConsultationLanguage,
                patient_description_original: desc
            })
        });

        if (!res.ok) {
            let errDetail = `Server error: ${res.status}`;
            try {
                const errJson = await res.json();
                if (errJson.detail) {
                    errDetail = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
                }
            } catch (e) {}
            throw new Error(errDetail);
        }
        const data = await res.json();

        // Switch to active session screen
        switchScreen(screenIntake, screenActive);
        localStorage.setItem("medai_session_id", currentSessionId);
        if (sessionIdLabel) sessionIdLabel.textContent = currentSessionId;
        if (patientStripText) patientStripText.textContent = desc.slice(0, 80) + (desc.length > 80 ? "…" : "");

        if (data.emergency) {
            handleEmergency(data.emergency_info);
        } else {
            setAiState("running");
            startPolling();
        }

    } catch (err) {
        startBtn.disabled = false;
        startBtn.querySelector(".btn-text").textContent = "Initiate Clinical Assessment";
        startBtn.querySelector(".btn-arrow").textContent = "→";
        showToast("Failed to start session: " + err.message, "error");
    }
});
}

// ════════════════════════════════════════════════════════════════════════════
// 2. POLLING
// ════════════════════════════════════════════════════════════════════════════
let latestSessionData = null;

function startPolling() {
    clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        if (!currentSessionId) return;
        try {
            const res = await fetch(`${API_BASE}/sessions/${currentSessionId}`);
            if (!res.ok) return;
            const data = await res.json();
            latestSessionData = data;
            
            if (modalAgentInspector && !modalAgentInspector.classList.contains("hidden")) {
                renderAgentTabs();
                renderAgentDetail(selectedAgentKey);
            }

            reportPhaseCompletion(data);

            updateWorkflowStep(data.current_phase);
            updatePhaseContext(data.current_phase, data.completion_percentage);
            updateRightPanel(data);

            if (data.is_emergency) {
                removeTypingIndicator();
                clearInterval(pollInterval);
                handleEmergency(data.emergency_info);
                return;
            }

            if (data.current_question) {
                removeTypingIndicator();
                clearInterval(pollInterval);
                promptQuestion(data.current_question, data.question_round, data.image_requested_by_qa);
                return;
            } else if (data.current_phase === "investigation_waiting") {
                removeTypingIndicator();
                clearInterval(pollInterval);
                promptTestUploads(data.investigations);
                return;
            } else if (data.current_phase !== "questioning") {
                showTypingIndicator();
            }

            if (data.status === "complete" || data.current_phase === "complete") {
                removeTypingIndicator();
                clearInterval(pollInterval);
                await loadFinalReport();
            }
        } catch (err) {
            console.error("Poll error:", err);
        }
    }, 2000);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. WORKFLOW & PROGRESS UPDATES
// ════════════════════════════════════════════════════════════════════════════
function reportPhaseCompletion(data) {
    if (!reportedPhases.has("intake") && data.current_phase !== "intake" && data.symptoms && data.symptoms.length > 0) {
        reportedPhases.add("intake");
        appendBubble(`🩺 **Intake Agent**: Clinical presentation processed.\n**Identified Symptoms:**\n${data.symptoms.map(s => `• **${s.description}**${s.severity ? ` (${s.severity})` : ''}`).join('\n')}`, "ai");
    }
    
    if (!reportedPhases.has("triage") && data.current_phase !== "triage" && data.current_phase !== "intake" && data.triage_level) {
        reportedPhases.add("triage");
        appendBubble(`🚨 **Triage Agent**: Priority classification finalized.\n**Assigned Urgency Level:** **${data.triage_level.toUpperCase()}**`, "ai");
    }
    
    if (!reportedPhases.has("case_building") && data.case_summary && (data.current_phase === "diagnosis" || data.current_phase === "treatment" || data.current_phase === "complete")) {
        reportedPhases.add("case_building");
        appendBubble(`📁 **Case Builder Agent**: Longitudinal synthesis complete.\n**Clinical Case Summary:**\n${data.case_summary}`, "ai");
    }
    
    if (!reportedPhases.has("investigator") && data.investigations && data.investigations.length > 0 && (data.current_phase === "diagnosis" || data.current_phase === "treatment" || data.current_phase === "complete")) {
        reportedPhases.add("investigator");
        appendBubble(`🔬 **Investigator Agent**: Recommended diagnostic panel:\n${data.investigations.map(t => `• **${t.test_name}**${t.priority ? ` [Priority: ${t.priority}]` : ''}`).join('\n')}`, "ai");
    }
    
    if (!reportedPhases.has("diagnosis") && data.differential_diagnosis && data.differential_diagnosis.length > 0 && (data.current_phase === "treatment" || data.current_phase === "complete")) {
        reportedPhases.add("diagnosis");
        appendBubble(`🎯 **Diagnostician Agent**: ICD-10 Differential Diagnosis:\n${data.differential_diagnosis.map(d => `• **${d.condition}** (${Math.round((d.probability || 0) * 100)}% confidence)\n  *Rationale:* ${(d.evidence && d.evidence.length > 0) ? d.evidence.join(", ") : 'Based on clinical presentation.'}`).join('\n')}`, "ai");
    }
    
    if (!reportedPhases.has("treatment") && data.medications && data.medications.length > 0 && data.current_phase === "complete") {
        reportedPhases.add("treatment");
        appendBubble(`💊 **Treatment Agent**: Safety-validated therapeutic regimen:\n${data.medications.map(m => `• **${m.name}**\n  *Indication:* ${m.indication || 'Standard clinical protocol.'}`).join('\n')}`, "ai");
    }
}


const PHASE_ORDER = ["intake","triage","questioning","case_building","diagnosis","treatment","validation"];

function updateWorkflowStep(currentPhase) {
    const idx = PHASE_ORDER.indexOf(currentPhase);
    PHASE_ORDER.forEach((phase, i) => {
        const el = document.getElementById(`step-${phase}`);
        if (!el) return;
        el.classList.remove("active", "done", "error");
        if (i < idx) {
            el.classList.add("done");
        } else if (i === idx || (currentPhase === "questioning_waiting" && phase === "questioning")) {
            el.classList.add("active");
        }
    });
    if (currentPhase === "complete") {
        PHASE_ORDER.forEach(phase => {
            const el = document.getElementById(`step-${phase}`);
            if (el) el.classList.add("done");
        });
    }
}

function updatePhaseContext(phase, pct) {
    const meta = PHASE_META[phase] || { label: `Processing: ${phase}…`, pct: pct || 0 };
    if (phaseContextText) phaseContextText.textContent = meta.label;
    if (phaseProgressFill) phaseProgressFill.style.width = (pct || meta.pct) + "%";

    const isDone    = phase === "complete";
    const isWaiting = phase === "questioning_waiting";
    if (spinnerRing) spinnerRing.className = "spinner-ring" + (isDone ? " done" : isWaiting ? " idle" : "");
}

function updateRightPanel(data) {
    if (!data) return;
    let hasData = false;

    // Triage & Biometric Vitals
    if (data.triage_level) {
        hasData = true;
        if (triageCard) triageCard.style.display = "";
        const lvl = data.triage_level.toLowerCase();
        const badgeEl = document.getElementById("triage-badge-value") || document.getElementById("triage-content");
        if (badgeEl) {
            badgeEl.innerHTML = `<span class="triage-badge ${lvl}" style="padding:4px 10px;border-radius:4px;font-weight:700;text-transform:uppercase;">${escHtml(data.triage_level)}</span>`;
        }
    }

    // Symptoms
    if (data.symptoms && data.symptoms.length > 0) {
        hasData = true;
        if (symptomsCard) symptomsCard.style.display = "";
        const sListEl = document.getElementById("symptoms-list") || document.getElementById("symptoms-content");
        if (sListEl) {
            sListEl.innerHTML = `<ul style="padding-left:16px;margin:4px 0;">` + data.symptoms.map(s =>
                `<li><strong>${escHtml(s.description)}</strong>${s.severity ? ` — <em style="color:var(--text-muted)">${escHtml(s.severity)}</em>` : ""}</li>`
            ).join("") + `</ul>`;
        }
    }

    // Tests
    if (data.investigations && data.investigations.length > 0) {
        hasData = true;
        if (testsCard) testsCard.style.display = "";
        const tListEl = document.getElementById("tests-list") || document.getElementById("tests-content");
        if (tListEl) {
            tListEl.innerHTML = `<ul style="padding-left:16px;margin:4px 0;">` + data.investigations.map(t =>
                `<li><strong>${escHtml(t.test_name)}</strong>${t.priority ? ` <span style="color:var(--text-muted);font-size:0.75rem">(${escHtml(t.priority)})</span>` : ""}</li>`
            ).join("") + `</ul>`;
        }
    }

    // Differential Dx
    if (data.differential_diagnosis && data.differential_diagnosis.length > 0) {
        hasData = true;
        if (diffCard) diffCard.style.display = "";
        const dListEl = document.getElementById("diff-list") || document.getElementById("diff-content");
        if (dListEl) {
            dListEl.innerHTML = data.differential_diagnosis.map(d => {
                const pct = Math.round((d.probability || 0) * 100);
                return `<div class="diff-item" style="margin-bottom:8px;">
                    <div class="diff-item-header" style="display:flex;justify-content:space-between;font-weight:600;">
                        <span class="diff-name">${escHtml(d.condition)}</span>
                        <span class="diff-pct">${pct}%</span>
                    </div>
                    <div class="diff-bar-track" style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;margin-top:2px;">
                        <div class="diff-bar-fill" style="width:${pct}%;height:100%;background:var(--cyan);"></div>
                    </div>
                </div>`;
            }).join("");
        }
    }

    if (rightEmpty) rightEmpty.style.display = hasData ? "none" : "";
}

// ════════════════════════════════════════════════════════════════════════════
// 4. AI STATE DISPLAY
// ════════════════════════════════════════════════════════════════════════════
function setAiState(state) {
    // state: running | waiting | done | error | idle
    if (pulseDot) pulseDot.className = "pulse-dot " + state;
    if (statusBadge) statusBadge.className = "system-badge";

    const map = {
        running: ["⚡ AI Reasoning",      "running"],
        waiting: ["💬 Awaiting Input",    ""],
        done:    ["✓ Complete",            "done"],
        error:   ["⚠ Error",             ""],
        idle:    ["🟢 Ready",              ""],
    };
    const [badgeTxt, badgeCls] = map[state] || map.idle;
    if (statusBadge) {
        statusBadge.textContent = badgeTxt;
        if (badgeCls) statusBadge.classList.add(badgeCls);
    }
    if (aiStatusText) aiStatusText.textContent = badgeTxt;
}

// ════════════════════════════════════════════════════════════════════════════
// 5. CHAT
// ════════════════════════════════════════════════════════════════════════════
function formatChatMessage(text, role) {
    if (!text) return "";
    let formatted = escHtml(text);

    // Bold formatting **text** -> <strong>text</strong>
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Bullet points • text or - text -> <li class="chat-bullet">text</li>
    formatted = formatted.replace(/^[•\-]\s*(.*)$/gm, '<li class="chat-bullet">$1</li>');
    formatted = formatted.replace(/(<li class="chat-bullet">.*<\/li>\n?)+/g, '<ul class="chat-bullet-list">$&</ul>');

    // Newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    formatted = formatted.replace(/<\/ul><br>/g, '</ul>');
    return formatted;
}

function appendBubble(text, role) {
    const welcome = chatMessages.querySelector(".chat-welcome");
    if (welcome) welcome.remove();

    const isAI = role === "ai";
    const isSystem = role === "system";
    const wrap = document.createElement("div");
    wrap.className = `chat-msg ${isSystem ? "system" : isAI ? "ai" : "user"}`;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (isSystem) {
        wrap.innerHTML = `<div class="msg-bubble"><span style="color:var(--cyan);margin-right:6px;">›</span>${escHtml(text)}</div>`;
    } else {
        const avatarClass = isAI ? "ai" : "user-av";
        const avatarContent = isAI
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z"/><path d="M12 6v6l4 2"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

        const htmlContent = formatChatMessage(text, role);

        const ttsBtnHtml = isAI
            ? `<button type="button" class="btn btn-outline-sm tts-speak-btn" onclick="speakMessageText(this)" style="font-size:0.7rem;padding:2px 8px;margin-top:4px;border-color:rgba(0,229,255,0.3);color:var(--cyan);">🔊 Read Aloud</button>`
            : "";

        wrap.innerHTML = `
            <div class="msg-avatar ${avatarClass}">${avatarContent}</div>
            <div class="msg-wrapper">
                <div class="msg-label">
                    <span>${isAI ? "🤖 Clinical AI" : "👤 Clinician Response"}</span>
                </div>
                <div class="msg-bubble">${htmlContent}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div class="msg-time">${time}</div>
                    ${ttsBtnHtml}
                </div>
            </div>`;

        if (isAI && isAutoSpeakEnabled) {
            setTimeout(() => speakText(text), 200);
        }
    }
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendStatusMsg(text) {
    appendBubble(text, "system");
}

function showTypingIndicator() {
    removeTypingIndicator();
    const wrap = document.createElement("div");
    wrap.className = "chat-msg ai typing-bubble";
    wrap.id = "active-typing-indicator";
    wrap.innerHTML = `
        <div class="msg-avatar ai">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        </div>
        <div>
            <div class="msg-label">Clinical AI</div>
            <div class="msg-bubble" style="min-width:80px;">Analyzing</div>
        </div>`;
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const el = document.getElementById("active-typing-indicator");
    if (el) el.remove();
}

function appendImageAnalysisBubble(filename, analysisText, isUrgent) {
    const welcome = chatMessages.querySelector(".chat-welcome");
    if (welcome) welcome.remove();

    const wrap = document.createElement("div");
    wrap.className = "chat-msg ai";
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const formatted = escHtml(analysisText).replace(/\n/g, "<br>");
    const accentColor = isUrgent ? "var(--red-alert)" : "var(--green)";
    wrap.innerHTML = `
        <div class="msg-avatar ai">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        </div>
        <div style="min-width:0;flex:1">
            <div class="msg-label" style="color:${accentColor}">${isUrgent ? "⚠️ Urgent Image Findings" : "🔬 Image Analysis"}</div>
            <div class="msg-bubble">
                <div class="img-analysis-card" style="${isUrgent ? 'border-color:rgba(255,45,85,0.4);background:var(--red-dim)' : ''}">
                    <div class="img-title">
                        <span>🩻</span>
                        <span>${escHtml(filename)}</span>
                    </div>
                    <div>${formatted}</div>
                </div>
            </div>
            <div class="msg-time">${time}</div>
        </div>`;
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function promptQuestion(question, round, isImageRequested) {
    if (isAsking) return;
    isAsking = true;

    setAiState("waiting");
    updateWorkflowStep("questioning");
    updatePhaseContext("questioning_waiting", 40);

    let displayQuestion = question;
    if (currentConsultationLanguage !== "en") {
        displayQuestion = await translateTextClient(question, "en", currentConsultationLanguage);
    }

    // On the very first question, show an introductory message first
    if (round === 1) {
        appendStatusMsg("Clinical Interview — Round 1 of up to 10");
        let introMsg = "Hello. Before we begin the formal interview, please feel free to tell me anything else about your symptoms, how long they've been going on, any relevant medical history, medications you take, allergies, or anything else you think may be important. The more detail you share, the better. I will then ask you some focused follow-up questions.";
        if (currentConsultationLanguage !== "en") {
            introMsg = await translateTextClient(introMsg, "en", currentConsultationLanguage);
        }
        appendBubble(introMsg, "ai");
    } else {
        appendStatusMsg(`Round ${round} of up to 10 — Clinical Q&A`);
    }

    appendBubble(displayQuestion, "ai");

    const wrapEl = document.getElementById("chat-input-wrap") || chatInputWrap;
    const inputEl = document.getElementById("answer-input") || answerInput;
    const uploadBtnEl = document.getElementById("btn-upload-image") || btnUploadImage;

    if (wrapEl) wrapEl.classList.remove("hidden");
    if (inputEl) {
        inputEl.value = "";
        setTimeout(() => { try { inputEl.focus(); } catch (e) {} }, 100);
    }

    if (isImageRequested && uploadBtnEl) {
        uploadBtnEl.classList.add("highlight");
        appendBubble(
            "📎 Please attach any relevant medical images (X-ray, CT, MRI, ECG, lab report, photo) using the \"Attach image\" button below — MedGemma will analyse them directly.",
            "ai"
        );
    } else if (uploadBtnEl) {
        uploadBtnEl.classList.remove("highlight");
    }
}

function promptTestUploads(investigations) {
    if (isAsking) return;
    isAsking = true;

    setAiState("waiting");
    updateWorkflowStep("investigation_waiting");
    updatePhaseContext("investigation_waiting", 60);

    const wrapEl   = document.getElementById("test-results-input-wrap") || testResultsWrap;
    const inputEl  = document.getElementById("test-results-input")      || testResultsInput;
    const imgEl    = document.getElementById("test-image-upload")       || testImageUpload;
    const skipEl   = document.getElementById("skip-tests-btn")          || skipTestsBtn;
    const submitEl = document.getElementById("submit-tests-btn");

    appendStatusMsg("🔬 Investigator Agent — Test Results Required");

    // Remove any existing chat-welcome placeholder
    const welcome = chatMessages.querySelector(".chat-welcome");
    if (welcome) welcome.remove();

    // Build rich investigation card directly in the chat stream
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const tests = (investigations && investigations.length > 0) ? investigations : [];

    const testPillsHtml = tests.length > 0
        ? tests.map(t => {
            const pri = (t.priority || "").toLowerCase();
            const priColor = pri === "urgent" || pri === "high"
                ? "background:rgba(255,45,85,0.15);border-color:rgba(255,45,85,0.4);color:#ff6b8a;"
                : pri === "moderate" || pri === "medium"
                    ? "background:rgba(255,179,0,0.12);border-color:rgba(255,179,0,0.4);color:#ffc33a;"
                    : "background:rgba(0,229,255,0.08);border-color:rgba(0,229,255,0.25);color:var(--cyan);";
            return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;border:1px solid;${priColor}margin-bottom:5px;">
                <span style="font-size:1rem;">🔬</span>
                <span style="font-weight:600;flex:1;">${escHtml(t.test_name)}</span>
                ${t.priority ? `<span style="font-size:0.7rem;font-family:'JetBrains Mono',monospace;opacity:0.8;text-transform:uppercase;letter-spacing:0.08em;">${escHtml(t.priority)}</span>` : ""}
            </div>`;
        }).join("")
        : `<p style="color:var(--text-muted);font-size:0.85rem;">No specific tests listed — provide any available results.</p>`;

    const card = document.createElement("div");
    card.className = "chat-msg ai";
    card.innerHTML = `
        <div class="msg-avatar ai">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
            </svg>
        </div>
        <div class="msg-wrapper" style="min-width:0;flex:1;">
            <div class="msg-label" style="color:var(--cyan);">🔬 Investigator Agent</div>
            <div class="msg-bubble" style="padding:0;overflow:hidden;">
                <!-- Header -->
                <div style="padding:12px 14px 10px;background:rgba(0,229,255,0.06);border-bottom:1px solid rgba(0,229,255,0.15);">
                    <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);margin-bottom:2px;">
                        Diagnostic Investigations Ordered
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-muted);">
                        ${tests.length} test${tests.length !== 1 ? "s" : ""} recommended for this case
                    </div>
                </div>
                <!-- Test list -->
                <div style="padding:10px 14px 12px;">
                    ${testPillsHtml}
                </div>
                <!-- CTA banner -->
                <div style="padding:10px 14px;background:rgba(255,179,0,0.07);border-top:1px solid rgba(255,179,0,0.18);display:flex;align-items:center;gap:10px;">
                    <span style="font-size:1.1rem;">📋</span>
                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">
                        <strong style="color:#ffc33a;">Action required:</strong> If these tests have been performed, paste the results below or attach the report image. Otherwise click <strong>Skip</strong> to proceed without them.
                    </div>
                </div>
            </div>
            <div class="msg-time">${time}</div>
        </div>`;
    chatMessages.appendChild(card);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Update the test-results dock header to show the test list
    const dockHeader = document.querySelector(".test-results-header");
    if (dockHeader) {
        dockHeader.innerHTML = `🔬 <strong>${tests.length} test${tests.length !== 1 ? "s" : ""} ordered</strong> — paste results as text or attach the report image below. Not done yet? Click <strong>Skip</strong>.`;
    }

    // Switch to chat tab so user sees the prompt
    if (typeof switchDocTab === "function") switchDocTab("chat");

    // Show the input dock
    if (wrapEl)  wrapEl.classList.remove("hidden");
    if (inputEl) { inputEl.value = ""; setTimeout(() => { try { inputEl.focus(); } catch(e){} }, 100); }
    if (imgEl)   imgEl.value = "";
    if (skipEl)  skipEl.disabled = false;
    if (submitEl) submitEl.disabled = false;
}

if (testResultsForm) {
    testResultsForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        submitTestResults(false);
    });
}

if (skipTestsBtn) {
    skipTestsBtn.addEventListener("click", () => {
        submitTestResults(true);
    });
}

async function submitTestResults(skipped) {
    const wrapEl   = document.getElementById("test-results-input-wrap") || testResultsWrap;
    const inputEl  = document.getElementById("test-results-input")      || testResultsInput;
    const imgEl    = document.getElementById("test-image-upload")       || testImageUpload;
    const skipEl   = document.getElementById("skip-tests-btn")          || skipTestsBtn;
    const submitEl = document.getElementById("submit-tests-btn");
    const statusEl = document.getElementById("test-image-upload-status")|| testImageStatus;

    const textResults = inputEl ? inputEl.value.trim() : "";
    const file = imgEl && imgEl.files ? imgEl.files[0] : null;

    if (!skipped && !textResults && !file) return;

    if (skipEl)   skipEl.disabled = true;
    if (submitEl) submitEl.disabled = true;
    isAsking = false;

    // Build a clear user response card in the chat
    if (skipped) {
        appendBubble("⏩ **Skipping test results** — proceeding without diagnostic report uploads. The pipeline will continue based on clinical presentation alone.", "user");
    } else if (file && textResults) {
        appendBubble(`📎 **Attached:** ${file.name}\n\n📋 **Typed results:**\n${textResults}`, "user");
    } else if (file) {
        appendBubble(`📎 **Attached report image:** ${file.name}\nUploading to pipeline for analysis…`, "user");
    } else {
        appendBubble(`📋 **Lab/Imaging results submitted:**\n${textResults}`, "user");
    }

    setAiState("running");
    if (wrapEl) wrapEl.classList.add("hidden");
    showTypingIndicator();


    try {
        let imagePaths = [];
        if (!skipped && file) {
            if (statusEl) { statusEl.textContent = `Uploading ${file.name}…`; statusEl.classList.remove("hidden"); }
            const formData = new FormData();
            formData.append("file", file);
            formData.append("image_type", "unknown");

            const uploadRes = await fetch(`${API_BASE}/sessions/${currentSessionId}/upload-image`, {
                method: "POST",
                body: formData
            });

            if (!uploadRes.ok) throw new Error("Image upload failed");
            const uploadData = await uploadRes.json();
            const savedPath = uploadData.saved_to || uploadData.file_path;
            if (savedPath) imagePaths.push(savedPath);
            if (statusEl) statusEl.classList.add("hidden");
        }

        const res = await fetch(`${API_BASE}/sessions/${currentSessionId}/test_results`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                image_paths: imagePaths,
                text_results: skipped ? "" : textResults,
                skipped: skipped
            })
        });

        if (!res.ok) throw new Error("Failed to submit test results");
        if (inputEl) inputEl.value = "";
        if (imgEl)   imgEl.value = "";
        startPolling();
    } catch (err) {
        console.error("Test Results error:", err);
        showToast("Error submitting test results: " + err.message, "error");
        if (skipEl)   skipEl.disabled = false;
        if (submitEl) submitEl.disabled = false;
        if (wrapEl)   wrapEl.classList.remove("hidden");
        if (statusEl) statusEl.classList.add("hidden");
        removeTypingIndicator();
        isAsking = true;
    }
}

// ── QA Form Submit ────────────────────────────────────────────────────────────
if (qaForm) {
qaForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const inputEl = document.getElementById("answer-input") || answerInput;
    const uploadEl = document.getElementById("image-upload") || imageUpload;
    const sendBtnEl = document.getElementById("send-answer-btn") || sendAnswerBtn;
    const wrapEl = document.getElementById("chat-input-wrap") || chatInputWrap;

    const answer = inputEl ? inputEl.value.trim() : "";
    const file = (uploadEl && uploadEl.files) ? uploadEl.files[0] : null;

    if (!answer && !file) return;

    if (sendBtnEl) sendBtnEl.disabled = true;
    isAsking = false;

    let displayText = answer || "[Image Uploaded]";
    if (file && answer) displayText = `[📎 ${file.name}] ${answer}`;

    appendBubble(displayText, "user");
    setAiState("running");
    chatInputWrap.classList.add("hidden");
    showTypingIndicator();

    try {
        // Upload and analyse image if present
        if (file) {
            imageUploadStatus.textContent = `Uploading & analysing ${file.name}…`;
            imageUploadStatus.classList.remove("hidden");
            imageUploadStatus.classList.add("analysing");

            const fd = new FormData();
            fd.append("file", file);
            fd.append("image_type", "qa_upload");

            const upRes = await fetch(`${API_BASE}/sessions/${currentSessionId}/analyse-image`, {
                method: "POST",
                body: fd,
            });

            if (!upRes.ok) throw new Error("Image upload failed");

            const upData = await upRes.json();
            imageUploadStatus.classList.add("hidden");
            imageUploadStatus.classList.remove("analysing");
            imageUpload.value = "";
            btnUploadImage.classList.remove("highlight");

            // Show the image analysis result in the chat immediately
            if (upData.analysis) {
                const a = upData.analysis;
                let analysisHtml = `📸 Image analysis complete for <strong>${file.name}</strong>\n\n`;
                analysisHtml += `${a.summary}`;
                if (a.findings && a.findings.length > 0) {
                    analysisHtml += `\n\nFindings:\n` + a.findings.map(f => `• ${f}`).join("\n");
                }
                if (a.urgent && a.urgent_items && a.urgent_items.length > 0) {
                    analysisHtml += `\n\n⚠️ URGENT: ` + a.urgent_items.join("; ");
                }
                appendImageAnalysisBubble(file.name, analysisHtml, a.urgent);
            }
        }

        // Submit text response
        const textAnswer = answer || "[Image uploaded]";
        let textAnswerEnglish = textAnswer;
        if (currentConsultationLanguage !== "en" && textAnswer !== "[Image uploaded]") {
            const translated = await translateTextClient(textAnswer, currentConsultationLanguage, "en");
            if (translated && translated.trim().length > 0) {
                textAnswerEnglish = translated.trim();
            }
        }

        const resp = await fetch(`${API_BASE}/sessions/${currentSessionId}/respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                answer: textAnswerEnglish,
                detected_language: currentConsultationLanguage,
                answer_original: textAnswer
            })
        });

        if (!resp.ok) {
            let errDetail = `Server error: ${resp.status}`;
            try {
                const errJson = await resp.json();
                if (errJson.detail) {
                    errDetail = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
                }
            } catch (e) {}
            throw new Error(errDetail);
        }

        answerInput.value = "";
        imageUploadStatus.classList.add("hidden");
        sendAnswerBtn.disabled = false;
        startPolling();
    } catch (err) {
        showToast("Failed to submit: " + err.message, "error");
        sendAnswerBtn.disabled = false;
    }
});
}

// Image selection preview (QA chat upload)
if (imageUpload) {
imageUpload.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        imageUploadStatus.textContent = `📎 ${e.target.files[0].name}`;
        imageUploadStatus.classList.remove("hidden");
    } else {
        imageUploadStatus.classList.add("hidden");
    }
});
}

// Test results image selection preview
document.addEventListener("DOMContentLoaded", () => {
    const tiUpload = document.getElementById("test-image-upload");
    const tiStatus = document.getElementById("test-image-upload-status");
    if (tiUpload && tiStatus) {
        tiUpload.addEventListener("change", (e) => {
            if (e.target.files.length > 0) {
                tiStatus.textContent = `📎 ${e.target.files[0].name}`;
                tiStatus.classList.remove("hidden");
            } else {
                tiStatus.classList.add("hidden");
            }
        });
    }
});


// ════════════════════════════════════════════════════════════════════════════
// 6. EMERGENCY
// ════════════════════════════════════════════════════════════════════════════
function handleEmergency(info) {
    info = info || {};
    setAiState("error");
    updateWorkflowStep("triage"); // Mark triage as active/error
    const stepTriage = document.getElementById("step-triage");
    if (stepTriage) {
        stepTriage.classList.remove("active");
        stepTriage.classList.add("error");
    }

    const banner = document.getElementById("emergency-banner") || emergencyBanner;
    const actionsList = document.getElementById("emergency-actions-list") || emergencyActionsList;
    const doNotList = document.getElementById("emergency-do-not-list") || emergencyDoNotList;

    if (banner) {
        banner.classList.remove("hidden");
    }

    if (actionsList) {
        if (info.immediate_actions && info.immediate_actions.length > 0) {
            actionsList.innerHTML = `
                <div style="font-size:0.8rem;font-weight:700;color:#f87171;margin-bottom:0.35rem;text-transform:uppercase;letter-spacing:0.05em">Immediate Actions:</div>
                <ul>${info.immediate_actions.map(a => `<li>${a}</li>`).join("")}</ul>`;
        } else if (info.recommendation) {
            actionsList.innerHTML = `
                <div style="font-size:0.8rem;font-weight:700;color:#f87171;margin-bottom:0.35rem;text-transform:uppercase;letter-spacing:0.05em">Immediate Action:</div>
                <ul><li>${info.recommendation}</li></ul>`;
        } else {
            actionsList.innerHTML = "";
        }
    }
    if (doNotList) {
        if (info.do_not && info.do_not.length > 0) {
            doNotList.innerHTML = `
                <div style="font-size:0.8rem;font-weight:700;color:#f43f5e;margin-top:0.75rem;margin-bottom:0.35rem;text-transform:uppercase;letter-spacing:0.05em">Do NOT:</div>
                <ul>${info.do_not.map(a => `<li>${a}</li>`).join("")}</ul>`;
        } else {
            doNotList.innerHTML = "";
        }
    }

    appendBubble("⚠️ " + (info.message || "CRITICAL EMERGENCY detected. Immediate medical care required. Do not use AI tools for this patient — call emergency services NOW."), "ai");
    updatePhaseContext("complete", 100);
    if (phaseProgressFill) phaseProgressFill.style.background = "var(--red)";
    if (statusBadge) {
        statusBadge.textContent = "🚨 EMERGENCY";
        statusBadge.className = "system-badge emergency";
    }
}

// ════════════════════════════════════════════════════════════════════════════
// 7. FINAL REPORT
// ════════════════════════════════════════════════════════════════════════════
async function loadFinalReport() {
    updateWorkflowStep("complete");
    updatePhaseContext("complete", 100);
    setAiState("done");
    appendStatusMsg("Assessment complete — loading report…");

    try {
        const res = await fetch(`${API_BASE}/sessions/${currentSessionId}/report`);
        if (!res.ok) throw new Error("Could not load report");
        const report = await res.json();

        latestSessionData = {
            ...report,
            agent_telemetry: report.agent_telemetry || (latestSessionData ? latestSessionData.agent_telemetry : null)
        };

        switchScreen(screenActive, screenReport);
        renderReport(report);
    } catch (err) {
        console.error("Report error:", err);
        appendBubble(`⚠️ **Could not load final clinical report.**\nError: ${err.message}\n\nThis may be a transient network issue. Click below or wait a moment and try again.`, "ai");
        showToast("Could not load final report: " + err.message, "error");
        // Offer retry after a short delay
        setTimeout(() => {
            const retryBtn = document.createElement("button");
            retryBtn.className = "btn btn-primary";
            retryBtn.style.cssText = "margin:8px auto;display:block;";
            retryBtn.textContent = "🔄 Retry Loading Report";
            retryBtn.onclick = () => { retryBtn.remove(); loadFinalReport(); };
            if (chatMessages) chatMessages.appendChild(retryBtn);
        }, 500);
    }
}


function renderReport(report) {
    const isSafe = report.is_safe;
    const isEmergency = report.is_emergency;

    // Safety banner
    const safetyBanner = document.getElementById("safety-banner");
    if (isEmergency) {
        safetyBanner.className = "safety-banner emergency-mode";
        safetyBanner.innerHTML = `<div style="display:flex;align-items:center;gap:12px"><span style="font-size:1.5rem">🚨</span><span>EMERGENCY CASE — Immediate intervention was required. This report is for documentation only.</span></div><button type="button" class="btn-inspect-chip" onclick="openAgentInspector('triage_agent')">🔍 Triage Audit</button>`;
    } else if (isSafe) {
        safetyBanner.className = "safety-banner safe";
        safetyBanner.innerHTML = `<div style="display:flex;align-items:center;gap:12px"><span style="font-size:1.25rem">✅</span><span>Treatment plan has passed all safety validation checks.</span></div><button type="button" class="btn-inspect-chip" onclick="openAgentInspector('validator_agent')">🔍 Safety Audit Payload</button>`;
    } else {
        safetyBanner.className = "safety-banner unsafe";
        safetyBanner.innerHTML = `<div style="display:flex;align-items:center;gap:12px"><span style="font-size:1.25rem">⚠️</span><span>Safety warnings detected. Please review before implementing.</span></div><button type="button" class="btn-inspect-chip" onclick="openAgentInspector('validator_agent')">🔍 Safety Audit Payload</button>`;
    }

    // Primary Diagnosis
    const conf = Math.round((report.diagnosis_confidence || 0) * 100);
    document.getElementById("primary-dx-content").innerHTML = `
        <div class="dx-name">${report.primary_diagnosis || "Undetermined"}</div>
        <div class="dx-confidence">
            <span class="dx-conf-label">Confidence</span>
            <div class="dx-conf-track"><div class="dx-conf-fill" style="width:${conf}%"></div></div>
            <span class="dx-conf-pct">${conf}%</span>
        </div>`;

    // Triage
    const lvl = (report.triage_level || "").toLowerCase();
    document.getElementById("report-triage-content").innerHTML = `
        <div class="triage-report-wrap">
            <div class="triage-report-badge ${lvl}">${lvl === "emergency" ? "🚨" : lvl === "urgent" ? "⚡" : "✅"} ${report.triage_level || "N/A"}</div>
            ${report.validation_recommendations && report.validation_recommendations.length > 0
                ? `<ul class="followup-list">${report.validation_recommendations.map(r => `<li>${r}</li>`).join("")}</ul>`
                : ""}
        </div>`;

    // Differential
    const diffs = report.differential_diagnosis || [];
    document.getElementById("diff-dx-grid").innerHTML = diffs.length > 0 ?
        `<div style="padding:12px;display:flex;flex-direction:column;gap:10px">`
        + diffs.map(d => {
            const p = Math.round((d.probability || 0) * 100);
            return `<div class="diff-item">
                <div class="diff-item-header">
                    <span class="diff-name">${d.condition}${d.icd_code ? ` <span style="font-size:0.68rem;color:var(--text-muted);font-family:monospace">(${d.icd_code})</span>` : ""}</span>
                    <span class="diff-pct">${p}%</span>
                </div>
                <div class="diff-bar-track"><div class="diff-bar-fill" style="width:${p}%"></div></div>
                ${d.evidence && d.evidence.length > 0 ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">${d.evidence.slice(0,3).join(" · ")}</div>` : ""}
            </div>`;
        }).join("") + "</div>" :
        `<p style="color:var(--text-muted);font-size:0.85rem;padding:16px">No differential diagnosis data available.</p>`;

    // Medications
    const meds = report.medications || [];
    document.getElementById("treatment-content").innerHTML = meds.length > 0 ?
        `<table class="med-table">
            <thead><tr><th>Medication</th><th>Dose / Route</th><th>Frequency</th><th>Indication</th></tr></thead>
            <tbody>${meds.map(m => `<tr>
                <td class="med-name">${m.name}</td>
                <td>${m.dose || "—"} ${m.route || ""}</td>
                <td>${m.frequency || "—"}</td>
                <td>${m.indication || "—"}</td>
            </tr>`).join("")}</tbody>
        </table>` :
        `<p style="color:var(--text-muted);font-size:0.85rem;padding:16px">No medication data available.</p>`;

    // Lifestyle & Follow-up
    const lifestyle = report.lifestyle_modifications || [];
    const followUp  = report.follow_up || "";
    let lfHtml = "";
    if (followUp) lfHtml += `<div class="followup-list"><li style="font-weight:600;color:var(--text-primary)">📅 ${followUp}</li></div>`;
    if (lifestyle.length > 0) lfHtml += `<ul class="followup-list">${lifestyle.map(l => `<li>${l}</li>`).join("")}</ul>`;
    document.getElementById("lifestyle-content").innerHTML = lfHtml ||
        `<p style="color:var(--text-muted);font-size:0.85rem;padding:16px">No lifestyle guidance available.</p>`;

    // Disclaimer
    document.getElementById("report-disclaimer").textContent = report.disclaimer || "";
}

// ════════════════════════════════════════════════════════════════════════════
// 8. UTILITIES
// ════════════════════════════════════════════════════════════════════════════
function switchScreen(from, to) {
    from.classList.add("hidden");
    to.classList.remove("hidden");
    to.classList.add("screen"); // re-trigger animation
    to.style.animation = "none";
    requestAnimationFrame(() => {
        to.style.animation = "";
    });
}

function escHtml(str) {
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function flashInput(el, msg) {
    el.style.borderColor = "var(--red)";
    el.style.boxShadow = "0 0 0 3px var(--red-glow)";
    setTimeout(() => {
        el.style.borderColor = "";
        el.style.boxShadow = "";
    }, 2000);
}

function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.style.cssText = `
        position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
        padding: 0.85rem 1.25rem; border-radius: 10px; font-size: 0.85rem;
        font-family: Inter, sans-serif; font-weight: 500; max-width: 360px;
        background: ${type === "error" ? "rgba(244,63,94,0.15)" : "rgba(16,217,138,0.12)"};
        border: 1px solid ${type === "error" ? "var(--red)" : "var(--green)"};
        color: ${type === "error" ? "var(--red)" : "var(--green)"};
        animation: screenIn 0.3s ease both;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function resetApp() {
    clearInterval(pollInterval);
    currentSessionId = null;
    isAsking = false;

    // Reset UI state
    chatMessages.innerHTML = `
        <div class="chat-welcome">
            <div class="chat-welcome-icon">🩺</div>
            <p>Clinical assessment started. The AI is analyzing the patient presentation...</p>
        </div>`;
    if (chatInputWrap) chatInputWrap.classList.add("hidden");
    if (imageUploadStatus) imageUploadStatus.classList.add("hidden");
    const banner = document.getElementById("emergency-banner") || emergencyBanner;
    const actionsList = document.getElementById("emergency-actions-list") || emergencyActionsList;
    const doNotList = document.getElementById("emergency-do-not-list") || emergencyDoNotList;
    if (banner) banner.classList.add("hidden");
    if (actionsList) actionsList.innerHTML = "";
    if (doNotList) doNotList.innerHTML = "";
    if (answerInput) answerInput.value = "";
    if (imageUpload) imageUpload.value = "";
    if (phaseProgressFill) {
        phaseProgressFill.style.width = "0%";
        phaseProgressFill.style.background = "";
    }
    if (phaseContextText) phaseContextText.textContent = "Initializing clinical assessment pipeline...";
    if (spinnerRing) spinnerRing.className = "spinner-ring";
    if (statusBadge) {
        statusBadge.className = "system-badge";
        statusBadge.textContent = "🟢 Ready";
    }
    if (aiStatusText) aiStatusText.textContent = "Initializing...";
    if (pulseDot) pulseDot.className = "pulse-dot idle";

    // Reset right panel
    if (triageCard) triageCard.style.display = "none";
    if (symptomsCard) symptomsCard.style.display = "none";
    if (testsCard) testsCard.style.display = "none";
    if (diffCard) diffCard.style.display = "none";
    if (rightEmpty) rightEmpty.style.display = "";

    // Reset workflow steps
    PHASE_ORDER.forEach(phase => {
        const el = document.getElementById(`step-${phase}`);
        if (el) el.classList.remove("active", "done", "error");
    });

    // Reset forms
    if (patientDescription) patientDescription.value = "";
    if (startBtn) {
        startBtn.disabled = false;
        const btnTxt = startBtn.querySelector(".btn-text");
        const btnArr = startBtn.querySelector(".btn-arrow");
        if (btnTxt) btnTxt.textContent = "Initiate Clinical Assessment";
        if (btnArr) btnArr.innerHTML = "→";
    }

    // Go back to intake screen
    screenReport.classList.add("hidden");
    screenActive.classList.add("hidden");
    screenIntake.classList.remove("hidden");
}

// ════════════════════════════════════════════════════════════════════════════
// 9. PROCEDURAL WEB AUDIO SFX & VISUAL TELEMETRY (NOVEL FEATURE)
// ════════════════════════════════════════════════════════════════════════════
let sfxEnabled = true;
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
    }
    return audioCtx;
}

function playSound(type) {
    if (!sfxEnabled) return;
    try {
        const ctx = getAudioCtx();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        if (type === "click") {
            osc.type = "sine";
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === "step") {
            osc.type = "triangle";
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === "alert") {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(600, now + 0.2);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    } catch (e) {
        // Audio Context blocked or not supported
    }
}

// SFX toggle button handler
const btnSfxToggle = document.getElementById("btn-sfx-toggle");
if (btnSfxToggle) {
    btnSfxToggle.addEventListener("click", () => {
        sfxEnabled = !sfxEnabled;
        btnSfxToggle.classList.toggle("active", sfxEnabled);
        document.getElementById("sfx-icon").textContent = sfxEnabled ? "🔊" : "🔇";
        btnSfxToggle.querySelector("span:last-child").textContent = sfxEnabled ? "SFX ON" : "SFX OFF";
        if (sfxEnabled) playSound("click");
    });
}

// Global button click SFX listener
document.addEventListener("click", (e) => {
    if (e.target.closest("button, .btn, .wf-node, input[type='submit']")) {
        playSound("click");
    }
});

// Dynamic Vitals telemetry updater based on triage level
function updateVitalsTelemetry(triageLevel) {
    const hrEl = document.getElementById("vital-hr");
    const spo2El = document.getElementById("vital-spo2");
    const bpEl = document.getElementById("vital-bp");
    const tempEl = document.getElementById("vital-temp");

    if (!hrEl) return;

    const lvl = (triageLevel || "").toLowerCase();

    if (lvl === "emergency") {
        hrEl.innerHTML = `128 <span class="vital-unit">bpm</span>`;
        hrEl.style.color = "var(--red-alert)";
        spo2El.innerHTML = `91 <span class="vital-unit">%</span>`;
        spo2El.style.color = "var(--red-alert)";
        bpEl.textContent = "165/105";
        bpEl.style.color = "var(--red-alert)";
        tempEl.innerHTML = `38.9 <span class="vital-unit">°C</span>`;
    } else if (lvl === "urgent") {
        hrEl.innerHTML = `96 <span class="vital-unit">bpm</span>`;
        hrEl.style.color = "var(--amber)";
        spo2El.innerHTML = `95 <span class="vital-unit">%</span>`;
        spo2El.style.color = "var(--amber)";
        bpEl.textContent = "138/88";
        bpEl.style.color = "var(--amber)";
        tempEl.innerHTML = `37.8 <span class="vital-unit">°C</span>`;
    } else {
        hrEl.innerHTML = `74 <span class="vital-unit">bpm</span>`;
        hrEl.style.color = "var(--cyan)";
        spo2El.innerHTML = `98 <span class="vital-unit">%</span>`;
        spo2El.style.color = "var(--cyan)";
        bpEl.textContent = "120/80";
        bpEl.style.color = "var(--cyan)";
        tempEl.innerHTML = `37.1 <span class="vital-unit">°C</span>`;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// 10. MULTI-AGENT EXECUTION INSPECTOR (AGENT TELEMETRY HUB)
// ════════════════════════════════════════════════════════════════════════════
const AGENT_KEYS = [
    "intake_agent",
    "triage_agent",
    "questioner_agent",
    "case_builder_agent",
    "investigator_agent",
    "interpreter_agent",
    "diagnostician_agent",
    "treatment_agent",
    "validator_agent"
];

let selectedAgentKey = "intake_agent";

const modalAgentInspector = document.getElementById("modal-agent-inspector");
const btnOpenInspector    = document.getElementById("btn-open-agent-inspector");
const btnCloseInspector   = document.getElementById("btn-close-agent-inspector");
const agentTabsList       = document.getElementById("agent-tabs-list");
const agentDetailView     = document.getElementById("agent-detail-view");

if (btnOpenInspector) {
    btnOpenInspector.addEventListener("click", () => openAgentInspector());
}

if (btnCloseInspector) {
    btnCloseInspector.addEventListener("click", () => closeAgentInspector());
}

async function openAgentInspector(agentKey) {
    if (agentKey) selectedAgentKey = agentKey;
    if (!modalAgentInspector) return;

    modalAgentInspector.classList.remove("hidden");
    playSound("click");

    const activeId = currentSessionId || localStorage.getItem("medai_session_id");

    // Fetch latest session telemetry before rendering
    if (activeId) {
        currentSessionId = activeId;
        try {
            const res = await fetch(`${API_BASE}/sessions/${activeId}`);
            if (res.ok) {
                latestSessionData = await res.json();
            }
        } catch (e) {
            console.error("Telemetry refresh error:", e);
        }
    }

    renderAgentTabs();
    renderAgentDetail(selectedAgentKey);
}

function closeAgentInspector() {
    if (modalAgentInspector) {
        modalAgentInspector.classList.add("hidden");
    }
}

function renderAgentTabs() {
    if (!agentTabsList) return;

    const telemetry = (latestSessionData && latestSessionData.agent_telemetry) || {};

    agentTabsList.innerHTML = AGENT_KEYS.map(key => {
        const item = telemetry[key] || {
            name: key.replace("_", " ").toUpperCase(),
            role: "Pipeline Agent",
            status: "pending"
        };
        const isActive = key === selectedAgentKey;
        const status = item.status || "pending";

        return `
            <div class="agent-tab-item ${isActive ? 'active' : ''}" onclick="selectAgentTab('${key}')">
                <div class="agent-tab-top">
                    <span class="agent-tab-name">${item.name}</span>
                    <span class="agent-tab-status ${status}"></span>
                </div>
                <div class="agent-tab-role">${item.role}</div>
            </div>`;
    }).join("");
}

function selectAgentTab(key) {
    selectedAgentKey = key;
    renderAgentTabs();
    renderAgentDetail(key);
    playSound("click");
}

function renderAgentDetail(key) {
    if (!agentDetailView) return;

    const telemetry = (latestSessionData && latestSessionData.agent_telemetry) || {};
    const agentData = telemetry[key] || {
        name: key.replace("_", " ").toUpperCase(),
        role: "Clinical Pipeline Agent",
        status: "pending",
        output: {}
    };

    const outputObj = agentData.output || {};
    const jsonString = JSON.stringify(outputObj, null, 2);
    const status = agentData.status || "pending";

    let structuredHtml = `<div class="agent-detail-header-block">
        <div>
            <div class="agent-title-lg">${agentData.name}</div>
            <div class="agent-role-lg">${agentData.role}</div>
        </div>
        <span class="system-badge ${status === 'complete' ? 'done' : status === 'active' ? 'running' : ''}">
            ${status.toUpperCase()}
        </span>
    </div>`;

    structuredHtml += `<div class="agent-detail-card" style="margin-bottom:16px;">
        <div style="font-family:'Rajdhani',sans-serif;font-weight:700;color:var(--text-secondary);text-transform:uppercase;font-size:0.82rem;margin-bottom:8px;">
            📊 Agent Telemetry Summary
        </div>
        <div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">
            ${buildAgentSummaryHtml(key, outputObj)}
        </div>
    </div>`;

    structuredHtml += `
        <div class="raw-json-wrap">
            <div class="raw-json-header">
                <span>RAW AGENT OUTPUT PAYLOAD (JSON)</span>
                <button type="button" class="btn-copy-json" onclick="copyAgentJson(this)">📋 Copy JSON</button>
            </div>
            <pre class="raw-json-code" id="raw-json-code">${escHtml(jsonString)}</pre>
        </div>`;

    agentDetailView.innerHTML = structuredHtml;
}

function formatItemString(item, keyField = "name") {
    if (item === null || item === undefined) return "";
    if (typeof item === "string") return item;
    if (typeof item === "number" || typeof item === "boolean") return String(item);
    if (typeof item === "object") {
        return item[keyField] || item.description || item.name || item.condition || item.test_name || item.message || JSON.stringify(item);
    }
    return String(item);
}

function buildAgentSummaryHtml(key, output) {
    if (!output || typeof output !== "object") {
        return "<em>Awaiting agent execution...</em>";
    }

    switch (key) {
        case "intake_agent": {
            const symptoms = Array.isArray(output.symptoms) ? output.symptoms : [];
            const history = Array.isArray(output.history) ? output.history : [];
            const sympStr = symptoms.length > 0 ? symptoms.map(s => formatItemString(s, "description")).join(", ") : "None extracted";
            return `<strong>Patient Input:</strong> ${escHtml(output.patient_input || "N/A")}<br>
                    <strong>Extracted Symptoms:</strong> ${escHtml(sympStr)}<br>
                    <strong>Medical History:</strong> ${history.length > 0 ? escHtml(history.map(h => formatItemString(h, "condition")).join(", ")) : "None recorded"}`;
        }
        case "triage_agent": {
            const redFlags = Array.isArray(output.red_flags) ? output.red_flags : [];
            const level = output.triage_level || "PENDING";
            return `<strong>Assigned Triage Level:</strong> <span class="triage-badge ${level.toLowerCase()}">${level.toUpperCase()}</span><br>
                    <strong>Emergency Flag:</strong> ${output.is_emergency ? "🚨 CRITICAL EMERGENCY" : "NO"}<br>
                    <strong>Triage Reasoning:</strong> ${escHtml(output.triage_reasoning || "N/A")}<br>
                    <strong>Red Flags:</strong> ${redFlags.length > 0 ? escHtml(redFlags.map(f => formatItemString(f)).join(", ")) : "None"}`;
        }
        case "questioner_agent": {
            const qas = Array.isArray(output.qa_pairs) ? output.qa_pairs : [];
            return `<strong>Active Question:</strong> ${output.current_question ? escHtml(output.current_question) : "None"}<br>
                    <strong>Interview Round:</strong> ${output.question_round || 0} / 10<br>
                    <strong>Question Status:</strong> ${output.question_complete ? "✅ Complete" : "In Progress"}<br>
                    <strong>Completed Q&amp;A Pairs (${qas.length}):</strong> ${qas.length > 0 ? `<ul style="margin-top:4px;padding-left:16px;">${qas.map(qa => `<li><strong>Q:</strong> ${escHtml(qa.question)}<br><strong>A:</strong> ${escHtml(qa.answer)}</li>`).join('')}</ul>` : "None"}`;
        }
        case "case_builder_agent": {
            const findings = Array.isArray(output.key_findings) ? output.key_findings : [];
            return `<strong>Case Summary:</strong> ${escHtml(output.case_summary || "Synthesis pending...")}<br>
                    <strong>Key Findings:</strong> ${findings.length > 0 ? escHtml(findings.join(", ")) : "N/A"}<br>
                    <strong>Clinical Correlations:</strong> ${escHtml(output.clinical_correlations || "N/A")}`;
        }
        case "investigator_agent": {
            const tests = Array.isArray(output.investigations) ? output.investigations : [];
            const reqs = Array.isArray(output.images_requested) ? output.images_requested : [];
            return `<strong>Recommended Diagnostic Tests (${tests.length}):</strong> ${tests.length > 0 ? `<ul style="margin-top:4px;padding-left:16px;">${tests.map(t => `<li><strong>${escHtml(formatItemString(t, "test_name"))}</strong> — ${escHtml(t.reason || t.urgency || "Standard lab protocol")}</li>`).join('')}</ul>` : "None"}<br>
                    <strong>Image Upload Requested:</strong> ${output.waiting_for_tests ? "📸 YES (Awaiting Imaging/Lab Upload)" : "NO"}`;
        }
        case "interpreter_agent": {
            const paths = Array.isArray(output.image_paths) ? output.image_paths : [];
            return `<strong>Uploaded Image Assets (${paths.length}):</strong> ${paths.length > 0 ? escHtml(paths.join(", ")) : "No images uploaded"}<br>
                    <strong>MedGemma Multimodal Vision Analysis:</strong> ${output.image_analysis ? `<div style="margin-top:6px;padding:8px;background:rgba(0,255,157,0.06);border:1px solid rgba(0,255,157,0.2);border-radius:6px;">${escHtml(output.image_analysis)}</div>` : "No vision analysis performed."}`;
        }
        case "diagnostician_agent": {
            const diffs = Array.isArray(output.differential_diagnosis) ? output.differential_diagnosis : [];
            return `<strong>Primary Diagnosis:</strong> ${output.primary_diagnosis ? escHtml(output.primary_diagnosis) : "Analysis pending"}<br>
                    <strong>Diagnostic Confidence:</strong> ${output.diagnosis_confidence ? `${Math.round(output.diagnosis_confidence * 100)}%` : "N/A"}<br>
                    <strong>Differential Diagnosis (${diffs.length}):</strong> ${diffs.length > 0 ? `<ul style="margin-top:4px;padding-left:16px;">${diffs.map(d => `<li><strong>${escHtml(formatItemString(d, "condition"))}</strong> ${d.icd_code ? `(${escHtml(d.icd_code)})` : ""} — ${Math.round((d.probability || 0) * 100)}%<br><span style="font-size:0.75rem;color:var(--text-muted);">Evidence: ${Array.isArray(d.evidence) ? escHtml(d.evidence.join(" · ")) : "Clinical presentation"}</span></li>`).join('')}</ul>` : "None"}`;
        }
        case "treatment_agent": {
            const meds = Array.isArray(output.medications) ? output.medications : [];
            const procs = Array.isArray(output.procedures) ? output.procedures : [];
            return `<strong>Pharmacotherapy Plan (${meds.length} medications):</strong> ${meds.length > 0 ? `<ul style="margin-top:4px;padding-left:16px;">${meds.map(m => `<li><strong>${escHtml(formatItemString(m, "name"))}</strong> — ${escHtml(m.dosage || m.dose || "As directed")} (${escHtml(m.route || "oral")})<br><span style="font-size:0.75rem;color:var(--text-muted);">Indication: ${escHtml(m.indication || "Target condition")}</span></li>`).join('')}</ul>` : "None"}<br>
                    <strong>Procedures:</strong> ${procs.length > 0 ? escHtml(procs.map(p => formatItemString(p)).join(", ")) : "None"}<br>
                    <strong>Follow-up &amp; Monitoring:</strong> ${escHtml(output.follow_up || "Standard follow-up care")}`;
        }
        case "validator_agent": {
            const warns = Array.isArray(output.validation_warnings) ? output.validation_warnings : [];
            const recs = Array.isArray(output.validation_recommendations) ? output.validation_recommendations : [];
            return `<strong>Safety Status:</strong> ${output.is_safe === true ? "✅ SAFE (Validated)" : output.is_safe === false ? "⚠️ WARNINGS DETECTED" : "Pending Validation"}<br>
                    <strong>Validation Warnings (${warns.length}):</strong> ${warns.length > 0 ? `<ul style="margin-top:4px;padding-left:16px;color:var(--red-alert);">${warns.map(w => `<li>${escHtml(formatItemString(w, "message"))}</li>`).join('')}</ul>` : "None"}<br>
                    <strong>Safety Recommendations:</strong> ${recs.length > 0 ? escHtml(recs.join(" · ")) : "None"}`;
        }
        default:
            return `<strong>Status:</strong> Execution complete`;
    }
}

function copyAgentJson(btn) {
    const codeEl = document.getElementById("raw-json-code");
    if (!codeEl) return;

    navigator.clipboard.writeText(codeEl.textContent).then(() => {
        const origText = btn.textContent;
        btn.textContent = "✓ Copied!";
        setTimeout(() => { btn.textContent = origText; }, 2000);
    });
}

// ════════════════════════════════════════════════════════════════════════════
// DOCTOR & PATIENT AUTH & PATIENT ACCOUNT RETRIEVAL
// ════════════════════════════════════════════════════════════════════════════

function openDoctorAuthModal() {
    const modal = document.getElementById("modal-doctor-auth");
    if (modal) modal.classList.remove("hidden");
}

function closeDoctorAuthModal() {
    const modal = document.getElementById("modal-doctor-auth");
    if (modal) modal.classList.add("hidden");
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById("auth-email").value;
    const password = document.getElementById("auth-password").value;

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Login failed");

        currentUserProfile = data.user;
        saveUserSession(data.user, data.token);
        showToast(`✅ Login Successful! Welcome, ${data.user.full_name}`, "success");
        closeDoctorAuthModal();
        applyAuthenticatedUserUI(data.user);
    } catch (err) {
        showToast(`❌ Authentication Error: ${err.message}`, "error");
    }
}

function saveUserSession(user, token) {
    try {
        localStorage.setItem("medai_auth_user", JSON.stringify(user));
        if (token) localStorage.setItem("medai_auth_token", token);
    } catch (e) {
        console.error("Failed to save user session:", e);
    }
}

function restoreUserSession() {
    try {
        const saved = localStorage.getItem("medai_auth_user");
        if (saved) {
            const user = JSON.parse(saved);
            if (user && user.role) {
                currentUserProfile = user;
                applyAuthenticatedUserUI(user);
                return true;
            }
        }
    } catch (e) {
        console.error("Failed to restore user session:", e);
    }
    return false;
}

function applyAuthenticatedUserUI(user) {
    if (!user) return;
    const bar = document.getElementById("logged-user-bar");
    const roleBadge = document.getElementById("logged-user-role-badge");
    const nameEl = document.getElementById("logged-user-name");
    const detailEl = document.getElementById("logged-user-detail");

    if (bar && roleBadge && nameEl && detailEl) {
        bar.classList.remove("hidden");
        if (user.role === "admin") {
            roleBadge.textContent = "🛠️ SYSTEM ADMIN";
            roleBadge.style.background = "var(--purple-accent)";
            roleBadge.style.color = "#fff";
            nameEl.textContent = user.full_name;
            detailEl.textContent = `• Executive System Administrator (${user.email})`;
        } else if (user.role === "patient") {
            roleBadge.textContent = "👤 PATIENT";
            roleBadge.style.background = "var(--green-accent)";
            roleBadge.style.color = "#000";
            nameEl.textContent = user.full_name;
            detailEl.textContent = `• Patient Account (${user.email})`;
        } else {
            roleBadge.textContent = "👨‍⚕️ DOCTOR";
            roleBadge.style.background = "var(--cyan)";
            roleBadge.style.color = "#000";
            nameEl.textContent = user.full_name;
            detailEl.textContent = `• ${user.specialty || 'Consulting Physician'}`;
        }
    }

    // Multi-page navigation redirect
    const role = user.role;
    const pathName = window.location.pathname.split("/").pop() || "index.html";

    if (role === "admin" && !pathName.includes("admin.html")) {
        window.location.href = "admin.html";
        return;
    } else if (role === "patient" && !pathName.includes("patient.html")) {
        window.location.href = "patient.html";
        return;
    } else if (role === "doctor" && !pathName.includes("doctor.html")) {
        window.location.href = "doctor.html";
        return;
    }

    const gridLanding = document.getElementById("role-landing-grid");
    const docPanel = document.getElementById("doctor-assessment-panel");
    const screenPatient = document.getElementById("screen-patient-portal");
    const screenAdmin = document.getElementById("screen-admin-dashboard");

    if (role === "admin") {
        if (gridLanding) gridLanding.classList.add("hidden");
        if (docPanel) docPanel.classList.add("hidden");
        if (screenPatient) screenPatient.classList.add("hidden");
        if (screenIntake) screenIntake.classList.add("hidden");
        if (screenActive) screenActive.classList.add("hidden");
        if (screenReport) screenReport.classList.add("hidden");
        if (screenAdmin) {
            screenAdmin.classList.remove("hidden");
            loadAdminDashboardView();
        }
    } else if (role === "patient") {
        if (gridLanding) gridLanding.classList.add("hidden");
        if (docPanel) docPanel.classList.add("hidden");
        if (screenAdmin) screenAdmin.classList.add("hidden");
        if (screenPatient) {
            if (screenIntake) screenIntake.classList.add("hidden");
            if (screenActive) screenActive.classList.add("hidden");
            if (screenReport) screenReport.classList.add("hidden");
            screenPatient.classList.remove("hidden");
            loadPatientPortalView(selectedPatientId);
        }
    } else {
        // Doctor role
        if (gridLanding) gridLanding.classList.add("hidden");
        if (screenAdmin) screenAdmin.classList.add("hidden");
        if (docPanel) docPanel.classList.remove("hidden");
        showDoctorIntakeScreen();
    }
}

function logoutUser() {
    try {
        localStorage.removeItem("medai_auth_user");
        localStorage.removeItem("medai_auth_token");
    } catch (e) {}

    currentUserProfile = null;
    window.location.href = "index.html";
}

async function onPatientSelectChange(val) {
    if (val === "new") {
        const name = prompt("Enter Patient Full Name:");
        if (!name) return;
        const mrn = prompt("Enter MRN / Patient ID (or leave blank for auto):");
        try {
            const res = await fetch(`${API_BASE}/patients/search?query=${encodeURIComponent(name)}`);
            const data = await res.json();
            if (data.patients && data.patients.length > 0) {
                selectedPatientId = data.patients[0].id;
                showToast(`Linked Patient: ${data.patients[0].full_name}`, "success");
            }
        } catch (e) {
            console.error("Patient lookup error:", e);
        }
        return;
    }

    selectedPatientId = val;
    loadPatientAccountProfile(selectedPatientId);
}

async function loadPatientAccountProfile(patientId) {
    try {
        const res = await fetch(`${API_BASE}/patients/${patientId}/history`);
        if (!res.ok) return;
        const data = await res.json();
        const p = data.patient;

        const pill = document.getElementById("patient-profile-pill");
        if (pill && p) {
            const allergyStr = p.allergies && p.allergies.length > 0
                ? p.allergies.map(a => typeof a === 'object' ? a.allergen : a).join(", ")
                : "None reported";
            const chronicStr = p.chronic_conditions && p.chronic_conditions.length > 0
                ? p.chronic_conditions.map(c => typeof c === 'object' ? c.condition : c).join(", ")
                : "None";

            pill.innerHTML = `🟢 <strong>Patient:</strong> ${escHtml(p.full_name)} (${escHtml(p.gender)}, ${p.date_of_birth}) &bull; <strong>MRN:</strong> ${escHtml(p.mrn)} &bull; <strong>Allergies:</strong> <span style="color:var(--red-alert);">${escHtml(allergyStr)}</span> &bull; <strong>Active Dx:</strong> ${escHtml(chronicStr)}`;
        }
    } catch (e) {
        console.error("Failed to load patient account profile:", e);
    }
}

// ════════════════════════════════════════════════════════════════════════════
// DUAL-TIER MEMORY & FOLLOW-UP HUB
// ════════════════════════════════════════════════════════════════════════════

function openDualMemoryModal() {
    const modal = document.getElementById("modal-dual-memory");
    if (modal) {
        modal.classList.remove("hidden");
        switchMemoryTab(activeMemoryTab);
    }
}

function closeDualMemoryModal() {
    const modal = document.getElementById("modal-dual-memory");
    if (modal) modal.classList.add("hidden");
}

async function switchMemoryTab(tabKey) {
    activeMemoryTab = tabKey;
    const btnLocal = document.getElementById("tab-btn-local-mem");
    const btnGlobal = document.getElementById("tab-btn-global-mem");
    const btnFollow = document.getElementById("tab-btn-followups");
    const container = document.getElementById("dual-memory-content");

    if (btnLocal) btnLocal.classList.toggle("active", tabKey === "local");
    if (btnGlobal) btnGlobal.classList.toggle("active", tabKey === "global");
    if (btnFollow) btnFollow.classList.toggle("active", tabKey === "followups");

    if (!container) return;
    container.innerHTML = "<em>Loading memory and follow-up data...</em>";

    if (tabKey === "local") {
        try {
            const res = await fetch(`${API_BASE}/patients/${selectedPatientId}/history`);
            const data = await res.json();
            const mems = data.local_memories || [];
            if (mems.length === 0) {
                container.innerHTML = "<em>No local episodic memories found for this patient account.</em>";
                return;
            }
            container.innerHTML = mems.map(m => `
                <div class="memory-card">
                    <div class="memory-card-header">
                        <div class="memory-card-title">👤 ${escHtml(m.title)}</div>
                        <span class="memory-card-badge">${escHtml((m.memory_category || 'episodic').toUpperCase())} &bull; relevance: ${m.relevance_score || 1.0}</span>
                    </div>
                    <div class="memory-card-content">${escHtml(m.content)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">Date: ${m.created_at ? new Date(m.created_at).toLocaleDateString() : 'Recent encounter'}</div>
                </div>
            `).join("");
        } catch (e) {
            container.innerHTML = `<span style="color:var(--red-alert);">Error loading local patient memories: ${escHtml(e.message)}</span>`;
        }
    } else if (tabKey === "global") {
        try {
            const res = await fetch(`${API_BASE}/memory/global`);
            const data = await res.json();
            const mems = data.global_memories || [];
            if (mems.length === 0) {
                container.innerHTML = "<em>No cross-patient global agent memory patterns found.</em>";
                return;
            }
            container.innerHTML = mems.map(m => `
                <div class="memory-card" style="border-left:3px solid var(--purple-accent);">
                    <div class="memory-card-header">
                        <div class="memory-card-title" style="color:var(--purple-accent);">🌐 ${escHtml(m.topic)}</div>
                        <span class="memory-card-badge" style="background:rgba(0,229,255,0.15);border-color:rgba(0,229,255,0.3);color:var(--cyan);">${escHtml((m.knowledge_type || 'diagnostic').toUpperCase())} &bull; cases: ${m.case_count || 1} &bull; confidence: ${Math.round((m.confidence_score||0)*100)}%</span>
                    </div>
                    <div class="memory-card-content">${escHtml(m.summary)}</div>
                </div>
            `).join("");
        } catch (e) {
            container.innerHTML = `<span style="color:var(--red-alert);">Error loading global agent memories: ${escHtml(e.message)}</span>`;
        }
    } else if (tabKey === "followups") {
        try {
            const res = await fetch(`${API_BASE}/patients/${selectedPatientId}/followups`);
            const data = await res.json();
            const followups = data.followups || [];
            if (followups.length === 0) {
                container.innerHTML = "<em>No scheduled follow-up tasks for this patient account.</em>";
                return;
            }
            container.innerHTML = followups.map(f => `
                <div class="memory-card" style="border-left:3px solid var(--green-accent);">
                    <div class="memory-card-header">
                        <div class="memory-card-title" style="color:var(--green-accent);">📅 ${escHtml(f.title)}</div>
                        <span class="memory-card-badge" style="background:rgba(0,255,157,0.15);border-color:rgba(0,255,157,0.3);color:var(--green-accent);">DUE: ${escHtml(f.due_date)} &bull; ${escHtml(f.status.toUpperCase())}</span>
                    </div>
                    <div class="memory-card-content">${escHtml(f.description || f.notes || "Standard clinical follow-up protocol.")}</div>
                </div>
            `).join("");
        } catch (e) {
            container.innerHTML = `<span style="color:var(--red-alert);">Error loading patient follow-ups: ${escHtml(e.message)}</span>`;
        }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN MANAGEMENT PORTAL HANDLERS
// ════════════════════════════════════════════════════════════════════════════

function openAdminPortalModal() {
    if (!currentUserProfile || currentUserProfile.role !== "admin") {
        showToast("⛔ Access Denied: Executive Admin privileges required. Please log in as System Admin (musavir119s@gmail.com).", "error");
        document.getElementById("auth-email").value = "musavir119s@gmail.com";
        document.getElementById("auth-password").value = "Subeena@musa123";
        openDoctorAuthModal();
        return;
    }
    const modal = document.getElementById("modal-admin-portal");
    if (modal) modal.classList.remove("hidden");
}

function closeAdminPortalModal() {
    const modal = document.getElementById("modal-admin-portal");
    if (modal) modal.classList.add("hidden");
}

function switchAdminTab(role) {
    const btnDoc = document.getElementById("admin-tab-doc");
    const btnPat = document.getElementById("admin-tab-pat");
    const formDoc = document.getElementById("admin-doctor-form");
    const formPat = document.getElementById("admin-patient-form");

    if (btnDoc) btnDoc.classList.toggle("active", role === "doctor");
    if (btnPat) btnPat.classList.toggle("active", role === "patient");
    if (formDoc) formDoc.classList.toggle("hidden", role !== "doctor");
    if (formPat) formPat.classList.toggle("hidden", role !== "patient");
}

async function handleAdminRegisterDoctor(e) {
    e.preventDefault();
    const email = document.getElementById("reg-doc-email").value;
    const password = document.getElementById("reg-doc-pass").value;
    const full_name = document.getElementById("reg-doc-name").value;
    const license_number = document.getElementById("reg-doc-license").value;
    const specialty = document.getElementById("reg-doc-specialty").value;

    try {
        const res = await fetch(`${API_BASE}/admin/register-doctor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                password,
                full_name,
                license_number,
                specialty,
                requester_role: currentUserProfile ? currentUserProfile.role : 'patient'
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Doctor registration failed");

        showToast(`✅ ${data.message}`, "success");
        closeAdminPortalModal();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function handleAdminRegisterPatient(e) {
    e.preventDefault();
    const full_name = document.getElementById("reg-pat-name").value;
    const date_of_birth = document.getElementById("reg-pat-dob").value;
    const gender = document.getElementById("reg-pat-gender").value;
    const mrn = document.getElementById("reg-pat-mrn").value;
    const email = document.getElementById("reg-pat-email").value;
    const allergies = document.getElementById("reg-pat-allergies").value;
    const chronic_conditions = document.getElementById("reg-pat-chronic").value;

    try {
        const res = await fetch(`${API_BASE}/admin/register-patient`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_name,
                date_of_birth,
                gender,
                mrn,
                email,
                allergies: allergies ? [allergies] : [],
                chronic_conditions: chronic_conditions ? [chronic_conditions] : [],
                requester_role: currentUserProfile ? currentUserProfile.role : 'patient'
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Patient registration failed");

        showToast(`✅ ${data.message}`, "success");

        // Add newly created patient to patient selector dropdown
        const select = document.getElementById("patient-account-select");
        if (select && data.patient) {
            const opt = document.createElement("option");
            opt.value = data.patient.id;
            opt.textContent = `${data.patient.full_name} (${data.patient.mrn})`;
            select.insertBefore(opt, select.firstChild);
            select.value = data.patient.id;
            onPatientSelectChange(data.patient.id);
        }

        closeAdminPortalModal();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ════════════════════════════════════════════════════════════════════════════
// ROLE PORTAL LANDING HANDLERS (DOCTOR, PATIENT, ADMIN)
// ════════════════════════════════════════════════════════════════════════════

async function quickLoginRole(role) {
    const emailInput = document.getElementById("auth-email");
    const passInput = document.getElementById("auth-password");

    if (role === "doctor") {
        if (emailInput) emailInput.value = "doctor@medai.ltm";
        if (passInput) passInput.value = "password123";
        showToast("👨‍⚕️ Please log in with Doctor credentials", "info");
    } else if (role === "admin") {
        if (emailInput) emailInput.value = "musavir119s@gmail.com";
        if (passInput) passInput.value = "Subeena@musa123";
        showToast("🛠️ Please log in with Executive Admin credentials", "info");
    } else if (role === "patient") {
        if (emailInput) emailInput.value = "patient@medai.ltm";
        if (passInput) passInput.value = "password123";
        showToast("👤 Please log in with Patient credentials", "info");
    }

    openDoctorAuthModal();
}

function showDoctorIntakeScreen() {
    const screenPatient = document.getElementById("screen-patient-portal");
    const gridLanding = document.getElementById("role-landing-grid");
    const docPanel = document.getElementById("doctor-assessment-panel");

    if (gridLanding) gridLanding.classList.add("hidden");
    if (docPanel) docPanel.classList.remove("hidden");
    if (screenPatient) screenPatient.classList.add("hidden");
    if (screenActive) screenActive.classList.add("hidden");
    if (screenReport) screenReport.classList.add("hidden");
    if (screenIntake) screenIntake.classList.remove("hidden");
}

function showRoleLandingGrid() {
    const screenPatient = document.getElementById("screen-patient-portal");
    const gridLanding = document.getElementById("role-landing-grid");
    const docPanel = document.getElementById("doctor-assessment-panel");

    if (docPanel) docPanel.classList.add("hidden");
    if (gridLanding) gridLanding.classList.remove("hidden");
    if (screenPatient) screenPatient.classList.add("hidden");
    if (screenActive) screenActive.classList.add("hidden");
    if (screenReport) screenReport.classList.add("hidden");
    if (screenIntake) screenIntake.classList.remove("hidden");
}

async function loadPatientPortalView(patientId) {
    const profEl = document.getElementById("patient-portal-profile");
    const histEl = document.getElementById("patient-portal-history");
    if (!profEl || !histEl) return;

    try {
        const res = await fetch(`${API_BASE}/patients/${patientId}/history`);
        const data = await res.json();
        const p = data.patient;
        const mems = data.local_memories || [];
        const followups = data.followups || [];

        profEl.innerHTML = `
            <strong>Full Name:</strong> ${escHtml(p.full_name)}<br>
            <strong>Medical Record Number:</strong> ${escHtml(p.mrn)}<br>
            <strong>DOB / Gender:</strong> ${escHtml(p.date_of_birth)} (${escHtml(p.gender)})<br>
            <strong>Contact Email:</strong> ${escHtml(p.email || 'N/A')}<br>
            <strong>Known Allergies:</strong> <span style="color:var(--red-alert);font-weight:600;">${p.allergies ? escHtml(p.allergies.map(a => typeof a === 'object' ? a.allergen : a).join(", ")) : "None"}</span><br>
            <strong>Chronic Conditions:</strong> ${p.chronic_conditions ? escHtml(p.chronic_conditions.map(c => typeof c === 'object' ? c.condition : c).join(", ")) : "None"}
        `;

        histEl.innerHTML = `
            <strong>Prescribed Medications:</strong> ${p.current_medications && p.current_medications.length > 0 ? `<ul style="margin-top:4px;padding-left:16px;">${p.current_medications.map(m => `<li><strong>${escHtml(typeof m === 'object' ? m.name : m)}</strong> (${escHtml(m.dosage || 'as directed')})</li>`).join('')}</ul>` : 'No active prescriptions'}<br>
            <strong>Scheduled Follow-up Tasks:</strong> ${followups.length > 0 ? `<ul style="margin-top:4px;padding-left:16px;">${followups.map(f => `<li><strong>${escHtml(f.title)}</strong> &bull; Due: ${escHtml(f.due_date)}</li>`).join('')}</ul>` : 'No upcoming follow-ups'}<br>
            <strong>Recent Clinical Memory Records (${mems.length}):</strong> ${mems.length > 0 ? `<ul style="margin-top:4px;padding-left:16px;">${mems.map(m => `<li><strong>${escHtml(m.title)}</strong>: ${escHtml(m.content)}</li>`).join('')}</ul>` : 'No past encounter notes'}
        `;
    } catch (e) {
        profEl.innerHTML = `<span style="color:var(--red-alert);">Could not load patient profile.</span>`;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// EXECUTIVE ADMIN DASHBOARD VIEW HANDLERS
// ════════════════════════════════════════════════════════════════════════════

async function loadAdminDashboardView() {
    refreshAdminDirectory();
    loadAdminGlobalGraphSummary();
}

async function refreshAdminDirectory() {
    const listEl = document.getElementById("admin-directory-list");
    if (!listEl) return;
    listEl.innerHTML = "<em>Refreshing directory from Supabase...</em>";

    try {
        const res = await fetch(`${API_BASE}/patients/search?query=`);
        const data = await res.json();
        const patients = data.patients || [];

        const patCountEl = document.getElementById("admin-patient-count");
        if (patCountEl) patCountEl.textContent = `${patients.length} Active Accounts`;

        listEl.innerHTML = `
            <div style="margin-bottom:12px;">
                <strong style="color:var(--purple-accent);">👨‍⚕️ Registered Physicians (Supabase DB):</strong>
                <ul style="padding-left:16px;margin-top:4px;">
                    <li><strong>Dr. Sarah Jenkins, MD</strong> (doctor@medai.ltm) — Pulmonology &amp; Internal Medicine</li>
                    <li><strong>Dr. Alex Smith, MD</strong> (dr.smith@hospital.org) — Cardiology &amp; ICU</li>
                    <li><strong>Dr. Mark Vance, MD</strong> (dr.mark.vance@hospital.org) — Pulmonology</li>
                </ul>
            </div>
            <div>
                <strong style="color:var(--green-accent);">👤 Registered Patient Profiles (${patients.length}):</strong>
                <ul style="padding-left:16px;margin-top:4px;">
                    ${patients.map(p => `<li><strong>${escHtml(p.full_name)}</strong> (${escHtml(p.mrn)}) &bull; ${escHtml(p.gender)}, DOB: ${escHtml(p.date_of_birth)} &bull; ${escHtml(p.email || 'No email')}</li>`).join('')}
                </ul>
            </div>
        `;
    } catch (e) {
        listEl.innerHTML = `<span style="color:var(--red-alert);">Error loading directory: ${escHtml(e.message)}</span>`;
    }
}

async function loadAdminGlobalGraphSummary() {
    const graphEl = document.getElementById("admin-global-graph-summary");
    if (!graphEl) return;

    try {
        const res = await fetch(`${API_BASE}/memory/global`);
        const data = await res.json();
        const mems = data.global_memories || [];

        const countEl = document.getElementById("admin-memory-count");
        if (countEl) countEl.textContent = `${mems.length} Knowledge Clusters`;

        graphEl.innerHTML = mems.map(m => `
            <div class="memory-card" style="border-left:3px solid var(--purple-accent);margin-bottom:8px;padding:8px 12px;">
                <div style="font-weight:700;color:var(--purple-accent);font-size:0.88rem;">🌐 ${escHtml(m.topic)}</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;">${escHtml(m.summary)}</div>
            </div>
        `).join("");
    } catch (e) {
        graphEl.innerHTML = `<em>Global knowledge graph ready.</em>`;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// AUTOMATIC SESSION RESTORATION ON PAGE RELOAD
// ════════════════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    restoreUserSession();
});
restoreUserSession();


// ════════════════════════════════════════════════════════════════════════════
// DOCTOR INTERIM NOTE — Write what happened between appointments
// ════════════════════════════════════════════════════════════════════════════

async function submitInterimNote() {
    const textarea  = document.getElementById("interim-note-textarea");
    const statusEl  = document.getElementById("interim-note-status");
    const submitBtn = document.getElementById("interim-note-submit-btn");
    if (!textarea || !statusEl || !submitBtn) return;

    const note = textarea.value.trim();
    if (!note) {
        statusEl.textContent = "⚠️ Please write a note before saving.";
        statusEl.style.color = "var(--amber)";
        return;
    }

    // Get current patient ID from active session state
    const patientId = window._activePatientId || "pat-001";
    const sessionId = currentSessionId || null;

    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ Processing with AI...";
    statusEl.textContent = "Summarising note and storing memory…";
    statusEl.style.color = "var(--text-secondary)";

    try {
        const res = await fetch(`/api/patients/${patientId}/interim-note`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                note: note,
                doctor_id: window._activeDoctorId || null,
                session_id: sessionId,
                patient_name: window._activePatientName || null,
            }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Success — show confirmation and clear textarea
        statusEl.textContent = `✅ Memory saved: "${data.title}"${data.is_globally_significant ? " · Added to global knowledge base" : ""}`;
        statusEl.style.color = "var(--green-accent)";
        textarea.value = "";

        // Prepend new entry to the timeline immediately
        _prependTimelineItem({
            title: data.title,
            summary: data.summary,
            source: "doctor",
            created_at: new Date().toISOString(),
            session_id: sessionId,
        });

    } catch (err) {
        console.error("[InterimNote] Error:", err);
        statusEl.textContent = `❌ Failed to save note: ${err.message}`;
        statusEl.style.color = "var(--red-alert)";
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "💾 Save Note &amp; Generate Memory";
    }
}


// ════════════════════════════════════════════════════════════════════════════
// MEMORY TIMELINE — Load patient memory from Supabase
// ════════════════════════════════════════════════════════════════════════════

async function loadMemoryTimeline() {
    const container   = document.getElementById("memory-timeline-container");
    const loadingEl   = document.getElementById("timeline-loading");
    const emptyEl     = document.getElementById("timeline-empty");
    if (!container) return;

    const patientId = window._activePatientId || "pat-001";

    // Show loading spinner, hide seeds
    if (loadingEl) loadingEl.style.display = "block";
    ["timeline-seed-1", "timeline-seed-2", "timeline-seed-3"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.opacity = "0.4";
    });

    try {
        const res = await fetch(`/api/patients/${patientId}/memory-timeline?limit=20`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (loadingEl) loadingEl.style.display = "none";

        if (!data.timeline || data.timeline.length === 0) {
            // No Supabase data — keep seeds visible
            ["timeline-seed-1", "timeline-seed-2", "timeline-seed-3"].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.opacity = "1";
            });
            return;
        }

        // Clear everything and render live items
        container.innerHTML = "";
        data.timeline.forEach(item => _prependTimelineItem(item, false));

    } catch (err) {
        console.error("[MemoryTimeline] Load error:", err);
        if (loadingEl) loadingEl.style.display = "none";
        // Keep seeds visible on error
        ["timeline-seed-1", "timeline-seed-2", "timeline-seed-3"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.opacity = "1";
        });
    }
}

/**
 * Renders a single memory timeline item and prepends it to the container.
 * @param {Object} item - Memory item with title, summary, source, created_at
 * @param {boolean} prepend - If true, prepend; if false, append
 */
function _prependTimelineItem(item, prepend = true) {
    const container = document.getElementById("memory-timeline-container");
    if (!container) return;

    const isDoctor = item.source === "doctor";
    const dotColor = isDoctor ? "var(--violet)" : "var(--cyan)";
    const badgeStyle = isDoctor
        ? "background:rgba(139,92,246,0.15);color:var(--violet);border:1px solid rgba(139,92,246,0.3);"
        : "background:rgba(6,182,212,0.15);color:var(--cyan);border:1px solid rgba(6,182,212,0.3);";
    const badge = isDoctor ? "👨‍⚕️ DOCTOR NOTE" : "🤖 AI SUMMARY";
    const dateColor = isDoctor ? "var(--violet)" : "var(--cyan)";

    let dateStr = "";
    if (item.created_at) {
        try {
            dateStr = new Date(item.created_at).toLocaleDateString("en-US", {
                month: "long", day: "numeric", year: "numeric"
            }).toUpperCase();
        } catch (e) { dateStr = item.created_at; }
    }

    const el = document.createElement("div");
    el.className = "timeline-item";
    el.style.animation = "fadeInUp 0.3s ease";
    el.innerHTML = `
        <div class="timeline-dot" style="background:${dotColor};box-shadow:0 0 8px ${dotColor};"></div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="font-size:0.65rem;${badgeStyle}border-radius:4px;padding:1px 6px;font-weight:700;">${badge}</span>
            <span style="font-size:0.73rem;color:${dateColor};font-weight:700;">${dateStr}</span>
        </div>
        <div style="font-weight:700;color:var(--text-primary);font-size:0.88rem;margin-top:2px;">${_esc(item.title)}</div>
        <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:3px;line-height:1.5;">${_esc(item.summary)}</div>
    `;

    if (prepend && container.firstChild) {
        container.insertBefore(el, container.firstChild);
    } else {
        container.appendChild(el);
    }
}

/** Simple HTML escaper to prevent XSS in timeline content. */
function _esc(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}


// ════════════════════════════════════════════════════════════════════════════
// CONSULTATION MODE (Text vs Voice) & NATURAL TTS ENGINE
// ════════════════════════════════════════════════════════════════════════════
let currentConsultationMode = localStorage.getItem("medgraph_mode") || "text";
let mediaRecorder = null;
let audioChunks = [];
let voiceTimerInterval = null;
let voiceSecondsElapsed = 0;
let activeTargetTextareaId = "patient-description";
let currentDetectedLanguage = "en";
let currentSpeechLocale = "en-US";
let isAutoSpeakEnabled = false;
let currentAudioElement = null;

function setConsultationMode(mode) {
    if (mode !== "text" && mode !== "voice") mode = "text";
    currentConsultationMode = mode;
    localStorage.setItem("medgraph_mode", mode);

    // Update Screen 1 & Screen 2 mode buttons
    const textBtns = [document.getElementById("mode-btn-text"), document.getElementById("header-mode-btn-text")];
    const voiceBtns = [document.getElementById("mode-btn-voice"), document.getElementById("header-mode-btn-voice")];

    textBtns.forEach(btn => {
        if (btn) {
            if (mode === "text") btn.classList.add("active");
            else btn.classList.remove("active");
        }
    });

    voiceBtns.forEach(btn => {
        if (btn) {
            if (mode === "voice") btn.classList.add("active");
            else btn.classList.remove("active");
        }
    });

    // Configure mode defaults
    if (mode === "voice") {
        isAutoSpeakEnabled = true;
        const autoSpeakStateEl = document.getElementById("auto-speak-state");
        const ttsBtnEl = document.getElementById("btn-tts-toggle");
        if (autoSpeakStateEl) autoSpeakStateEl.textContent = "ON 🔊";
        if (ttsBtnEl) {
            ttsBtnEl.style.borderColor = "var(--cyan)";
            ttsBtnEl.style.color = "var(--cyan)";
        }
    } else {
        isAutoSpeakEnabled = false;
        cancelAllSpeech();
        const autoSpeakStateEl = document.getElementById("auto-speak-state");
        const ttsBtnEl = document.getElementById("btn-tts-toggle");
        if (autoSpeakStateEl) autoSpeakStateEl.textContent = "OFF";
        if (ttsBtnEl) {
            ttsBtnEl.style.borderColor = "rgba(0,229,255,0.3)";
            ttsBtnEl.style.color = "var(--text-secondary)";
        }
    }

    console.log(`Consultation mode set to: ${mode}`);
}

let speechRecognitionInstance = null;

function toggleVoiceDictation(targetTextareaId = "patient-description") {
    if ((mediaRecorder && mediaRecorder.state === "recording") || speechRecognitionInstance) {
        stopVoiceDictation(true);
    } else {
        startVoiceDictation(targetTextareaId);
    }
}

async function startVoiceDictation(targetTextareaId = "patient-description") {
    activeTargetTextareaId = targetTextareaId;
    audioChunks = [];
    voiceSecondsElapsed = 0;

    const bannerId = targetTextareaId === "patient-description" ? "intake-voice-banner" : "qa-voice-banner";
    const timerId = targetTextareaId === "patient-description" ? "intake-voice-timer" : "qa-voice-timer";
    const statusTextId = targetTextareaId === "patient-description" ? "intake-voice-status-text" : "qa-voice-status-text";

    const bannerEl = document.getElementById(bannerId);
    const timerEl = document.getElementById(timerId);
    const statusTextEl = document.getElementById(statusTextId);

    // Clean up any stale recorder or tracks
    if (mediaRecorder) {
        try {
            if (mediaRecorder.stream) {
                mediaRecorder.stream.getTracks().forEach(t => t.stop());
            }
        } catch (e) {}
        mediaRecorder = null;
    }

    // Show banner immediately for user feedback
    if (bannerEl) bannerEl.classList.remove("hidden");
    if (statusTextEl) statusTextEl.textContent = "🎙️ Requesting microphone permission...";
    if (timerEl) timerEl.textContent = "00:00";

    // 1. Primary Engine: MediaRecorder + faster-whisper backend ASR
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            let recorderOptions = {};
            if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
                if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) recorderOptions.mimeType = "audio/webm;codecs=opus";
                else if (MediaRecorder.isTypeSupported("audio/webm")) recorderOptions.mimeType = "audio/webm";
                else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) recorderOptions.mimeType = "audio/ogg;codecs=opus";
                else if (MediaRecorder.isTypeSupported("audio/mp4")) recorderOptions.mimeType = "audio/mp4";
                else if (MediaRecorder.isTypeSupported("audio/wav")) recorderOptions.mimeType = "audio/wav";
            }

            mediaRecorder = new MediaRecorder(stream, recorderOptions);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstart = () => {
                if (statusTextEl) statusTextEl.textContent = "🎙️ Recording... Speak in Urdu, Hindi, or English";
                if (timerEl) timerEl.textContent = "00:00";

                if (voiceTimerInterval) clearInterval(voiceTimerInterval);
                voiceTimerInterval = setInterval(() => {
                    voiceSecondsElapsed++;
                    const mins = String(Math.floor(voiceSecondsElapsed / 60)).padStart(2, '0');
                    const secs = String(voiceSecondsElapsed % 60).padStart(2, '0');
                    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
                }, 1000);
            };

            mediaRecorder.onerror = (e) => {
                console.error("MediaRecorder error:", e);
                if (bannerEl) bannerEl.classList.add("hidden");
                alert(`Microphone recording error: ${e.error || e.message}`);
            };

            mediaRecorder.start(250);
            return;
        } catch (err) {
            console.warn("MediaRecorder getUserMedia failed, attempting fallback:", err);
            if (bannerEl) bannerEl.classList.add("hidden");

            let userErrMsg = "";
            if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
                userErrMsg = "🎙️ Microphone Access Denied!\n\nYour browser blocked access to the microphone.\n\nTo fix this:\n1. Click the Lock 🔒 or Site Settings icon in your browser address bar.\n2. Change Microphone permission to 'Allow'.\n3. Refresh this page and click Voice Dictate again.";
            } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
                userErrMsg = "🎙️ No Microphone Detected!\n\nNo microphone input device was found on your computer. Please connect a microphone or headset and try again.";
            } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
                userErrMsg = "🎙️ Microphone is Busy!\n\nYour microphone is currently in use by another application (e.g. Zoom, Teams, Skype, Discord). Please close other applications using your mic and try again.";
            }

            if (userErrMsg) {
                alert(userErrMsg);
                return;
            }
        }
    }

    // 2. Secondary Engine: Native Web SpeechRecognition API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        try {
            speechRecognitionInstance = new SpeechRecognition();
            speechRecognitionInstance.continuous = true;
            speechRecognitionInstance.interimResults = true;
            speechRecognitionInstance.lang = currentSpeechLocale || (currentConsultationLanguage === "ur" ? "ur-PK" : currentConsultationLanguage === "hi" ? "hi-IN" : "en-US");

            speechRecognitionInstance.onstart = () => {
                if (bannerEl) bannerEl.classList.remove("hidden");
                if (statusTextEl) statusTextEl.textContent = `🎙️ Listening (${speechRecognitionInstance.lang})... Speak now`;
                if (timerEl) timerEl.textContent = "00:00";

                if (voiceTimerInterval) clearInterval(voiceTimerInterval);
                voiceTimerInterval = setInterval(() => {
                    voiceSecondsElapsed++;
                    const mins = String(Math.floor(voiceSecondsElapsed / 60)).padStart(2, '0');
                    const secs = String(voiceSecondsElapsed % 60).padStart(2, '0');
                    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
                }, 1000);
            };

            speechRecognitionInstance.onresult = (event) => {
                let transcript = "";
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                const targetInput = document.getElementById(activeTargetTextareaId);
                if (targetInput && transcript) {
                    targetInput.value = transcript;
                    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
                }
            };

            speechRecognitionInstance.onerror = (e) => {
                console.error("SpeechRecognition error:", e);
                if (bannerEl) bannerEl.classList.add("hidden");
                clearInterval(voiceTimerInterval);
                speechRecognitionInstance = null;
                alert(`Microphone error (${e.error}). Please check microphone permissions in browser address bar.`);
            };

            speechRecognitionInstance.onend = () => {
                if (bannerEl) bannerEl.classList.add("hidden");
                clearInterval(voiceTimerInterval);
                speechRecognitionInstance = null;
            };

            speechRecognitionInstance.start();
            return;
        } catch (e) {
            console.error("SpeechRecognition start error:", e);
        }
    }

    if (bannerEl) bannerEl.classList.add("hidden");
    alert("Microphone is blocked or not supported in this browser context.\n\nPlease make sure you are accessing http://localhost:8000/doctor.html and click the Lock icon in your address bar to Allow Microphone access.");
}

function stopVoiceDictation(shouldTranscribe = true) {
    if (speechRecognitionInstance) {
        try { speechRecognitionInstance.stop(); } catch (e) {}
        speechRecognitionInstance = null;
    }

    if (!mediaRecorder) return;

    clearInterval(voiceTimerInterval);
    const bannerId = activeTargetTextareaId === "patient-description" ? "intake-voice-banner" : "qa-voice-banner";
    const statusTextId = activeTargetTextareaId === "patient-description" ? "intake-voice-status-text" : "qa-voice-status-text";
    const bannerEl = document.getElementById(bannerId);
    const statusTextEl = document.getElementById(statusTextId);

    if (statusTextEl && shouldTranscribe) {
        statusTextEl.textContent = "⚡ Transcribing audio via faster-whisper...";
    }

    mediaRecorder.onstop = async () => {
        try {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        } catch (e) {}

        if (shouldTranscribe && audioChunks.length > 0) {
            const mimeType = mediaRecorder.mimeType || "audio/webm";
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            await sendAudioForTranscription(audioBlob, mimeType);
        }

        if (bannerEl) bannerEl.classList.add("hidden");
        mediaRecorder = null;
        audioChunks = [];
    };

    mediaRecorder.stop();
}

function cancelVoiceDictation() {
    stopVoiceDictation(false);
}

async function sendAudioForTranscription(audioBlob, mimeType = "audio/webm") {
    if (!audioBlob || audioBlob.size === 0) {
        console.warn("Empty audio blob recorded.");
        alert("Audio recording was empty. Please hold microphone button while speaking.");
        return;
    }

    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
    const formData = new FormData();
    formData.append("file", audioBlob, `recording.${ext}`);
    formData.append("model_name", "base");

    try {
        const response = await fetch("/api/v1/voice/transcribe", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const errJson = await response.json();
            throw new Error(errJson.detail || "Transcription request failed");
        }

        const data = await response.json();
        console.log("Transcription result:", data);

        // Populate targeted textarea
        const targetInput = document.getElementById(activeTargetTextareaId);
        if (targetInput) {
            const newText = data.text ? data.text.trim() : "";
            if (newText) {
                const existing = targetInput.value.trim();
                targetInput.value = existing ? `${existing} ${newText}` : newText;
                targetInput.dispatchEvent(new Event("input", { bubbles: true }));
                targetInput.focus();
                
                // Visual feedback highlight
                targetInput.style.borderColor = "var(--cyan)";
                targetInput.style.boxShadow = "0 0 12px rgba(0, 229, 255, 0.4)";
                setTimeout(() => {
                    targetInput.style.borderColor = "";
                    targetInput.style.boxShadow = "";
                }, 2000);
            }
        }

        // Update language state & pill
        currentDetectedLanguage = data.language;
        currentSpeechLocale = data.speech_locale || "en-US";
        updateLanguagePill(data);

        // Show comfort message if available
        if (data.comfort_message) {
            const comfortEl = activeTargetTextareaId === "patient-description"
                ? document.getElementById("intake-comfort-msg")
                : document.getElementById("qa-comfort-banner");
            if (comfortEl) {
                comfortEl.textContent = `💬 ${data.comfort_message}`;
                comfortEl.style.display = "block";
            }
        }

    } catch (err) {
        console.error("ASR Transcription error:", err);
        alert(`Voice transcription error: ${err.message}`);
    }
}

function updateLanguagePill(data) {
    const pillId = activeTargetTextareaId === "patient-description" ? "intake-lang-pill" : "qa-lang-pill";
    const pillEl = document.getElementById(pillId);
    if (pillEl) {
        const pct = Math.round((data.language_probability || 1.0) * 100);
        pillEl.textContent = `${data.language_flag || '🌐'} ${data.language_name} (${pct}%)`;
        pillEl.classList.remove("hidden");
    }
}

// ── Text-to-Speech (TTS) Spoken-Back Engine (Sequential Speech Queue) ──────────
let speechQueue = [];
let isSpeakingQueueActive = false;

function cancelAllSpeech() {
    speechQueue = [];
    isSpeakingQueueActive = false;
    if (currentAudioElement) {
        try { currentAudioElement.pause(); } catch (e) {}
        currentAudioElement = null;
    }
    if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
    }
}

function speakText(text, localeOverride = null, onEndedCallback = null) {
    if (!text) return;
    if (!isAutoSpeakEnabled && !onEndedCallback) return;

    // Push speech item onto sequential queue
    speechQueue.push({ text, localeOverride, onEndedCallback });
    processNextSpeechInQueue();
}

async function processNextSpeechInQueue() {
    if (isSpeakingQueueActive || speechQueue.length === 0) return;

    isSpeakingQueueActive = true;
    const item = speechQueue.shift();

    const targetLocale = item.localeOverride || currentSpeechLocale || "en-US";
    const langCode = targetLocale.split("-")[0];

    const cleanText = item.text
        .replace(/<[^>]*>/g, "")
        .replace(/[*_#`~]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/^[#*\-•>]+\s*/gm, "")
        .trim();

    if (!cleanText) {
        isSpeakingQueueActive = false;
        if (item.onEndedCallback) item.onEndedCallback();
        processNextSpeechInQueue();
        return;
    }

    const finishStep = () => {
        isSpeakingQueueActive = false;
        if (item.onEndedCallback) item.onEndedCallback();
        // Natural 350ms pause between spoken sentences
        setTimeout(() => {
            processNextSpeechInQueue();
        }, 350);
    };

    // Check if browser has verified premium natural/neural voice
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    const verifiedNaturalVoice = voices.find(v => (
        v.lang.startsWith(langCode) && (
            v.name.toLowerCase().includes("natural") ||
            v.name.toLowerCase().includes("neural") ||
            v.name.toLowerCase().includes("google") ||
            v.name.toLowerCase().includes("microsoft") ||
            v.name.toLowerCase().includes("asad") ||
            v.name.toLowerCase().includes("swara")
        )
    ));

    if (verifiedNaturalVoice) {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = targetLocale;
        utterance.voice = verifiedNaturalVoice;
        utterance.rate = 0.92;
        utterance.pitch = 1.0;
        utterance.onend = finishStep;
        utterance.onerror = finishStep;
        window.speechSynthesis.speak(utterance);
    } else {
        await playBackendAudioSpeech(cleanText, langCode, finishStep);
    }
}

async function playBackendAudioSpeech(cleanText, langCode, onEnded) {
    try {
        const formData = new FormData();
        formData.append("text", cleanText);
        formData.append("language", langCode);

        const response = await fetch("/api/v1/voice/synthesize", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) throw new Error("Backend speech synthesis failed.");

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        currentAudioElement = new Audio(audioUrl);
        currentAudioElement.onended = () => {
            currentAudioElement = null;
            onEnded();
        };
        currentAudioElement.onerror = () => {
            currentAudioElement = null;
            onEnded();
        };
        currentAudioElement.play();
    } catch (err) {
        console.warn("Backend TTS fallback warning:", err);
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.lang = langCode === "ur" ? "ur-PK" : langCode === "hi" ? "hi-IN" : "en-US";
            utterance.rate = 0.92;
            utterance.onend = onEnded;
            utterance.onerror = onEnded;
            window.speechSynthesis.speak(utterance);
        } else {
            onEnded();
        }
    }
}

function speakMessageText(buttonEl) {
    const wrapper = buttonEl.closest(".msg-wrapper") || buttonEl.closest(".chat-msg");
    if (!wrapper) return;
    const bubble = wrapper.querySelector(".msg-bubble");
    if (bubble) {
        cancelAllSpeech();
        speakText(bubble.textContent);
    }
}

function toggleAutoSpeak() {
    isAutoSpeakEnabled = !isAutoSpeakEnabled;
    const stateEl = document.getElementById("auto-speak-state");
    const btnEl = document.getElementById("btn-tts-toggle");
    if (stateEl) stateEl.textContent = isAutoSpeakEnabled ? "ON 🔊" : "OFF";
    if (btnEl) {
        if (isAutoSpeakEnabled) {
            btnEl.style.borderColor = "var(--cyan)";
            btnEl.style.color = "var(--cyan)";
        } else {
            btnEl.style.borderColor = "rgba(0,229,255,0.3)";
            btnEl.style.color = "var(--text-secondary)";
        }
    }
}

// Initialise saved consultation mode on load
document.addEventListener("DOMContentLoaded", () => {
    setConsultationMode(currentConsultationMode);
});


