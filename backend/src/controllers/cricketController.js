const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { activeClients } = require('../config/state');
const { cricketInitialData } = require('../config/matchMetadata');
const { evaluateCricket } = require('../services/cricketMlService');

let currentPayload = null;
let replayRows = null;
let replayRoster = null;
let replayCursor = 0;
let replayTimer = null;
let replayBusy = false;
let replayGeneration = 0;
let replayFinished = false;
let matchState = null;
let playerScores = new Map();
let replayTarget = null;
let matchId = String(process.env.CRICKET_MATCH_ID || '2');
let cachedCsvRows = null;
let matchOptions = null;
const ms = Math.max(250, Number(process.env.CRICKET_REPLAY_INTERVAL_MS) || 2000);
const csvPath = path.join(__dirname, '../../data/mensIPLHawkeyeStats.csv');
const clean = value => (value === undefined || value === null ? '' : String(value).trim());
const val = value => {
  const number = Number(value);
  return clean(value) !== '' && Number.isFinite(number) && number !== -1 ? number : null;
};
const num = value => Number(value) || 0;
const label = (id, name, trust=50, x=50, y=50) => ({[id]: [name, '', trust, x, y]});
function dismissalWicket(dismissal) { return clean(dismissal) !== ''; }
function legalBall(row) {
  const extras = clean(row.extras).toLowerCase();
  return !(/wd|wide|nb|no.ball/.test(extras));
}
function position(index, role) {
  // Symbolic position, NOT real field-player tracking coordinates.
  const angle = ((index % 10) / 10) * Math.PI * 2;
  return role === 'batter' ? {x:50 + index%2*3, y:50 + index%2*3} : {x:50 + 25*Math.cos(angle), y:50 + 25*Math.sin(angle)};
}

function getCsvRows() {
  if (!cachedCsvRows) {
    if (!fs.existsSync(csvPath)) throw new Error(`Missing cricket CSV at ${csvPath}`);
    cachedCsvRows = parse(fs.readFileSync(csvPath, 'utf8'), {columns: true, skip_empty_lines: true, bom: true, relax_quotes: true});
  }
  return cachedCsvRows;
}
function getCricketMatches() {
  if (!matchOptions) {
    const counts = new Map();
    for (const row of getCsvRows()) {
      const id = clean(row.matchId);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    matchOptions = [...counts].map(([id, deliveries]) => ({ id, deliveries }))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }
  return { selectedMatchId: matchId, matches: matchOptions };
}
function allMatchRows(){
  const selected = getCsvRows().filter(row => clean(row.matchId) === matchId);
  if (!selected.length) throw new Error(`Match ID ${matchId} not present in CSV`);
  // Preserve CSV order. The event component in 1.13.2 is NOT a legal ball count.
  return selected;
}
function setupRoster(rows){
  const batting = new Map(), bowling = new Map();
  rows.forEach(row => {
    const bid = `p${clean(row.batterId)}`, wid = `p${clean(row.bowlerId)}`;
    if (!batting.has(bid)) batting.set(bid, clean(row.batter));
    if (!bowling.has(wid)) bowling.set(wid, clean(row.bowler));
  });
  cricketInitialData.team1 = [...batting].map(([id,name],i) => {let p=position(i,'batter'); return label(id,name,50,p.x,p.y);});
  cricketInitialData.team_2 = [...bowling].map(([id,name],i) => {let p=position(i,'bowler'); return label(id,name,50,p.x,p.y);});
  cricketInitialData.players = batting.size + bowling.size;
  return {batting, bowling};
}
function emit(event, payload){
  // namespaced so it never collides with the master cricket pipeline's 'cricket-live-data' / 'init-roster'
  const name = event === 'init-roster' ? 'cricket-ml-init-roster' : event.replace(/^cricket-/, 'cricket-ml-');
  for (const socket of activeClients.cricket.values()) socket.emit(name,payload);
}
function makePayload(row, state, prediction, playerScores, roster){
  const onField = [];
  const homeSubs = [], awaySubs = [];
  for (const [team, collection, bench] of [['batting',roster.batting,homeSubs], ['bowling',roster.bowling,awaySubs]]){
    let i=0;
    for (const [id,name] of collection){
      const p=position(i++,team === 'batting' ? 'batter' : 'bowler');
      const active = id === `p${row.batterId}` || id === `p${row.nonStrikerId}` || id === `p${row.bowlerId}`;
      const player = { id,name,x:p.x,y:p.y,trustScore:playerScores.get(id) ?? 50,role:team };
      if(active) onField.push(player); else bench.push(player);
    }
  }
  const overs = Math.floor(state.legalBalls/6) + '.' + state.legalBalls%6;
  return {
    matchId, deliveryId:row.delivery, eventIndex:state.eventIndex, time: `${state.innings}.${overs}`,
    innings:state.innings, runs:state.runs, wickets:state.wickets, overs,
    target:state.target, lastBall:{runs:num(row.runs),batterRuns:num(row.batterRuns), extras:row.extras, dismissal:row.dismissalDetails},
    batter:prediction.batter, bowler:prediction.bowler, pressure:prediction.pressure,
    onField,homeSubs,awaySubs, modelVersion:prediction.model_version,
    modelStatus:prediction.status, dataQuality:prediction.data_quality,
    note:prediction.note
  };
}
function resetState() {
  matchState = { innings: 0, runs: 0, wickets: 0, legalBalls: 0, eventIndex: -1, target: null };
  playerScores = new Map();
  replayCursor = 0;
  replayFinished = false;
  currentPayload = null;
}

function prepareCricketReplay() {
  if (replayRows) return;
  replayRows = allMatchRows();
  replayRoster = setupRoster(replayRows);
  replayTarget = replayRows.filter(r => String(r.delivery).startsWith('1.'))
    .reduce((sum, r) => sum + num(r.runs), 0) + 1;
  resetState();
  console.log(`[CRICKET] Match ${matchId}; ${replayRows.length} CSV rows loaded; starts at ${replayRows[0].delivery}; interval ${ms}ms; waiting for frontend`);
}

async function tickCricket(generation) {
  if (replayBusy || replayFinished || replayCursor >= replayRows.length || generation !== replayGeneration) return;
  replayBusy = true;
  try {
    const cursor = replayCursor;
    const row = replayRows[cursor];
    const innings = Number(String(row.delivery).split('.')[0]);
    // Work with a draft state so a restart while awaiting ML does not corrupt the new match.
    const state = { ...matchState };
    if (state.innings !== innings) {
      state.innings = innings;
      state.runs = 0;
      state.wickets = 0;
      state.legalBalls = 0;
      state.target = innings === 2 ? replayTarget : null;
    }
    const legal = legalBall(row);
    state.runs += num(row.runs);
    if (dismissalWicket(row.dismissalDetails)) state.wickets += 1;
    if (legal) state.legalBalls += 1;
    state.eventIndex = cursor;
    const mlPayload = {
      match_id: matchId, event_index: cursor,
      batter: { id: String(row.batterId), name: row.batter },
      bowler: { id: String(row.bowlerId), name: row.bowler },
      ball: {
        delivery_id: row.delivery, speed_mps: val(row.ballSpeed),
        pitch_x: val(row.pitchX), pitch_y: val(row.pitchY),
        stumps_x: val(row.stumpsX), stumps_y: val(row.stumpsY),
        field_x: val(row.fieldX), field_y: val(row.fieldY),
        batter_runs: num(row.batterRuns), bowler_runs: num(row.bowlerRuns),
        total_runs: num(row.runs), extras: clean(row.extras),
        dismissal: clean(row.dismissalDetails), legal
      },
      score: {
        innings, runs: state.runs, wickets: state.wickets,
        legal_balls: state.legalBalls, target: state.target, scheduled_balls: 120
      }
    };
    const prediction = await evaluateCricket(mlPayload);
    if (generation !== replayGeneration) return; // Old request finished after restart.
    matchState = state;
    playerScores.set(`p${row.batterId}`, prediction.batter.trustScore);
    playerScores.set(`p${row.bowlerId}`, prediction.bowler.trustScore);
    currentPayload = makePayload(row, state, prediction, playerScores, replayRoster);
    emit('cricket-live-data', currentPayload);
    replayCursor = cursor + 1;
    if (replayCursor >= replayRows.length) {
      replayFinished = true;
      clearInterval(replayTimer);
      replayTimer = null;
      console.log('[CRICKET] Replay finished');
      emit('cricket-replay-ended', { matchId, deliveries: replayRows.length });
    }
  } catch (err) {
    console.error('[CRICKET] Failed to process delivery:', err.message);
    emit('cricket-error', { message: err.message });
  } finally {
    replayBusy = false;
  }
}

async function startCricketReplay({ restart = false } = {}) {
  prepareCricketReplay();
  if (replayTimer && !restart) return getCricketReplayStatus();
  // Safe single-replay ownership: clear any existing timer first.
  if (replayTimer) clearInterval(replayTimer);
  replayTimer = null;
  replayGeneration += 1;
  const generation = replayGeneration;
  if (restart || replayFinished) {
    resetState();
    emit('cricket-replay-reset', { matchId, firstDelivery: replayRows[0].delivery });
  }
  // Wait for an in-flight ML request from the old replay to settle.
  const kickoff = async () => {
    if (generation !== replayGeneration) return;
    if (replayBusy) { setTimeout(kickoff, 100); return; }
    await tickCricket(generation);
    if (generation === replayGeneration && !replayFinished && !replayTimer) {
      replayTimer = setInterval(() => tickCricket(generation), ms);
    }
  };
  await kickoff();
  return getCricketReplayStatus();
}
async function selectCricketMatch(nextId) {
  const requestedId = clean(nextId);
  const options = getCricketMatches().matches;
  if (!options.some(item => item.id === requestedId)) {
    const error = new Error(`Match ID ${requestedId || '(empty)'} not found`);
    error.status = 400;
    throw error;
  }
  // Clear the timer and invalidate any pending prediction from the old match.
  if (replayTimer) clearInterval(replayTimer);
  replayTimer = null;
  replayGeneration += 1;
  matchId = requestedId;
  replayRows = null;
  replayRoster = null;
  replayTarget = null;
  currentPayload = null;
  resetState();
  prepareCricketReplay();
  emit('cricket-replay-reset', { matchId, firstDelivery: replayRows[0].delivery });
  emit('init-roster', cricketInitialData);
  await startCricketReplay();
  return getCricketReplayStatus();
}
function getCurrentCricketPayload() { return currentPayload; }
function getCricketReplayStatus() {
  prepareCricketReplay();
  return {
    matchId, firstDelivery: replayRows[0].delivery,
    lastDelivery: replayRows[replayRows.length - 1].delivery,
    totalEvents: replayRows.length, processedEvents: replayCursor,
    running: Boolean(replayTimer), finished: replayFinished
  };
}
module.exports = {
  prepareCricketReplay, startCricketReplay, selectCricketMatch, getCricketMatches, getCurrentCricketPayload, getCricketReplayStatus
};
