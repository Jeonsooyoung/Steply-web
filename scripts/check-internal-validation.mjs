import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLandmarkReplayCli } from './validation/landmarkReplayRunner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outputPath = path.join(root, 'artifacts', 'validation', 'internal-validation-summary.json');

await runLandmarkReplayCli([
  '--default-suite',
  '--assert',
  '--output',
  outputPath,
]);

console.log(`Internal engineering validation summary written to ${path.relative(root, outputPath)}`);
