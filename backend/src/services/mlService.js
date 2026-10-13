const axios = require('axios');

async function fetchMLPredictions(sport, frameData) {
  try {
    // Pipeline sends event data here, but we return nothing for now
    // const response = await axios.post(`http://localhost:8000/predict/${sport}`, frameData);
    // return response.data; 
    
    return null;
  } catch (error) {
    console.error(`ML Service Error for ${sport}:`, error.message);
    return null;
  }
}

module.exports = { fetchMLPredictions };