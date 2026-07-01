const fs = require('fs');
const { DATA_DIR, HISTORY_PATH } = require('../config/env');

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_PATH)) {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify({ items: [] }, null, 2));
  }
}

function readHistory() {
  ensureDataFiles();
  try {
    const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    return Array.isArray(history.items) ? history : { items: [] };
  } catch (_) {
    return { items: [] };
  }
}

function writeHistory(history) {
  ensureDataFiles();
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function addHistoryItem(item) {
  const history = readHistory();
  history.items.unshift(item);
  writeHistory(history);
  return item;
}

function findHistoryByUserId(userId) {
  const history = readHistory();
  return history.items.filter((item) => item.userId === userId || item.profile?.id === userId);
}

module.exports = {
  ensureDataFiles,
  readHistory,
  addHistoryItem,
  findHistoryByUserId,
};
