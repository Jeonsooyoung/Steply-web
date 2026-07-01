const { sendJson } = require('../utils/http');
const historyRepository = require('../repositories/historyRepository');

function getAllHistory(req, res) {
  sendJson(res, 200, historyRepository.readHistory());
}

function getHistoryByUser(req, res, userId) {
  sendJson(res, 200, {
    items: historyRepository.findHistoryByUserId(userId),
  });
}

module.exports = {
  getAllHistory,
  getHistoryByUser,
};
