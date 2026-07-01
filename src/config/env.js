const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 3000);
const CLIENT_PORT = Number(process.env.CLIENT_PORT || 5173);
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PUBLIC_DIR = fs.existsSync(path.join(DIST_DIR, 'index.html'))
  ? DIST_DIR
  : path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 2_000_000);

module.exports = {
  ROOT_DIR,
  PORT,
  DIST_DIR,
  PUBLIC_DIR,
  DATA_DIR,
  HISTORY_PATH,
  MAX_JSON_BODY_BYTES,
  CLIENT_PORT,
};
