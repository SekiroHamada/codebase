const axios = require('axios');
const mlURL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
async function evaluateCricket(payload) {
  const { data } = await axios.post(`${mlURL}/evaluate/cricket/post-ball`, payload, { timeout: 5000 });
  return data;
}
module.exports = { evaluateCricket };
