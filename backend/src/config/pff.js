const path = require('path');

// PFF FC World Cup 2022 replay settings (override with environment variables)
module.exports = {
  DATA_DIR: process.env.PFF_DATA_DIR || path.join(__dirname, '../../data/pff_wc2022'),
  GAME_ID: process.env.PFF_GAME_ID || '10517',             // 10517 = 2022 final, ARG v FRA
  REPLAY_SPEED: parseFloat(process.env.REPLAY_SPEED || '1'), // 1 = real time
  START_MINUTE: parseFloat(process.env.START_MINUTE || '0'), // jump into the match (events before are still sent to the ML server)
  LOOP: process.env.REPLAY_LOOP === '1',                     // restart the match when it ends
  ML_URL: process.env.ML_URL || 'http://127.0.0.1:8000',
  FPS: 29.97,                                                // PFF tracking frame rate
  ID_PREFIX: 'pff',                                          // frontend ids: 'pff<playerId>' (avoids the p1..p28 Metrica profiles)
};
