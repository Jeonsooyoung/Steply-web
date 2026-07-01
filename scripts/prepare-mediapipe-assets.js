const fs = require('fs');
const path = require('path');

const optional = process.argv.includes('--optional');
const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const targetDirs = [
  path.join(projectRoot, 'client', 'public', 'wasm'),
  path.join(projectRoot, 'client', 'src', 'vendor', 'mediapipe', 'wasm'),
];

function fail(message) {
  if (optional) {
    console.warn(`[mediapipe-assets] ${message}`);
    return process.exit(0);
  }
  console.error(`\n[mediapipe-assets] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(sourceDir)) {
  fail([
    'MediaPipe WASM assets were not found.',
    '',
    'Run this first:',
    '  npm install',
    '',
    'Expected directory:',
    `  ${sourceDir}`,
  ].join('\n'));
}

const required = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

for (const targetDir of targetDirs) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir)) {
    const from = path.join(sourceDir, entry);
    const to = path.join(targetDir, entry);
    fs.cpSync(from, to, { recursive: true, force: true });
  }

  const copied = fs.readdirSync(targetDir);
  const missing = required.filter((file) => !copied.includes(file));
  if (missing.length) {
    fail(`Copied MediaPipe assets to ${targetDir}, but required files are missing: ${missing.join(', ')}`);
  }

  console.log(`[mediapipe-assets] copied ${copied.length} files to ${path.relative(projectRoot, targetDir)}`);
}
