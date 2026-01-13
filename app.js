/* Study Podcast Player
   Uses Web Speech API (speechSynthesis) to speak long text reliably by chunking.
   - Auto-picks best English voice (prefers Enhanced/Premium/Google if present)
   - Cache-busts podcast.txt load for GitHub Pages + Safari
*/

const els = {
  loadBtn: document.getElementById("loadBtn"),
  playBtn: document.getElementById("playBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  stopBtn: document.getElementById("stopBtn"),
  voiceSelect: document.getElementById("voiceSelect"),
  rate: document.getElementById("rate"),
  rateVal: document.getElementById("rateVal"),
  chunkSize: document.getElementById("chunkSize"),
  textInput: document.getElementById("textInput"),
  statusText: document.getElementById("statusText"),
  progressText: document.getElementById("progressText"),
};

let voices = [];
let queue = [];
let currentIndex = 0;
let isPlaying = false;
let selectedVoiceURI = null;

function setStatus(msg) {
  if (els.statusText) els.statusText.textContent = msg;
}

function setProgress() {
  if (!els.progressText) return;
  const shown = Math.min(currentIndex, queue.length);
  els.progressText.textContent = `${shown} / ${queue.length}`;
}

function loadVoices() {
  voices = window.speechSynthesis.getVoices() || [];
  if (!els.voiceSelect) return;

  els.voiceSelect.innerHTML = "";

  // Helpful ordering: English first, then alphabetical
  const sorted = [...voices].sort((a, b) => {
    const aEn = (a.lang || "").toLowerCase().startsWith("en");
    const bEn = (b.lang || "").toLowerCase().startsWith("en");
    if (aEn !== bEn) return aEn ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  sorted.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    els.voiceSelect.appendChild(opt);
  });

  // Prefer: en-US + Enhanced/Premium/Google -> en-US -> any en -> first available
  const preferred =
    sorted.find((v) => v.lang?.startsWith("en-US") && /Enhanced|Premium|Google/i.test(v.name)) ||
    sorted.find((v) => v.lang?.startsWith("en-US")) ||
    sorted.find((v) => (v.lang || "").toLowerCase().startsWith("en"));

  selectedVoiceURI = preferred?.voiceURI || sorted[0]?.voiceURI || null;
  if (selectedVoiceURI) els.voiceSelect.value = selectedVoiceURI;
}

function getSelectedVoice() {
  const uri = els.voiceSelect?.value || selectedVoiceURI;
  return voices.find((v) => v.voiceURI === uri) || null;
}

// Chunk text into speakable parts (avoid cutting mid-sentence when possible)
function chunkText(text, maxChars) {
  const clean = (text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const chunks = [];
  let i = 0;

  while (i < clean.length) {
    let end = Math.min(i + maxChars, clean.length);

    // Try to break on sentence boundary or newline
    const slice = clean.slice(i, end);
    const lastBreak = Math.max(
      slice.lastIndexOf(". "),
      slice.lastIndexOf("? "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("\n")
    );

    // Only use a break if it's not too close to the start (prevents tiny chunks)
    if (end < clean.length && lastBreak > 200) {
      end = i + lastBreak + 1;
    }

    const part = clean.slice(i, end).trim();
    if (part) chunks.push(part);

    i = end;
  }

  return chunks;
}

function stopAll() {
  window.speechSynthesis.cancel();
  isPlaying = false;
  queue = [];
  currentIndex = 0;
  setStatus("Stopped");
  setProgress();
}

function speakNext() {
  if (!isPlaying) return;

  // If paused, do not enqueue another utterance
  if (window.speechSynthesis.paused) return;

  if (currentIndex >= queue.length) {
    isPlaying = false;
    setStatus("Done");
    setProgress();
    return;
  }

  const voice = getSelectedVoice();
  const rate = parseFloat(els.rate?.value || "1.0");

  const utter = new SpeechSynthesisUtterance(queue[currentIndex]);
  if (voice) utter.voice = voice;
  utter.rate = rate;

  utter.onstart = () => {
    setStatus("Playing");
    setProgress();
  };

  utter.onend = () => {
    currentIndex += 1;
    setProgress();
    // Small delay helps prevent iOS/Safari stalls
    setTimeout(speakNext, 60);
  };

  utter.onerror = (e) => {
    console.error("TTS error:", e);
    currentIndex += 1;
    setStatus("TTS error — skipping chunk");
    setTimeout(speakNext, 120);
  };

  window.speechSynthesis.speak(utter);
}

async function loadPodcastTxt() {
  try {
    // Cache-bust to avoid GitHub Pages/Safari serving stale content
    const url = `./podcast.txt?v=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    els.textInput.value = txt;
    setStatus("Loaded podcast.txt");
  } catch (err) {
    setStatus("Could not load podcast.txt — ensure it exists in repo root and is named exactly podcast.txt");
    console.error(err);
  }
}

function playFromStart() {
  // iOS Safari sometimes needs cancel() before speak() to start cleanly
  window.speechSynthesis.cancel();

  const maxChars = parseInt(els.chunkSize?.value || "1200", 10);
  const text = els.textInput?.value || "";
  queue = chunkText(text, maxChars);
  currentIndex = 0;

  if (queue.length === 0) {
    isPlaying = false;
    setStatus("Nothing to play — paste text or load podcast.txt");
    setProgress();
    return;
  }

  isPlaying = true;
  setStatus("Queued");
  setProgress();
  speakNext();
}

function pause() {
  if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
    window.speechSynthesis.pause();
    setStatus("Paused");
  }
}

function resume() {
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    setStatus("Playing");
    // If resume doesn't immediately continue (Safari quirk), nudge it
    setTimeout(() => {
      if (isPlaying && !window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        speakNext();
      }
    }, 200);
    return;
  }

  // If it stalled (not speaking) but we are in playing mode, continue
  if (isPlaying && !window.speechSynthesis.speaking) {
    speakNext();
  }
}

// Wire up events
els.loadBtn?.addEventListener("click", loadPodcastTxt);
els.playBtn?.addEventListener("click", playFromStart);
els.pauseBtn?.addEventListener("click", pause);
els.resumeBtn?.addEventListener("click", resume);
els.stopBtn?.addEventListener("click", stopAll);

els.voiceSelect?.addEventListener("change", () => {
  selectedVoiceURI = els.voiceSelect.value;
});

els.rate?.addEventListener("input", () => {
  if (els.rateVal) els.rateVal.textContent = `${parseFloat(els.rate.value).toFixed(2)}x`;
});

// Initialize voices
loadVoices();
window.speechSynthesis.onvoiceschanged = () => loadVoices();

// Initialize UI labels
if (els.rateVal && els.rate) els.rateVal.textContent = `${parseFloat(els.rate.value).toFixed(2)}x`;
setStatus("Idle");
setProgress();
