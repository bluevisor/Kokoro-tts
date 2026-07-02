# Kokoro Reader

Chrome extension that reads selected text aloud: highlight any text on a page,
click the floating **▶ Read** button, and hear it spoken by the
[Kokoro](https://github.com/hexgrad/kokoro) TTS model running **fully locally
in your browser** via [kokoro-js](https://www.npmjs.com/package/kokoro-js)
(ONNX + WASM). No server, no API keys — after the one-time model download,
nothing leaves your machine.

## How it works

- A **content script** watches your text selection; when you finish selecting,
  a small ▶ Read button pops up next to the selection.
- Clicking it sends the text through the **background service worker** to an
  **offscreen document**, which loads the Kokoro-82M ONNX model (quantized,
  ~90 MB, downloaded once from Hugging Face and cached) and synthesizes audio
  with the WASM backend.
- Text is split into sentence chunks and pipelined — the next chunk is
  synthesized while the current one plays, so long selections start quickly.

## Install

```sh
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder

## Use

- Select some text → click the **▶ Read** button that appears below it.
- Select and read something else at any time — it switches immediately.
- Press **Esc** → stop.
- Click the toolbar icon to toggle the Read button, pick a voice (US/UK,
  male/female), or change the speed.

The first read triggers the model download; the status chip in the bottom-right
corner shows progress. Subsequent reads are instant to start (model stays warm
in the offscreen document).

## Development

- Source lives in `src/`; `npm run build` bundles to `dist/` with esbuild.
- The ONNX runtime WASM files are copied into `dist/` and served from inside
  the extension (no CDN at runtime).
- To try the WebGPU backend instead of WASM, change `device: 'wasm'` /
  `dtype: 'q8'` in `src/offscreen.js` to `device: 'webgpu'` / `dtype: 'fp32'`
  (larger download, faster synthesis on supported GPUs).
