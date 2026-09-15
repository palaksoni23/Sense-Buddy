// SenseBuddy app logic
// Made by Palak Soni

const tabVision = document.getElementById('tabVision');
const tabVoice = document.getElementById('tabVoice');
const visionCard = document.getElementById('visionCard');
const voiceCard = document.getElementById('voiceCard');

tabVision.addEventListener('click', () => {
  tabVision.classList.add('active');
  tabVoice.classList.remove('active');
  visionCard.style.display = 'grid';
  voiceCard.style.display = 'none';
});

tabVoice.addEventListener('click', () => {
  tabVoice.classList.add('active');
  tabVision.classList.remove('active');
  voiceCard.style.display = 'grid';
  visionCard.style.display = 'none';
});

// ---------- Backend config ----------
// This is your deployed backend URL (from the /server folder) — it holds the
// Gemini key privately, so users never need to enter their own key.
// UPDATE THIS after you deploy the backend on Render.
const BACKEND_URL = 'https://sense-buddy-backend.onrender.com';

// Render's free tier spins down the backend after inactivity, and the first
// request afterwards can take 30-50s to wake it up. Ping it silently as soon
// as the page loads, so it's already awake by the time the user taps a button.
fetch(`${BACKEND_URL}/`).catch(() => {});

// ---------- Web Speech API detection (shared across modes) ----------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// ---------- Theme toggle (dark/light) ----------
const themeToggleBtn = document.getElementById('themeToggleBtn');

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggleBtn.textContent = '☀️';
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeToggleBtn.textContent = '🌙';
  }
}

const savedTheme = localStorage.getItem('sensebuddy_theme') || 'light';
applyTheme(savedTheme);

themeToggleBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('sensebuddy_theme', next);
});

// ---------- History log ----------
const historyDialog = document.getElementById('historyDialog');
const historyBtn = document.getElementById('historyBtn');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('sensebuddy_history') || '[]');
  } catch {
    return [];
  }
}

function addToHistory(mode, text) {
  const history = getHistory();
  history.unshift({
    mode,
    text,
    time: new Date().toLocaleString(),
  });
  // keep last 50 entries
  localStorage.setItem('sensebuddy_history', JSON.stringify(history.slice(0, 50)));
}

function renderHistory() {
  const history = getHistory();
  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No history yet — descriptions and messages will appear here.</div>';
    return;
  }
  historyList.innerHTML = history.map(entry => `
    <div class="history-entry">
      <div class="meta">${entry.mode} · ${entry.time}</div>
      <div>${entry.text}</div>
    </div>
  `).join('');
}

historyBtn.addEventListener('click', () => {
  renderHistory();
  historyDialog.showModal();
});
closeHistoryBtn.addEventListener('click', () => historyDialog.close());
clearHistoryBtn.addEventListener('click', () => {
  localStorage.removeItem('sensebuddy_history');
  renderHistory();
});

// ---------- Help & About ----------
const helpDialog = document.getElementById('helpDialog');
const helpBtn = document.getElementById('helpBtn');
const closeHelpBtn = document.getElementById('closeHelpBtn');

helpBtn.addEventListener('click', () => helpDialog.showModal());
closeHelpBtn.addEventListener('click', () => helpDialog.close());

// ---------- Vision Mode ----------
const cameraFeed = document.getElementById('cameraFeed');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const captureCanvas = document.getElementById('captureCanvas');
const startCameraBtn = document.getElementById('startCameraBtn');
const visionControls = document.getElementById('visionControls');
const describeBtn = document.getElementById('describeBtn');
const readTextBtn = document.getElementById('readTextBtn');
const visionResult = document.getElementById('visionResult');
const liveToggle = document.getElementById('liveToggle');
const hazardBanner = document.getElementById('hazardBanner');
const hazardText = document.getElementById('hazardText');
const visionQuestionInput = document.getElementById('visionQuestionInput');
const dictateQuestionBtn = document.getElementById('dictateQuestionBtn');
const askVisionBtn = document.getElementById('askVisionBtn');
const visionWave = document.getElementById('visionWave');

let cameraStream = null;
let liveNarrationTimer = null;
let liveNarrationBusy = false;

startCameraBtn.addEventListener('click', async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    cameraFeed.srcObject = cameraStream;
    cameraFeed.style.display = 'block';
    cameraPlaceholder.style.display = 'none';
    startCameraBtn.style.display = 'none';
    visionControls.style.display = 'block';
  } catch (err) {
    visionResult.textContent = 'Could not access camera: ' + err.message;
    visionResult.classList.remove('placeholder');
  }
});

function captureFrameBase64() {
  const ctx = captureCanvas.getContext('2d');

  // Resize down to max 640px wide before sending — much faster upload/response,
  // with no real loss in what Gemini can understand from the scene.
  const maxWidth = 640;
  const scale = Math.min(1, maxWidth / cameraFeed.videoWidth);
  captureCanvas.width = cameraFeed.videoWidth * scale;
  captureCanvas.height = cameraFeed.videoHeight * scale;

  ctx.drawImage(cameraFeed, 0, 0, captureCanvas.width, captureCanvas.height);
  return captureCanvas.toDataURL('image/jpeg', 0.6).split(',')[1];
}

async function callGeminiVision(base64Image, promptText, retryCount = 0) {
  const controller = new AbortController();
  // Render's free tier can take 30-50s to wake up from sleep on the first
  // request after inactivity, so we allow a generous timeout here.
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  let response;
  try {
    response = await fetch(`${BACKEND_URL}/api/vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image, prompt: promptText }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('timed out — try again');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if ((response.status === 503 || response.status === 504) && retryCount < 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return callGeminiVision(base64Image, promptText, retryCount + 1);
    }
    if (response.status === 429) {
      throw new Error('rate limit reached — wait a minute before trying again');
    }
    throw new Error(`API error ${response.status}`);
  }
  const data = await response.json();
  return data.text;
}

// Shared lock so live narration and manual actions never call Gemini at the same time
let visionApiBusy = false;

function showResult(text) {
  visionResult.textContent = text;
  visionResult.classList.remove('placeholder');
  visionResult.classList.add('pop');
  setTimeout(() => visionResult.classList.remove('pop'), 450);
}

// ---------- One-off "Describe what's around me" ----------
describeBtn.addEventListener('click', async () => {
  if (visionApiBusy) { showResult('One moment — SenseBuddy is still processing something else.'); return; }
  visionApiBusy = true;

  describeBtn.disabled = true;
  describeBtn.classList.add('pulse-once');
  visionWave.classList.add('active');
  visionResult.textContent = '👀 Looking around... (first request of the session may take up to a minute while the server wakes up)';
  visionResult.classList.add('placeholder');

  try {
    const base64Image = captureFrameBase64();
    const prompt = "You are a warm, friendly voice describing this scene to someone who can't see it. In 2-3 natural, engaging sentences (not robotic labels), describe what's happening in this image so they feel like they're right there.";
    const description = await callGeminiVision(base64Image, prompt);
    showResult(description);
    speakText(description, visionWave);
    addToHistory('Vision · Description', description);
  } catch (err) {
    visionResult.textContent = 'Sorry, I had trouble describing that. ' + err.message;
    visionResult.classList.remove('placeholder');
  } finally {
    describeBtn.disabled = false;
    visionWave.classList.remove('active');
    visionApiBusy = false;
  }
});

// ---------- Read text / signs (OCR) ----------
readTextBtn.addEventListener('click', async () => {
  if (visionApiBusy) { showResult('One moment — SenseBuddy is still processing something else.'); return; }
  visionApiBusy = true;

  readTextBtn.disabled = true;
  readTextBtn.classList.add('pulse-once');
  visionResult.textContent = '📖 Reading...';
  visionResult.classList.add('placeholder');

  try {
    const base64Image = captureFrameBase64();
    const prompt = "Look at this image and read aloud, word for word, any visible text — signs, labels, documents, screens. If there is no readable text, say clearly 'I don't see any text here.' Keep it natural to speak.";
    const text = await callGeminiVision(base64Image, prompt);
    showResult(text);
    speakText(text);
    addToHistory('Vision · Text read', text);
  } catch (err) {
    visionResult.textContent = 'Sorry, I had trouble reading that. ' + err.message;
    visionResult.classList.remove('placeholder');
  } finally {
    readTextBtn.disabled = false;
    visionApiBusy = false;
  }
});

// ---------- Ask a question about what's in view ----------
askVisionBtn.addEventListener('click', async () => {
  const question = visionQuestionInput.value.trim();
  if (!question) return;
  if (visionApiBusy) { showResult('One moment — SenseBuddy is still processing something else.'); return; }
  visionApiBusy = true;

  askVisionBtn.disabled = true;
  askVisionBtn.classList.add('pulse-once');
  visionResult.textContent = '🔎 Checking...';
  visionResult.classList.add('placeholder');

  try {
    const base64Image = captureFrameBase64();
    const prompt = `You are a helpful assistant for someone who can't see. Answer their question about what's in front of them, based on this image. Be direct, brief, and natural to speak aloud. Their question: "${question}"`;
    const answer = await callGeminiVision(base64Image, prompt);
    showResult(answer);
    speakText(answer);
    addToHistory('Vision · Q: ' + question, answer);
  } catch (err) {
    visionResult.textContent = 'Sorry, I had trouble with that. ' + err.message;
    visionResult.classList.remove('placeholder');
  } finally {
    askVisionBtn.disabled = false;
    visionApiBusy = false;
  }
});

// Dictate the question via mic
if (SpeechRecognition) {
  const questionRecognition = new SpeechRecognition();
  questionRecognition.continuous = false;
  questionRecognition.interimResults = false;
  questionRecognition.lang = 'en-US';

  questionRecognition.onstart = () => dictateQuestionBtn.classList.add('live');
  questionRecognition.onend = () => dictateQuestionBtn.classList.remove('live');
  questionRecognition.onresult = (event) => {
    visionQuestionInput.value = event.results[0][0].transcript;
  };

  dictateQuestionBtn.addEventListener('click', () => questionRecognition.start());
} else {
  dictateQuestionBtn.disabled = true;
}

// ---------- Live narration mode (auto-describe + hazard watch) ----------
liveToggle.addEventListener('change', () => {
  if (liveToggle.checked) {
    startLiveNarration();
  } else {
    stopLiveNarration();
  }
});

function startLiveNarration() {
  hazardBanner.style.display = 'none';
  runLiveCycle(); // run immediately once
  liveNarrationTimer = setInterval(runLiveCycle, 15000);
}

function stopLiveNarration() {
  if (liveNarrationTimer) clearInterval(liveNarrationTimer);
  liveNarrationTimer = null;
  hazardBanner.style.display = 'none';
}

async function runLiveCycle() {
  if (liveNarrationBusy || visionApiBusy || !cameraStream) return;
  liveNarrationBusy = true;
  visionApiBusy = true;

  try {
    const base64Image = captureFrameBase64();
    const prompt = "You are a live safety narrator for someone who can't see, watching through their camera in real time. Respond in exactly this format:\nHAZARD: <a short urgent warning if there is a step, obstacle, vehicle, or safety risk right in their path, otherwise write NONE>\nDESCRIPTION: <one short, natural, friendly sentence about what's around them right now>";
    const raw = await callGeminiVision(base64Image, prompt);

    const hazardMatch = raw.match(/HAZARD:\s*(.*)/i);
    const descMatch = raw.match(/DESCRIPTION:\s*(.*)/i);

    const hazard = hazardMatch ? hazardMatch[1].trim() : 'NONE';
    const description = descMatch ? descMatch[1].trim() : raw.trim();

    if (hazard && hazard.toUpperCase() !== 'NONE') {
      hazardText.textContent = hazard;
      hazardBanner.style.display = 'block';
      window.speechSynthesis.cancel();
      speakText(hazard);
      showResult('⚠️ ' + hazard);
      addToHistory('Vision · Hazard alert', hazard);
    } else {
      hazardBanner.style.display = 'none';
      showResult(description);
      speakText(description);
      addToHistory('Vision · Live narration', description);
    }
  } catch (err) {
    // Stay quiet on transient errors during live mode to avoid spamming the user
    console.error('Live narration error', err);
  } finally {
    liveNarrationBusy = false;
    visionApiBusy = false;
  }
}

// ---------- Voice Mode: Speak for me ----------
const messageInput = document.getElementById('messageInput');
const speakBtn = document.getElementById('speakBtn');
const dictateBtn = document.getElementById('dictateBtn');
const micStatus = document.getElementById('micStatus');
const micDot = document.getElementById('micDot');
const micStatusText = document.getElementById('micStatusText');

const speakWave = document.getElementById('speakWave');

function speakText(text, waveEl) {
  if (!('speechSynthesis' in window)) {
    alert('Speech synthesis is not supported in this browser.');
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  if (waveEl) {
    utterance.onstart = () => waveEl.classList.add('active');
    utterance.onend = () => waveEl.classList.remove('active');
  }
  window.speechSynthesis.speak(utterance);
}

speakBtn.addEventListener('click', () => {
  const text = messageInput.value.trim();
  if (!text) return;
  speakBtn.classList.add('pulse-once');
  setTimeout(() => speakBtn.classList.remove('pulse-once'), 350);
  speakText(text, speakWave);
  addToHistory('Voice · Spoken for you', text);
});

// Web Speech API for dictation (typing via voice)
let dictateRecognition = null;

if (SpeechRecognition) {
  dictateRecognition = new SpeechRecognition();
  dictateRecognition.continuous = false;
  dictateRecognition.interimResults = false;
  dictateRecognition.lang = 'en-US';

  dictateRecognition.onstart = () => {
    micDot.classList.add('live');
    micStatusText.textContent = 'Listening...';
  };

  dictateRecognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    messageInput.value = (messageInput.value + ' ' + transcript).trim();
  };

  dictateRecognition.onend = () => {
    micDot.classList.remove('live');
    micStatusText.textContent = 'Mic idle';
  };

  dictateRecognition.onerror = (event) => {
    micDot.classList.remove('live');
    micStatusText.textContent = 'Mic error: ' + event.error;
  };
} else {
  dictateBtn.disabled = true;
}

dictateBtn.addEventListener('click', () => {
  if (dictateRecognition) {
    dictateRecognition.start();
  }
});

// ---------- Voice Mode: Listen for a reply ----------
const listenReplyBtn = document.getElementById('listenReplyBtn');
const replyResult = document.getElementById('replyResult');
let replyRecognition = null;

if (SpeechRecognition) {
  replyRecognition = new SpeechRecognition();
  replyRecognition.continuous = false;
  replyRecognition.interimResults = false;
  replyRecognition.lang = 'en-US';

  replyRecognition.onstart = () => {
    replyResult.textContent = 'Listening for their reply...';
    replyResult.classList.add('placeholder');
  };

  replyRecognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    replyResult.textContent = transcript;
    replyResult.classList.remove('placeholder');
    replyResult.classList.add('pop');
    setTimeout(() => replyResult.classList.remove('pop'), 450);
    addToHistory('Voice · Their reply', transcript);
  };

  replyRecognition.onerror = (event) => {
    replyResult.textContent = 'Mic error: ' + event.error;
    replyResult.classList.remove('placeholder');
  };
} else {
  listenReplyBtn.disabled = true;
}

listenReplyBtn.addEventListener('click', () => {
  if (replyRecognition) {
    replyRecognition.start();
  }
});

// ---------- PWA install prompt ----------
let deferredPrompt;
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBanner.style.display = 'flex';
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBanner.style.display = 'none';
});

window.addEventListener('appinstalled', () => {
  installBanner.style.display = 'none';
});

// ---------- Register service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
