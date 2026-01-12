/* Study Podcast Player
   Uses Web Speech API (speechSynthesis) to speak long text reliably by chunking.
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
  els.statusText.textContent = msg;
}

function setProgress() {
  els.progressText.textContent = `${Math.min(currentIndex, queue.length)} / ${queue.length}`;
}

function loadVoices() {
  voices = window.speechSynthesis.getVoices() || [];
  els.voiceSelect.innerHTML = "";

  // Helpful ordering: English first
  const sorted = [...voices].sort((a, b) => {
    const aEn = (a.lang || "").toLowerCase().startsWith("en");
    const bEn = (b.lang || "").toLowerCase().startsWith("en");
    if (aEn !== bEn) return aEn ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  sorted.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    els.voiceSelect.appendChild(opt);
  });

  // Default to first English voice if possible
  const firstEnglish = sorted.find(v => (v.lang || "").toLowerCase().startsWith("en"));
  selectedVoiceURI = firstEnglish ? firstEnglish.voiceURI : (sorted[0]?.voiceURI ?? null);
  if (selectedVoiceURI) els.voiceSelect.value = selectedVoiceURI;
}

function getSelectedVoice() {
  const uri = els.voiceSelect.value || selectedVoiceURI;
  return voices.find(v => v.voiceURI === uri) || null;
}

// Chunk text into speakable parts (avoid cutting mid-sentence when possible)
function chunkText(text, maxChars) {
  const clean = (text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const chunks = [];
  let i = 0;

  while (i < clean.length) {
    let end = Math.min(i + maxChars, clean.length);

    // Try to break on sentence boundary
    const slice = clean.slice(i, end);
    const lastPeriod = Math.max(
      slice.lastIndexOf(". "),
      slice.lastIndexOf("? "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("\n")
    );

    if (end < clean.length && lastPeriod > 200) {
      end = i + lastPeriod + 1;
    }

    chunks.push(clean.slice(i, end).trim());
    i = end;
  }

  return chunks.filter(Boolean);
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

  if (currentIndex >= queue.length) {
    isPlaying = false;
    setStatus("Done");
    setProgress();
    return;
  }

  const voice = getSelectedVoice();
  const rate = parseFloat(els.rate.value || "1.0");

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
    // Prevent Safari/iOS stall
    setTimeout(speakNext, 50);
  };

  utter.onerror = (e) => {
    console.error("TTS error:", e);
    // Skip problematic chunk rather than dying
    currentIndex += 1;
    setStatus("Error encountered — skipping chunk");
    setTimeout(speakNext, 100);
  };

  window.speechSynthesis.speak(utter);
}

async function loadPodcastTxt() {
  try {
    const res = await fetch("./podcast.txt", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    els.textInput.value = txt;
    setStatus("Loaded podcast.txt");
  } catch (err) {
    setStatus("Could not load podcast.txt (run via a server or GitHub Pages)");
    console.error(err);
  }
}

function playFromStart() {
  stopAll();
  const maxChars = parseInt(els.chunkSize.value || "1200", 10);
  const text = els.textInput.value || "";
  queue = chunkText(text, maxChars);
  currentIndex = 0;

  if (queue.length === 0) {
    setStatus("Nothing to play — paste text first");
    return;
  }

  isPlaying = true;
  setStatus("Queued");
  setProgress();
  speakNext();
}

function pause() {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
    setStatus("Paused");
  }
}

function resume() {
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    setStatus("Playing");
  } else if (!window.speechSynthesis.speaking && isPlaying) {
    // If it stalled, continue
    speakNext();
  }
}

// Events
els.loadBtn.addEventListener("click", loadPodcastTxt);
els.playBtn.addEventListener("click", playFromStart);
els.pauseBtn.addEventListener("click", pause);
els.resumeBtn.addEventListener("click", resume);
els.stopBtn.addEventListener("click", stopAll);

els.voiceSelect.addEventListener("change", () => {
  selectedVoiceURI = els.voiceSelect.value;
});

els.rate.addEventListener("input", () => {
  els.rateVal.textContent = `${parseFloat(els.rate.value).toFixed(2)}x`;
});

// Load voices (some browsers require onvoiceschanged)
loadVoices();
window.speechSynthesis.onvoiceschanged = () => loadVoices();
