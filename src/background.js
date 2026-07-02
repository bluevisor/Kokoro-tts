// Routes messages between content scripts and the offscreen TTS document.

let creating = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        // WORKERS keeps the document (and the loaded model) alive between reads;
        // AUDIO_PLAYBACK alone would let Chrome kill it after 30s of silence.
        reasons: ['AUDIO_PLAYBACK', 'WORKERS'],
        justification:
          'Runs the Kokoro text-to-speech model (ONNX/WASM) and plays the generated speech audio.',
      })
      .finally(() => {
        creating = null;
      });
  }
  await creating;
}

// createDocument can resolve before the offscreen page's module bundle has
// registered its onMessage listener, so retry until the message lands.
async function sendToOffscreen(msg) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await chrome.runtime.sendMessage({ ...msg, target: 'offscreen' });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

// The tab that most recently requested speech; status updates go back to it.
let activeTabId = null;
// Last status forwarded, so the popup can render current state on open.
let lastStatus = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === 'bg') {
    if (msg.type === 'get-status') {
      sendResponse(lastStatus);
    } else if (msg.type === 'speak') {
      if (sender.tab?.id != null) activeTabId = sender.tab.id;
      ensureOffscreen().then(() => sendToOffscreen(msg));
    } else if (msg.type === 'stop' || msg.type === 'toggle-pause') {
      chrome.offscreen.hasDocument().then((has) => {
        if (has) sendToOffscreen({ type: msg.type });
      });
    }
  } else if (msg?.target === 'content') {
    if (msg.type === 'tts-status') lastStatus = msg;
    if (activeTabId != null) {
      chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
    }
  }
});
