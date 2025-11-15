// src/App.tsx
import { useEffect, useRef, useState } from "react";
import "./styles.css";

type Message = { role: "user" | "assistant" | "system"; text: string };

const SERVER = (import.meta.env.VITE_SERVER_URL as string) || "http://localhost:4000";

export default function App() {
  // Core states
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const recognitionRef = useRef<any>(null);
  // TTS / voice management
const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
const [muted, setMuted] = useState(false);
const [speaking, setSpeaking] = useState(false);
// timers
const [timers, setTimers] = useState<{ id: string; timeoutId: number | null; label: string }[]>([]);
// --- TIMER SYSTEM ---
type TimerItem = { id: string; timeoutId: number | null; label: string; endAt: number };

// active timers list
const [timersState, setTimersState] = useState<TimerItem[]>([]);

// ticker to update countdown every 1 second
const [, setTick] = useState(0);
useEffect(() => {
  const iv = setInterval(() => setTick((t) => t + 1), 1000);
  return () => clearInterval(iv);
}, []);




  // Setup SpeechRecognition once
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition not supported in this browser.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.interimResults = true; // show partial results
    rec.maxAlternatives = 1;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interimText = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      // show interim live preview
      setInterim(interimText);

      // if final text exists, send to assistant
      if (finalText && finalText.trim() !== "") {
        setInterim("");
        setTranscript(finalText);
        void handleSend(finalText);
      }
    };

    rec.onend = () => {
      setListening(false);
      setInterim("");
    };

    rec.onerror = (ev: any) => {
      console.error("SpeechRecognition error", ev);
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = rec;

    return () => {
      try {
        if (recognitionRef.current) {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
        }
      } catch (e) {
        // ignore cleanup errors
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // populate voices for TTS
useEffect(() => {
  function loadVoices() {
    const v = window.speechSynthesis.getVoices() || [];
    // sort and filter for higher-quality voices if you want; keep as-is for now
    setVoices(v);
    // choose a sensible default (first non-empty voice)
    if (v.length > 0 && !selectedVoiceURI) {
      setSelectedVoiceURI(v[0].voiceURI || v[0].name);
    }
  }

  loadVoices();
  // browsers populate voices asynchronously
  window.speechSynthesis.onvoiceschanged = loadVoices;

  return () => {
    try {
      window.speechSynthesis.onvoiceschanged = null;
    } catch {}
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  // Request permission + start
  async function startListening() {
    if (!recognitionRef.current) {
      alert("SpeechRecognition not supported in this browser.");
      return;
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (err) {
      console.warn("Microphone permission denied or not available:", err);
      alert("Microphone permission is required to use voice features.");
      return;
    }

    setTranscript("");
    setInterim("");
    setListening(true);
    try {
      recognitionRef.current.start();
    } catch (err) {
      console.warn("Couldn't start recognition:", err);
      setListening(false);
    }
  }

  function stopListening() {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (e) {
      // ignore
    }
    setListening(false);
    setInterim("");
  }
  function startTimer(seconds: number, label = "Timer") {
  const id = Math.random().toString(36).slice(2, 9);
  const humanLabel = `${label} (${seconds}s)`;
  const confirmMsg: Message = { role: "assistant", text: `Started ${humanLabel}` };
  setMessages((m) => [...m, confirmMsg]);

  const endAt = Date.now() + seconds * 1000;

  const timeoutId = window.setTimeout(() => {
    const doneMsg: Message = { role: "assistant", text: `${label} finished!` };
    setMessages((m) => [...m, doneMsg]);
    speak(`${label} finished`);

    setTimersState((t) => t.filter((x) => x.id !== id));
  }, seconds * 1000);

  setTimersState((t) => [...t, { id, timeoutId, label: humanLabel, endAt }]);
}

function cancelTimer(id: string) {
  const timer = timersState.find((t) => t.id === id);
  if (!timer) return;
  try { if (timer.timeoutId != null) clearTimeout(timer.timeoutId); } catch {}
  setTimersState((t) => t.filter((x) => x.id !== id));

  const msg: Message = { role: "assistant", text: `Cancelled ${timer.label}` };
  setMessages((m) => [...m, msg]);
  speak(`Cancelled ${timer.label}`);
}

function clearAllTimers() {
  timersState.forEach((t) => {
    try { if (t.timeoutId != null) clearTimeout(t.timeoutId); } catch {}
  });
  setTimersState([]);

  const msg: Message = { role: "assistant", text: `Cleared all timers` };
  setMessages((m) => [...m, msg]);
  speak("Cleared all timers");
}

// remaining seconds helper
function remainingSeconds(t: TimerItem) {
  return Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
}


  // returns true if a local command was recognized & executed
  function runLocalCommandIfAny(text: string): boolean {
  if (!text) return false;
  const low = text.toLowerCase().trim();

  console.log("[Jarvis] checking local command:", low);

  // --- SET TIMER: "set a timer for 10 seconds" / "set timer 2 minutes" / "timer 10s" / "in 5 minutes" ---
  // simple regex to capture number + unit
  const timerRegex = /(?:set (?:a )?timer(?: for)?|timer|in)\s*([0-9]+(?:\.[0-9]+)?)\s*(seconds|second|secs|sec|s|minutes|minute|mins|min|m)?/i;
  const tm = low.match(timerRegex);
  if (tm) {
    const rawNum = parseFloat(tm[1]);
    const unit = (tm[2] || "seconds").toLowerCase();
    let seconds = rawNum;
    if (unit.startsWith("m")) seconds = rawNum * 60;
    // safety: clamp to a reasonable max (e.g., 24 hours)
    if (!isFinite(seconds) || seconds <= 0) return false;
    if (seconds > 24 * 3600) {
      const msg: Message = { role: "assistant", text: "I won't set timers longer than 24 hours." };
      setMessages((m) => [...m, msg]);
      speak("I won't set timers longer than 24 hours.");
      return true;
    }
    startTimer(Math.round(seconds), `Timer`);
    return true;
  }

  // --- OPEN WEBSITES ---
  if (low.startsWith("open youtube") || low === "youtube") {
    window.open("https://www.youtube.com", "_blank");
    return true;
  }

  if (low.startsWith("play music") || low.startsWith("open music") || low === "music") {
    window.open("https://music.youtube.com", "_blank");
    return true;
  }

  // --- SEARCH GOOGLE using pattern: "search <query>"
  if (low.startsWith("search ")) {
    const query = low.replace(/^search\s+/i, "").trim();
    if (query.length > 0) {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank");
      return true;
    }
  }

  // --- TELL TIME ---
  if (low === "what's the time" || low.includes("what time") || low.includes("current time")) {
    const now = new Date();
    const t = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msg: Message = { role: "assistant", text: `The time is ${t}` };
    setMessages((m) => [...m, msg]);
    speak(`The time is ${t}`);
    return true;
  }

  // no local command matched
  return false;
}


  // send to backend
  async function handleSend(text: string) {
  if (!text || text.trim() === "") return;

  // run local commands first — if one matched, skip the LLM call
  const handledLocally = runLocalCommandIfAny(text);
  const userMsg: Message = { role: "user", text };
  setMessages((m) => [...m, userMsg]);

  if (handledLocally) {
    // clear transcript input if any and return early
    setTranscript("");
    setInterim("");
    return;
  }

  try {
    const res = await fetch(`${SERVER}/api/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: messages })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || "Server error");
    }
    const data = await res.json();
    const assistantText: string = data.reply ?? "Sorry, I couldn't generate a reply.";
    const assistantMsg: Message = { role: "assistant", text: assistantText };
    setMessages((m) => [...m, assistantMsg]);
    speak(assistantText);
    handleLocalAction(assistantText); // keep existing assistant-triggered local actions
  } catch (e: any) {
    console.error(e);
    const errMsg: Message = { role: "system", text: "Error: " + (e.message || String(e)) };
    setMessages((m) => [...m, errMsg]);
  } finally {
    setTranscript("");
    setInterim("");
  }
}


  // TTS
  function speak(text: string) {
  if (muted) return; // don't speak when muted
  if (!("speechSynthesis" in window)) return;

  // stop any previous speech to prevent overlap
  try {
    window.speechSynthesis.cancel();
  } catch (e) {
    // ignore
  }

  const utter = new SpeechSynthesisUtterance(text || "");
  utter.lang = "en-US";
  utter.rate = 1;

  // attach selected voice if available
  try {
    if (selectedVoiceURI) {
      const found = voices.find((v) => v.voiceURI === selectedVoiceURI || v.name === selectedVoiceURI);
      if (found) utter.voice = found;
    }
  } catch (e) {
    // ignore voice selection errors
  }

  // set speaking flag for UI (optional)
  setSpeaking(true);
  utter.onend = () => setSpeaking(false);
  utter.onerror = () => setSpeaking(false);

  try {
    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn("TTS speak error", e);
    setSpeaking(false);
  }
}
// call this when user picks a voice from the dropdown
function onSelectVoice(e: React.ChangeEvent<HTMLSelectElement>) {
  setSelectedVoiceURI(e.target.value || null);
}

// toggle mute on/off
function toggleMute() {
  setMuted((m) => !m);
  // if unmuting, you might want to replay last assistant message — optional
}


  function handleLocalAction(text: string) {
  const low = text.toLowerCase().trim();

  // --- OPEN WEBSITES ---
  if (low.startsWith("open youtube")) {
    window.open("https://www.youtube.com", "_blank");
    return;
  }

  if (low.startsWith("play music") || low.startsWith("open music")) {
    window.open("https://music.youtube.com", "_blank");
    return;
  }

  // --- TELL TIME ---
  if (low.includes("time")) {
    const now = new Date();
    const t = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msg: Message = { role: "assistant", text: `The time is ${t}` };
    setMessages((m) => [...m, msg]);
    speak(`The time is ${t}`);
    return;
  }

  // --- SEARCH GOOGLE ---
  if (low.startsWith("search")) {
    const query = low.replace("search", "").trim();
    if (query.length > 0) {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank");
      return;
    }
  }
}


  return (
    <div className="app-wrap">
      <div className="app-header">
        <h1>Jarvis — AI Voice Assistant</h1>
        <div className="app-sub">Voice + chat interface • Local actions supported</div>
      </div>

      <div className="controls" style={{ position: "relative" }}>
        <button
          type="button"
          className={listening ? "btn active" : "btn"}
          onClick={() => (listening ? stopListening() : startListening())}
          aria-label={listening ? "Stop listening" : "Start listening"}
        >
          {listening ? <span className="mic-dot" aria-hidden /> : null}
          <span className="label">{listening ? "Listening..." : "Speak"} 🎙️</span>
        </button>

        {/* Hidden live region for screen readers */}
        <span
          aria-live="polite"
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            margin: "-1px",
            padding: "0",
            border: "0",
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
          }}
        >
          {listening ? "Listening" : "Not listening"}
        </span>

        <input
          className="input"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Or type here and press Enter"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleSend(transcript);
              setTranscript("");
            }
          }}
        />

        <button
          className="btn"
          type="button"
          onClick={() => {
            void handleSend(transcript);
            setTranscript("");
          }}
        >
          Send
        </button>
        {/* Voice selector + mute */}
<div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8 }}>
  {/* Curated voice selector — short list (English only, top 5) */}
<select
  value={selectedVoiceURI ?? ""}
  onChange={onSelectVoice}
  style={{ padding: 8, borderRadius: 8, background: "var(--panel)", color: "var(--text)", border: "1px solid rgba(255,255,255,0.04)" }}
  aria-label="Select voice"
>
  <option value="">Default voice</option>

  {(() => {
    // prefer English voices and pick a short curated list
    const en = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
    // Try to rank voices that look like high-quality ones first (Google, Microsoft, Microsoft+)
    const priorityKeywords = ["google", "microsoft", "amazon", "azure", "voice", "synth"];
    const scored = en.map((v) => {
      const name = (v.name || "").toLowerCase();
      let score = 0;
      for (const k of priorityKeywords) if (name.includes(k)) score += 2;
      // prefer exact en-US slightly
      if ((v.lang || "").toLowerCase() === "en-us") score += 1;
      return { v, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const curated = scored.slice(0, 5).map((s) => s.v);

    const listToShow = curated.length > 0 ? curated : voices.slice(0, 5);

    return listToShow.map((v) => (
      <option key={v.voiceURI || v.name} value={v.voiceURI || v.name}>
        {v.name} {v.lang ? `(${v.lang})` : ""}
      </option>
    ));
  })()}
</select>


  <button
    type="button"
    className="btn"
    onClick={toggleMute}
    aria-label={muted ? "Unmute" : "Mute"}
    title={muted ? "Unmute" : "Mute"}
    style={{ padding: "8px 10px" }}
  >
    {muted ? "Unmuted 🔊" : "Mute 🔇"}
  </button>
</div>


        {interim && (
          <div style={{ color: "#9ca3af", marginTop: 8, fontStyle: "italic" }}>
            Listening (live): {interim}
          </div>
        )}
      </div>
      {/* Active Timers panel */}
{timersState.length > 0 && (
  <div style={{
    marginTop: 12, marginBottom: 8, padding: 12,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.04)",
    background: "rgba(255,255,255,0.02)"
  }}>
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8
    }}>
      <strong style={{ color: "var(--text)" }}>Active Timers</strong>
      <button type="button" className="btn" style={{ padding: "6px 10px" }} onClick={clearAllTimers}>
        Clear all
      </button>
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {timersState.map((t) => (
        <div key={t.id} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12
        }}>
          <div style={{ color: "var(--subtext)" }}>
            {t.label} — <span style={{ color: "var(--text)" }}>
              {remainingSeconds(t)}s left
            </span>
          </div>

          <button
            type="button"
            className="btn"
            style={{ padding: "6px 10px" }}
            onClick={() => cancelTimer(t.id)}
          >
            Cancel
          </button>
        </div>
      ))}
    </div>
  </div>
)}


      <div className="chat-panel" style={{ marginTop: 14 }}>
        {messages.length === 0 && (
          <p className="status">Say something like "Hello" or "What's the weather in Bangalore?"</p>
        )}

        {messages.map((m, i) => (
          <div className="msg" key={i}>
            <div className="role">{m.role}</div>
            <div className={`bubble ${m.role === "assistant" ? "assistant" : "user"}`}>{m.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
