import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'client/src');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'vendor' ? [] : walk(absolute);
    return /\.(?:js|jsx)$/.test(entry.name) ? [absolute] : [];
  });
}

const allSourceFiles = walk(sourceRoot);
const sourceFileSet = new Set(allSourceFiles);

function resolveSource(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(importer), specifier.split('?')[0]);
  for (const candidate of [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')]) {
    if (sourceFileSet.has(candidate)) return candidate;
  }
  return null;
}

function dependencies(file) {
  const source = fs.readFileSync(file, 'utf8');
  const specifiers = [];
  const patterns = [
    /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
    /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers.map((specifier) => resolveSource(file, specifier)).filter(Boolean);
}

const entry = path.join(sourceRoot, 'main.jsx');
const reachable = new Set();
const pending = [entry];
while (pending.length) {
  const file = pending.pop();
  if (reachable.has(file)) continue;
  reachable.add(file);
  pending.push(...dependencies(file));
}

const unreachable = allSourceFiles
  .filter((file) => !reachable.has(file))
  .map((file) => path.relative(root, file))
  .sort();
assert.deepEqual(unreachable, [], `[S6-R01] every remaining Web source module is runtime reachable: ${unreachable.join(', ')}`);

console.log(`Stage 6 reachability check passed (${reachable.size} runtime modules).`);
