const fs = require('fs');
const path = require('path');
const { fetchMLPredictions } = require('../services/mlService');
const { activeClients } = require('../config/state');
const { footballInitialData } = require('../config/matchMetadata');

// Load CSVs into memory arrays
const dataDir = path.join(__dirname, '../../data');
const homeLines = fs.readFileSync(path.join(dataDir, 'Sample_Game_1_RawTrackingData_Home_Team.csv'), 'utf8').split('\n').filter(l => l.trim() !== '');
const awayLines = fs.readFileSync(path.join(dataDir, 'Sample_Game_1_RawTrackingData_Away_Team.csv'), 'utf8').split('\n').filter(l => l.trim() !== '');
const eventLines = fs.readFileSync(path.join(dataDir, 'Sample_Game_1_RawEventsData.csv'), 'utf8').split('\n').filter(l => l.trim() !== '');

// Pointers and Time State
let homeIndex = 3; // 4th line
let awayIndex = 3; // 4th line
let eventIndex = 1; // 2nd line (skip header)
let currentTime = 0; // Tracks elapsed time in seconds

// Helper to map CSV columns to player IDs and populate matchMetadata
function initializeTeamData(lines, teamArray) {
  const playerIds = lines[1].split(','); // Row 2: Player numbers
  const initialData = lines[3].split(','); // Row 4: Initial coordinates

  const colMapping = []; // Store column index for live updates
  let col = 3; // Player data starts at column 3

  while (col < playerIds.length - 2) { // Last two columns are Ball X, Y
    const pId = playerIds[col];
    if (pId && pId.trim() !== '') {
      const rawX = parseFloat(initialData[col]);
      const rawY = parseFloat(initialData[col + 1]);
      
      // Metrica data is 0-1 scale, frontend needs 0-100 scale
      const x = isNaN(rawX) ? 'NaN' : rawX * 100;
      const y = isNaN(rawY) ? 'NaN' : rawY * 100;

      const playerObj = {};
      playerObj[`p${pId}`] = [
        `Player ${pId}`, // Name
        "",              // Photo
        100,             // Initial Trust Score
        x,               // X coordinate
        y                // Y coordinate
      ];
      
      teamArray.push(playerObj);
      colMapping.push({ id: `p${pId}`, xCol: col, yCol: col + 1 });
    }
    col += 2;
  }
  return colMapping;
}

// Generate mappings and populate metadata on boot
const homeMapping = initializeTeamData(homeLines, footballInitialData.team1);
const awayMapping = initializeTeamData(awayLines, footballInitialData.team_2);

// Helper to update matchMetadata from the current pointer row
function updateMetadataPositions(lineData, mapping, teamArray) {
  const cols = lineData.split(',');
  
  mapping.forEach(map => {
    const rawX = parseFloat(cols[map.xCol]);
    const rawY = parseFloat(cols[map.yCol]);
    
    // Find player in metadata and update
    const playerEntry = teamArray.find(p => Object.keys(p)[0] === map.id);
    if (playerEntry) {
      const data = playerEntry[map.id];
      data[3] = isNaN(rawX) ? 'NaN' : rawX * 100; // Update X
      data[4] = isNaN(rawY) ? 'NaN' : rawY * 100; // Update Y
    }
  });

  // Extract Ball Data (last two columns)
  const rawBallX = parseFloat(cols[cols.length - 2]);
  const rawBallY = parseFloat(cols[cols.length - 1]);
  return {
    x: isNaN(rawBallX) ? 'NaN' : rawBallX * 100,
    y: isNaN(rawBallY) ? 'NaN' : rawBallY * 100
  };
}

// Format matchMetadata into the frontend-compatible payload
function buildFrontendPayload() {
  const onField = [];
  const homeSubs = [];
  const awaySubs = [];
  
  // Parse Home Team
  footballInitialData.team1.forEach(entry => {
    const [id, [name, photo, trust, x, y]] = Object.entries(entry)[0];
    if (x !== 'NaN' && y !== 'NaN') {
      onField.push({ id, name, x, y, trustScore: trust });
    } else {
      homeSubs.push({ id, name });
    }
  });

  // Parse Away Team
  footballInitialData.team_2.forEach(entry => {
    const [id, [name, photo, trust, x, y]] = Object.entries(entry)[0];
    if (x !== 'NaN' && y !== 'NaN') {
      onField.push({ id, name, x, y, trustScore: trust });
    } else {
      awaySubs.push({ id, name });
    }
  });

  return {
    time: footballInitialData.time_elapsed, 
    ball: footballInitialData.ball_position,
    team_1_goals: footballInitialData.team_1_goals,
    team_2_goals: footballInitialData.team_2_goals,
    onField: onField,
    homeSubs: homeSubs,
    awaySubs: awaySubs
  };
}

function startAutoPipeline(sport) {
  if (sport !== 'football') return;
  
  const FPS = 30;
  const intervalMs = 1000 / FPS; // ~33.33ms per frame
  
  console.log(`Initialized Metrica 30fps data pipeline for ${sport}.`);

  setInterval(async () => {
    currentTime += (1 / FPS); // Increment by ~0.0333 seconds

    // 1. Advance Tracking Pointers
    while (homeIndex < homeLines.length - 1 && parseFloat(homeLines[homeIndex + 1].split(',')[2]) <= currentTime) {
      homeIndex++;
    }
    while (awayIndex < awayLines.length - 1 && parseFloat(awayLines[awayIndex + 1].split(',')[2]) <= currentTime) {
      awayIndex++;
    }

    // Update player positions and retrieve current ball coordinates
    const homeBall = updateMetadataPositions(homeLines[homeIndex], homeMapping, footballInitialData.team1);
    const awayBall = updateMetadataPositions(awayLines[awayIndex], awayMapping, footballInitialData.team_2);
    
    // Sync global metadata state
    footballInitialData.ball_position = !isNaN(homeBall.x) ? homeBall : awayBall;
    footballInitialData.time_elapsed = new Date(currentTime * 1000).toISOString().substr(14, 9);

    // 2. Advance Event Pointer & Check for Events
    let eventTriggered = false;
    let latestEventData = null;

    while (eventIndex < eventLines.length - 1) {
      const nextEventCols = eventLines[eventIndex + 1].split(',');
      const eventTime = parseFloat(nextEventCols[5]); // Start Time [s]

      if (eventTime <= currentTime) {
        eventIndex++;
        eventTriggered = true;
        latestEventData = nextEventCols; 

        // Score tracking logic based on Metrica event definitions
        const team = latestEventData[0];     // "Home" or "Away"
        const type = latestEventData[1];     // e.g., "SHOT"
        const subtype = latestEventData[2];  // e.g., "ON TARGET-GOAL"

        if (subtype && subtype.includes('GOAL')) {
          if (type === 'Own goal') {
            if (team === 'Home') footballInitialData.team_2_goals++;
            if (team === 'Away') footballInitialData.team_1_goals++;
          } else {
            if (team === 'Home') footballInitialData.team_1_goals++;
            if (team === 'Away') footballInitialData.team_2_goals++;
          }
        }
      } else {
        break;
      }
    }

    // 3. Trigger ML Pipeline if an event occurred
    if (eventTriggered && latestEventData) {
      const mlResult = await fetchMLPredictions(sport, { event: latestEventData, time: currentTime });
      if (mlResult) {
        // If ML returns a trust score, update it in footballInitialData here
      }
    }

    // 4. Send updated matchMetadata payload to frontend
    const finalPayload = buildFrontendPayload();
    
    for (const [socketId, socket] of activeClients[sport].entries()) {
      socket.emit(`${sport}-live-data`, finalPayload);
    }

  }, intervalMs); 
}

module.exports = { startAutoPipeline };