const fs = require('fs');
const path = require('path');
const { fetchMLPredictions } = require('../services/mlService');
const { persistProcessedData } = require('../services/dbService');
const { activeClients, dataCache } = require('../config/state');

// 1. Read the raw tracking data into memory once when the module loads
const dataPath = path.join(__dirname, '../../data/rawTracking.json');
const rawStreamData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

function startAutoPipeline(sport) {
  console.log(`Initialized automatic 10s data pipeline for ${sport}.`);
  
  const frames = rawStreamData[sport];
  if (!frames || frames.length === 0) {
    console.error(`No data found for ${sport} in rawT racking.json`);
    return;
  }

  let frameIndex = 0;

  // 2. Set the periodic 10-second interval
  setInterval(async () => {
    try {
      const currentFrame = frames[frameIndex];

      // 3. Send data to the ML microservice[cite: 14]
      const mlResult = await fetchMLPredictions(sport, currentFrame);
      
      if (mlResult) {
        // 4. Parse and format the final payload
        const finalPayload = {
          timestamp: new Date().toISOString(),
          sport: sport,
          matchTime: currentFrame.time || "00:00",
          onField: mlResult.onField || [],
          homeSubs: mlResult.homeSubs || [],
          awaySubs: mlResult.awaySubs || [],
          pressureMetrics: mlResult.uncertaintyBounds // e.g., XAI metrics[cite: 16]
        };

        // Cache the parsed data
        dataCache[sport].push(finalPayload);

        // 5. Send to appropriate socket clients[cite: 16]
        for (const [socketId, socket] of activeClients[sport].entries()) {
          socket.emit(`${sport}-live-data`, finalPayload);
        }

        // Fire asynchronous background database save[cite: 16]
        persistProcessedData(sport, finalPayload).catch(err => 
          console.error(`DB save error for ${sport}:`, err.message)
        );
      }

      // 6. Increment index, looping back to 0 if we reach the end of the JSON array
      frameIndex = (frameIndex + 1) % frames.length;

    } catch (error) {
      console.error(`Pipeline execution error for ${sport}:`, error.message);
    }
  }, 10000); // 10,000 ms = 10 seconds
}

module.exports = { startAutoPipeline };