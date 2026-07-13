const fs = require('fs');
const path = require('path');

const optional = process.argv.includes('--optional');
const projectRoot = process.cwd();
const wasmSourceDir = path.join(projectRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const modelSourceDir = path.join(projectRoot, 'models');
const generatedWasmDir = path.join(projectRoot, 'client', 'src', 'vendor', 'mediapipe', 'wasm');
const generatedModelDir = path.join(projectRoot, 'client', 'public', 'models');

const requiredWasmFiles = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
  'vision_wasm_module_raw_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];
const requiredModelFiles = [
  'pose_landmarker_full.task',
  'pose_landmarker_lite.task',
];

function fail(message) {
  if (optional) {
    console.warn(`[mediapipe-assets] ${message}`);
    process.exit(0);
  }
  console.error(`\n[mediapipe-assets] ${message}\n`);
  process.exit(1);
}

function requireFiles(directory, files, label) {
  const missing = files.filter((file) => !fs.existsSync(path.join(directory, file)));
  if (missing.length) fail(`${label} files are missing from ${directory}: ${missing.join(', ')}`);
}

function resetDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

if (!fs.existsSync(wasmSourceDir)) {
  fail(`MediaPipe WASM package assets were not found at ${wasmSourceDir}. Run npm install first.`);
}
if (!fs.existsSync(modelSourceDir)) {
  fail(`Tracked MediaPipe model assets were not found at ${modelSourceDir}.`);
}

requireFiles(wasmSourceDir, requiredWasmFiles.filter((file) => file !== 'vision_wasm_module_raw_internal.wasm'), 'WASM source');
requireFiles(modelSourceDir, requiredModelFiles, 'Model source');

resetDirectory(generatedWasmDir);
for (const file of requiredWasmFiles) {
  const sourceName = file === 'vision_wasm_module_raw_internal.wasm'
    ? 'vision_wasm_module_internal.wasm'
    : file;
  fs.copyFileSync(path.join(wasmSourceDir, sourceName), path.join(generatedWasmDir, file));
}

resetDirectory(generatedModelDir);
for (const file of requiredModelFiles) {
  fs.copyFileSync(path.join(modelSourceDir, file), path.join(generatedModelDir, file));
}

console.log(`[mediapipe-assets] generated ${requiredWasmFiles.length} WASM files from @mediapipe/tasks-vision`);
console.log(`[mediapipe-assets] generated ${requiredModelFiles.length} model files from models/`);
