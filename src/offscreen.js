// Offscreen document: loads the Kokoro ONNX model, generates speech, plays it.

import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';

// Serve the ONNX runtime WASM from inside the extension instead of a CDN.
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('');

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let ttsPromise = null;
let jobId = 0;
let currentAudio = null;
let currentUrl = null;
let paused = false;

function sendStatus(state, extra = {}) {
  chrome.runtime
    .sendMessage({ target: 'content', type: 'tts-status', state, ...extra })
    .catch(() => {});
}

function loadModel(device, dtype) {
  let lastPercent = -1;
  return KokoroTTS.from_pretrained(MODEL_ID, {
    dtype,
    device,
    progress_callback: (info) => {
      // The CDN may omit content-length, leaving info.total unset (NaN%).
      if (info.status === 'progress' && info.file?.endsWith('.onnx') && info.total > 0) {
        const pct = Math.round((info.loaded / info.total) * 100);
        if (pct !== lastPercent) {
          lastPercent = pct;
          sendStatus('download', { progress: pct });
        }
      }
    },
  });
}

async function getTTS() {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      // WebGPU is roughly an order of magnitude faster than WASM; fall back
      // to threaded WASM if no adapter is available or the load fails.
      if (navigator.gpu) {
        try {
          if (await navigator.gpu.requestAdapter()) {
            return await loadModel('webgpu', 'fp32');
          }
        } catch (err) {
          console.warn('[kokoro-reader] WebGPU failed, falling back to WASM:', err);
        }
      }
      return loadModel('wasm', 'q8');
    })().catch((err) => {
      ttsPromise = null; // allow retry after a failed load
      throw err;
    });
  }
  return ttsPromise;
}

// Split text into sentence-ish chunks so playback can start before the whole
// block is synthesized. First chunk is kept short for low latency.
function chunkText(text, maxLen = 240) {
  const sentences = text.match(/[^.!?…]+[.!?…]+[\])'"”’]*\s*|[^.!?…]+$/g) || [text];
  const chunks = [];
  let buf = '';
  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;
    if (!buf) {
      buf = s;
    } else if (buf.length + s.length + 1 <= maxLen && chunks.length > 0) {
      buf += ' ' + s;
    } else {
      chunks.push(buf);
      buf = s;
    }
    if (buf.length >= maxLen) {
      chunks.push(buf);
      buf = '';
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function stopPlayback() {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

function play(blob, id) {
  return new Promise((resolve, reject) => {
    if (id !== jobId) return resolve();
    stopPlayback();
    currentUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(currentUrl);
    currentAudio.onended = () => resolve();
    currentAudio.onerror = () => reject(new Error('audio playback failed'));
    // If paused at a chunk boundary, queue the audio but wait for resume.
    if (!paused) currentAudio.play().catch(reject);
  });
}

function togglePause() {
  if (!currentAudio) return;
  paused = !paused;
  if (paused) {
    currentAudio.pause();
    sendStatus('paused');
  } else {
    currentAudio.play().catch(() => {});
    sendStatus('playing');
  }
}

async function speak({ text, voice, speed }) {
  const id = ++jobId;
  paused = false;
  stopPlayback();

  try {
    if (!ttsPromise) sendStatus('loading');
    const tts = await getTTS();
    if (id !== jobId) return;

    sendStatus('generating');
    const chunks = chunkText(text);
    const opts = { voice: voice || 'af_heart', speed: speed || 1 };

    // Pipeline: synthesize the next chunk while the current one plays.
    let nextGen = tts.generate(chunks[0], opts);
    for (let i = 0; i < chunks.length; i++) {
      const audio = await nextGen;
      if (id !== jobId) return;
      if (i + 1 < chunks.length) nextGen = tts.generate(chunks[i + 1], opts);
      if (i === 0) sendStatus('playing');
      await play(audio.toBlob(), id);
      if (id !== jobId) return;
    }
    sendStatus('done');
  } catch (err) {
    if (id === jobId) {
      console.error('[kokoro-reader]', err);
      sendStatus('error', { message: String(err?.message || err).slice(0, 200) });
    }
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'speak') {
    speak(msg);
  } else if (msg.type === 'stop') {
    jobId++;
    paused = false;
    stopPlayback();
    sendStatus('stopped');
  } else if (msg.type === 'toggle-pause') {
    togglePause();
  }
});
