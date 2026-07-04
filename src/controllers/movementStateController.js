const { execFile } = require('child_process');
const path = require('path');
const { readBodyJson, sendJson } = require('../utils/http');
const { ROOT_DIR } = require('../config/env');

const DEFAULT_MODEL_PATH = path.join(ROOT_DIR, 'models', 'randomforest_landmark_classifier.joblib');
const SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'predict_movement_state.py');
const PYTHON_COMMAND = process.env.PYTHON || process.env.PYTHON3 || 'python';

function runPredictor(payload) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      PYTHON_COMMAND,
      [SCRIPT_PATH, '--model', process.env.MOVEMENT_STATE_MODEL || DEFAULT_MODEL_PATH],
      {
        cwd: ROOT_DIR,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim() || error.message;
          reject(new Error(`Movement-state classifier failed: ${detail}`));
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject(new Error(`Invalid classifier output: ${parseError.message}`));
        }
      },
    );

    child.stdin.end(JSON.stringify(payload));
  });
}

async function predictMovementState(req, res) {
  const body = await readBodyJson(req);
  const landmarks = Array.isArray(body.landmarks) ? body.landmarks : [];
  if (!landmarks.length) {
    return sendJson(res, 400, { error: 'landmarks sequence is required' });
  }

  const result = await runPredictor({ landmarks });
  console.log('[movement-state]', {
    label: result.label,
    confidence: result.confidence,
    framesUsed: result.frames_used,
    detectionRate: result.detection_rate,
    featureValues: result.feature_values,
  });
  return sendJson(res, 200, result);
}

module.exports = {
  predictMovementState,
};
