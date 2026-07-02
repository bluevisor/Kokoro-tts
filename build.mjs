import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const dist = 'dist';
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

// Offscreen bundle: pulls in kokoro-js + transformers.js (ESM, minified).
await build({
  entryPoints: ['src/offscreen.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  outdir: dist,
  define: { 'process.env.NODE_ENV': '"production"' },
});

// Plain extension scripts (no external deps).
await build({
  entryPoints: ['src/content.js', 'src/background.js', 'src/popup.js'],
  bundle: true,
  outdir: dist,
});

// Static assets.
for (const f of ['manifest.json', 'src/offscreen.html', 'src/popup.html', 'src/content.css']) {
  fs.copyFileSync(f, path.join(dist, path.basename(f)));
}

// ONNX runtime WASM/loader files, served from inside the extension.
const ortDirs = [
  'node_modules/@huggingface/transformers/dist',
  'node_modules/onnxruntime-web/dist',
];
let copied = 0;
for (const dir of ortDirs) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (/^ort-.*\.(wasm|mjs)$/.test(f) && !fs.existsSync(path.join(dist, f))) {
      fs.copyFileSync(path.join(dir, f), path.join(dist, f));
      copied++;
    }
  }
}
if (copied === 0) throw new Error('No ONNX runtime wasm files found to copy');

console.log('Built dist/:');
for (const f of fs.readdirSync(dist).sort()) {
  const kb = Math.round(fs.statSync(path.join(dist, f)).size / 1024);
  console.log(`  ${f} (${kb} KB)`);
}
