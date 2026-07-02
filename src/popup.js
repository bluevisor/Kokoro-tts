const VOICES = [
  ['af_heart', 'Heart (US female)'],
  ['af_bella', 'Bella (US female)'],
  ['af_nicole', 'Nicole (US female)'],
  ['af_sarah', 'Sarah (US female)'],
  ['af_sky', 'Sky (US female)'],
  ['am_adam', 'Adam (US male)'],
  ['am_michael', 'Michael (US male)'],
  ['am_puck', 'Puck (US male)'],
  ['bf_emma', 'Emma (UK female)'],
  ['bf_isabella', 'Isabella (UK female)'],
  ['bm_george', 'George (UK male)'],
  ['bm_lewis', 'Lewis (UK male)'],
];

const DEFAULTS = { enabled: true, voice: 'af_heart', speed: 1 };

const enabledEl = document.getElementById('enabled');
const voiceEl = document.getElementById('voice');
const speedEl = document.getElementById('speed');
const speedValEl = document.getElementById('speedVal');
const pauseEl = document.getElementById('pause');
const stopEl = document.getElementById('stop');

for (const [id, label] of VOICES) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = label;
  voiceEl.appendChild(opt);
}

chrome.storage.local.get(DEFAULTS).then((s) => {
  enabledEl.checked = s.enabled;
  voiceEl.value = s.voice;
  speedEl.value = s.speed;
  speedValEl.textContent = `${Number(s.speed).toFixed(1)}×`;
});

enabledEl.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabledEl.checked });
  if (!enabledEl.checked) {
    chrome.runtime.sendMessage({ target: 'bg', type: 'stop' }).catch(() => {});
  }
});

voiceEl.addEventListener('change', () => {
  chrome.storage.local.set({ voice: voiceEl.value });
});

speedEl.addEventListener('input', () => {
  speedValEl.textContent = `${Number(speedEl.value).toFixed(1)}×`;
  chrome.storage.local.set({ speed: Number(speedEl.value) });
});

// ---------------------------------------------------------------------------
// Playback controls

const ACTIVE_STATES = ['download', 'loading', 'generating', 'playing', 'paused'];

function renderPlayback(state) {
  pauseEl.disabled = state !== 'playing' && state !== 'paused';
  stopEl.disabled = !ACTIVE_STATES.includes(state);
  pauseEl.textContent = state === 'paused' ? '▶ Resume' : '⏸ Pause';
}

chrome.runtime
  .sendMessage({ target: 'bg', type: 'get-status' })
  .then((s) => renderPlayback(s?.state))
  .catch(() => {});

// Status broadcasts from the offscreen player reach the popup too.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target === 'content' && msg.type === 'tts-status') {
    renderPlayback(msg.state);
  }
});

pauseEl.addEventListener('click', () => {
  chrome.runtime.sendMessage({ target: 'bg', type: 'toggle-pause' }).catch(() => {});
});

stopEl.addEventListener('click', () => {
  chrome.runtime.sendMessage({ target: 'bg', type: 'stop' }).catch(() => {});
});
