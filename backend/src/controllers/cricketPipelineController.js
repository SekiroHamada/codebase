const fs = require('fs');
const path = require('path');
const { activeClients } = require('../config/state');
const { cricketState } = require('../config/cricketState');
const { cricketInitialData } = require('../config/matchMetadata');

/**
 * Cricket replay pipeline (IPL Hawkeye ball-by-ball data).
 *
 * One CSV row = one delivery. Every DELIVERY_INTERVAL_MS the next delivery of the
 * selected match is sent to /cricket clients. The frontend (components/cricket/Ball.jsx)
 * turns the Hawkeye numbers into a 3D trajectory, so the backend sends them in metres,
 * in the data's own frame, and only cleans out impossible values.
 *
 * Hawkeye columns used (units inferred from the data):
 *   ballSpeed       release speed, m/s (-1 = missing)
 *   pitchX, pitchY  bounce point: lateral offset from middle stump / distance from the
 *                   batter's stumps, metres. Same lateral frame for every batter:
 *                   +X is the leg side of a right-hander.
 *   stumpsX/Y       where the ball passes the batter's stumps: lateral / height, metres
 *   fieldX/Y        where the ball was fielded, 0-96 grid with the ground centre at
 *                   (48, 48) and the boundary ~48 away. (5,5) = no shot, (0,0) = none.
 *
 * Env:
 *   CRICKET_MATCH_ID              match to replay (default: first match in the file)
 *   CRICKET_DELIVERY_INTERVAL_MS  time between deliveries (default 7000)
 */

const DATA_FILE = path.join(__dirname, '../../data/mensIPLHawkeyeStats.csv');
const DELIVERY_INTERVAL_MS = Number(process.env.CRICKET_DELIVERY_INTERVAL_MS) || 7000;
const PAUSE_AFTER_MATCH_MS = 15000;

// Ground geometry, mirrored from frontend/src/components/cricket/geometry.js.
// Player x/y are sent as % of the ground oval: (50, 50) = centre,
// y grows towards the batter's end, x grows to screen-right in the overview.
const FIELD_RX = 60;      // oval half-width, world units
const FIELD_RZ = 48;      // oval half-depth, world units
const PITCH_SCALE = 1.4;  // same as the frontend's PITCH_SCALE
const BATTER_Z = 11 * PITCH_SCALE;    // just in front of the batter's stumps (+12.5 x scale)
const BOWLER_Z = -14.5 * PITCH_SCALE; // behind the bowler's stumps (-12.5 x scale)
const SIDE_OFFSET = 1.8 * PITCH_SCALE; // keeps the dots off the stumps

const toPercent = (wx, wz) => ({
  x: +(50 + (wx / FIELD_RX) * 50).toFixed(2),
  y: +(50 + (wz / FIELD_RZ) * 50).toFixed(2),
});

// ---------------------------------------------------------------------------
// Load + clean
// ---------------------------------------------------------------------------
const num = (v) => {
  if (v === undefined || v === '' || v === 'NA' || v === 'NaN') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function parseCsv(file) {
  const [header, ...lines] = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  const cols = header.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    const row = {};
    cols.forEach((c, i) => { row[c] = cells[i] ?? ''; });
    return row;
  });
}

function cleanDelivery(row) {
  const [innings, over, seq] = row.delivery.split('.').map(Number);

  const speed = num(row.ballSpeed);
  const px = num(row.pitchX);
  const py = num(row.pitchY);
  const sx = num(row.stumpsX);
  const sy = num(row.stumpsY);
  const fx = num(row.fieldX);
  const fy = num(row.fieldY);

  // A pitch is 20.12 m long; anything far outside it is a tracking glitch.
  const pitch = px !== null && py !== null && Math.abs(px) < 3 && py > -2 && py < 21 ? { x: px, y: py } : null;
  const stumps = sx !== null && sy !== null && Math.abs(sx) < 3 && sy >= 0 && sy < 4 ? { x: sx, y: sy } : null;
  const noShot = fx === null || fy === null || (fx === 0 && fy === 0) || (fx === 5 && fy === 5);

  const dismissal = row.dismissalDetails.trim();
  const extras = row.extras.trim();

  return {
    innings,
    over,
    seq,
    legalBall: Number(row.ball),
    isLegal: !/Wd|Nb/.test(extras),
    batterId: `p${row.batterId}`,
    batter: row.batter,
    rightHandedBat: row.rightHandedBat === 'TRUE',
    nonStrikerId: `p${row.nonStrikerId}`,
    nonStriker: row.nonStriker,
    bowlerId: `p${row.bowlerId}`,
    bowler: row.bowler,
    rightArmedBowl: row.rightArmedBowl === 'TRUE',
    bowlingStyle: row.bowlingStyle,
    speed: speed !== null && speed > 0 ? speed : null,
    pitch,
    stumps,
    field: noShot ? null : { x: fx, y: fy },
    runs: Number(row.runs) || 0,
    batterRuns: Number(row.batterRuns) || 0,
    extras: extras || null,
    dismissal: dismissal || null,
    isWicket: !!dismissal && !/^retired/i.test(dismissal),
  };
}

const allRows = parseCsv(DATA_FILE);
const matchId = process.env.CRICKET_MATCH_ID || allRows[0].matchId;
const deliveries = allRows.filter((r) => r.matchId === matchId).map(cleanDelivery);
if (deliveries.length === 0) {
  throw new Error(`[CRICKET] No deliveries found for match ${matchId} in ${DATA_FILE}`);
}

// ---------------------------------------------------------------------------
// Teams: Team 1 bats first. Players are placed from innings 1 & 2 roles;
// super-over innings (3+) only add players the first two innings didn't show.
// ---------------------------------------------------------------------------
const playerTeam = new Map(); // id -> 1 | 2
const playerName = new Map();
const assign = (id, name, team) => {
  playerName.set(id, name);
  if (!playerTeam.has(id)) playerTeam.set(id, team);
};

deliveries.forEach((d) => {
  if (d.innings > 2) return;
  const battingTeam = d.innings === 1 ? 1 : 2;
  assign(d.batterId, d.batter, battingTeam);
  assign(d.nonStrikerId, d.nonStriker, battingTeam);
  assign(d.bowlerId, d.bowler, 3 - battingTeam);
});

// Batting team per innings, decided by who actually batted in it
const inningsBattingTeam = new Map();
deliveries.forEach((d) => {
  if (inningsBattingTeam.has(d.innings)) return;
  const known = playerTeam.get(d.batterId) ?? (playerTeam.has(d.bowlerId) ? 3 - playerTeam.get(d.bowlerId) : null);
  inningsBattingTeam.set(d.innings, known ?? (d.innings % 2 === 1 ? 1 : 2));
});
deliveries.forEach((d) => {
  const bat = inningsBattingTeam.get(d.innings);
  assign(d.batterId, d.batter, bat);
  assign(d.nonStrikerId, d.nonStriker, bat);
  assign(d.bowlerId, d.bowler, 3 - bat);
});

const teamIds = { 1: [], 2: [] };
for (const [id, team] of playerTeam) teamIds[team].push(id);

// Roster in the same shape as football: { pId: [name, photo, trust, x, y] }
cricketInitialData.matchId = matchId;
cricketInitialData.players = playerTeam.size;
cricketInitialData.team1 = teamIds[1].map((id) => ({ [id]: [playerName.get(id), '', 100, 'NaN', 'NaN'] }));
cricketInitialData.team_2 = teamIds[2].map((id) => ({ [id]: [playerName.get(id), '', 100, 'NaN', 'NaN'] }));

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------
let pointer = 0;
let replay = 0; // bumps every time the match restarts, keeps delivery ids unique
let score = null;

const resetScore = () => {
  score = { 1: { runs: 0, wickets: 0 }, 2: { runs: 0, wickets: 0 } };
};
resetScore();

function buildPayload(d) {
  const battingTeam = inningsBattingTeam.get(d.innings);
  const s = score[battingTeam];
  s.runs += d.runs;
  if (d.isWicket) s.wickets += 1;

  const legalSoFar = d.isLegal ? d.legalBall : d.legalBall - 1;
  const overLabel = `${d.over - 1}.${legalSoFar}`;

  // Only the bowler and the striker stand on the field
  const batterSide = d.rightHandedBat ? -1 : 1; // body on the leg side of the stumps
  const bowlerSide = d.rightArmedBowl ? -1 : 1; // bowling arm side
  const striker = { id: d.batterId, name: d.batter, trustScore: 100, role: 'batter', ...toPercent(batterSide * SIDE_OFFSET, BATTER_Z) };
  const bowler = { id: d.bowlerId, name: d.bowler, trustScore: 100, role: 'bowler', ...toPercent(bowlerSide * SIDE_OFFSET, BOWLER_Z) };

  const onFieldIds = new Set([striker.id, bowler.id]);
  const bench = (team) =>
    teamIds[team].filter((id) => !onFieldIds.has(id)).map((id) => ({ id, name: playerName.get(id) }));

  return {
    matchId,
    time: `Inn ${d.innings} · ${overLabel} ov`,
    team_1_runs: score[1].runs,
    team_1_wickets: score[1].wickets,
    team_2_runs: score[2].runs,
    team_2_wickets: score[2].wickets,
    battingTeam,
    onField: [striker, bowler],
    homeSubs: bench(1),
    awaySubs: bench(2),
    delivery: {
      id: `${replay}:${d.innings}.${d.over}.${d.seq}`,
      innings: d.innings,
      over: overLabel,
      bowler: d.bowler,
      batter: d.batter,
      rightHandedBat: d.rightHandedBat,
      rightArmedBowl: d.rightArmedBowl,
      bowlingStyle: d.bowlingStyle,
      speed: d.speed,
      pitch: d.pitch,
      stumps: d.stumps,
      field: d.field,
      runs: d.runs,
      batterRuns: d.batterRuns,
      extras: d.extras,
      dismissal: d.dismissal,
      isWicket: d.isWicket,
    },
  };
}

function broadcast(payload) {
  cricketState.latestPayload = payload;
  for (const socket of activeClients.cricket.values()) {
    socket.emit('cricket-live-data', payload);
  }
}

function tick() {
  if (pointer >= deliveries.length) {
    pointer = 0;
    replay += 1;
    resetScore();
    setTimeout(tick, PAUSE_AFTER_MATCH_MS);
    return;
  }
  broadcast(buildPayload(deliveries[pointer]));
  pointer += 1;
  setTimeout(tick, DELIVERY_INTERVAL_MS);
}

function startAutoPipeline() {
  console.log(
    `Initialized Hawkeye cricket pipeline: match ${matchId}, ${deliveries.length} deliveries, ` +
      `${playerTeam.size} players, one delivery every ${DELIVERY_INTERVAL_MS} ms.`
  );
  tick();
}

module.exports = { startAutoPipeline };
