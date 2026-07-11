import { runLandmarkReplayCli } from './validation/landmarkReplayRunner.mjs';

runLandmarkReplayCli().catch((error) => {
  console.error(error);
  process.exit(1);
});
