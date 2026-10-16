const axios = require('axios');
const mlURL = process.env.CRICKET_ML_URL || process.env.ML_SERVICE_URL || 'http://127.0.0.1:8001'   // 8000 = football ML server;
async function evaluateCricket(payload) {
  const { data } = await axios.post(`${mlURL}/evaluate/cricket/post-ball`, payload, { timeout: 5000 });
  return data;
}
module.exports = { evaluateCricket };
