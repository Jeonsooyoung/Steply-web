import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelFiles = ['pose_landmarker_full.task', 'pose_landmarker_lite.task'];
const wasmFiles = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
  'vision_wasm_module_raw_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

assert.equal(fs.existsSync(path.join(root, 'public/models')), false, '[S6-A01] root public model duplicate is removed');
assert.equal(fs.existsSync(path.join(root, 'client/public/wasm')), false, '[S6-A01] Vite public WASM duplicate is removed');

for (const file of modelFiles) {
  const source = path.join(root, 'models', file);
  const generated = path.join(root, 'client/public/models', file);
  assert.equal(fs.existsSync(source), true, `[S6-A01] tracked model source exists: ${file}`);
  assert.equal(fs.existsSync(generated), true, `[S6-A01] generated Vite model exists: ${file}`);
  assert.equal(hash(generated), hash(source), `[S6-A01] generated model matches its single source: ${file}`);
}

for (const file of wasmFiles) {
  const generated = path.join(root, 'client/src/vendor/mediapipe/wasm', file);
  const sourceName = file === 'vision_wasm_module_raw_internal.wasm'
    ? 'vision_wasm_module_internal.wasm'
    : file;
  const source = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm', sourceName);
  assert.equal(fs.existsSync(generated), true, `[S6-A01] generated Vite WASM exists: ${file}`);
  assert.equal(hash(generated), hash(source), `[S6-A01] generated WASM matches npm source: ${file}`);
}

const ignoreSource = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
assert.match(ignoreSource, /\/client\/public\/models\//, '[S6-A01] generated models are ignored');
assert.match(ignoreSource, /\/client\/src\/vendor\/mediapipe\/wasm\//, '[S6-A01] generated WASM is ignored');

console.log('Stage 6 MediaPipe source and generated-asset duplicate checks passed.');
