const axios = require('axios');

async function fetchMLPredictions(sport, frameData) {
  try {
    // Proxy request to the Python ML microservice[cite: 14]
    const response = await axios.post(`http://localhost:8000/predict/${sport}`, frameData);
    return response.data; 
  } catch (error) {
    console.error(`ML Service Error for ${sport}:`, error.message);
    return null;
  }
}

module.exports = { fetchMLPredictions };