/**
 * PFF FC World Cup 2022 replay pipeline (football).
 *
 *  - replays one match (config/pff.js, default 10517 = the 2022 final) on the PFF video clock:
 *      tracking frames (~29.97 fps, .jsonl.bz2) move the players and the ball,
 *      raw PFF events are released at their eventTime and sent, in order, to the ML server;
 *  - the ML server answers with a trust score for every player (ml_server/, docs/trust_formula.md);
 *  - every tick the frontend gets the same payload shape as before (socket `football-live-data`).
 *
 * Player ids are 'pff<playerId>'. Coordinates are 0-100 (x along the pitch, y across it).
 */
const { activeClients } = require('../config/state');
const { footballInitialData } = require('../config/matchMetadata');
const cfg = require('../config/pff');
const { loadMatch, TrackingReader } = require('../services/pffLoader');
const { MlClient } = require('../services/mlService');

const NAN = 'NaN';
let match = null;     // static data for the game
let live = null;      // replay state
let timer = null;
const ml = new MlClient(onScores);

// ------------------------------------------------------------------ helpers
const fmtClock = (sec) => {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '00:00.000';
  const m = Math.floor(sec / 60);
  const s = sec - 60 * m;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
};
const eventClock = (ev) => {
  const pe = ev.possessionEvents || {};
  const ge = ev.gameEvents || {};
  const c = pe.gameClock !== null && pe.gameClock !== undefined ? pe.gameClock : ge.startGameClock;
  return c === null || c === undefined ? null : Number(c);
};
const toPct = (x, y) => ({
  x: (x / match.pitch.length + 0.5) * 100,
  y: (0.5 - y / match.pitch.width) * 100,
});
const otherSide = (side) => (side === 'home' ? 'away' : 'home');

// ------------------------------------------------------------------ setup
function loadGame(gameId) {
  const m = loadMatch(gameId);
  const home = Number(m.meta.homeTeam.id);
  const players = new Map();                       // pid -> {id, pid, name, side}
  const jersey = { home: new Map(), away: new Map() };
  for (const r of m.roster) {
    const pid = Number(r.player.id);
    const side = Number(r.team.id) === home ? 'home' : 'away';
    players.set(pid, { id: `${cfg.ID_PREFIX}${pid}`, pid, name: r.player.nickname, side, started: !!r.started });
    jersey[side].set(String(r.shirtNumber), pid);
  }
  m.home = home;
  m.away = Number(m.meta.awayTeam.id);
  m.players = players;
  m.jersey = jersey;
  m.sideOf = (teamId) => (Number(teamId) === home ? 'home' : Number(teamId) === m.away ? 'away' : null);
  match = m;

  // roster for the frontend: { id: [name, photo, trust, x, y] }; trust slot = pre-match trust from the ML server
  footballInitialData.team1 = [];
  footballInitialData.team_2 = [];
  for (const p of players.values()) {
    const entry = { [p.id]: [p.name, '', 100, NAN, NAN] };
    (p.side === 'home' ? footballInitialData.team1 : footballInitialData.team_2).push(entry);
  }
  footballInitialData.players = players.size;
  footballInitialData.gameId = String(gameId);
  footballInitialData.homeTeam = m.meta.homeTeam.name;
  footballInitialData.awayTeam = m.meta.awayTeam.name;
  footballInitialData.team_1_goals = 0;
  footballInitialData.team_2_goals = 0;
  footballInitialData.ball_position = { x: NAN, y: NAN };
  footballInitialData.time_elapsed = '00:00.000';
  console.log(`[PFF] loaded game ${gameId}: ${m.meta.homeTeam.name} v ${m.meta.awayTeam.name} (${m.meta.date}), `
    + `${m.events.length} events, ${players.size} players, tracking ${require('fs').existsSync(m.trackingFile) ? 'yes' : 'NO (positions from event snapshots)'}`);
}

function newLiveState() {
  const tracking = new TrackingReader(match.trackingFile);
  return {
    tracking,
    vt: (match.events[0] && match.events[0].eventTime ? match.events[0].eventTime : 0) - 0.5,
    evIdx: 0,
    goals: { home: 0, away: 0 },
    pending: null,
    gameOver: false,
    shootout: null,
    clockSec: 0,
    period: 1,
    onPitch: new Set(),
    pos: new Map(),
    ball: { x: NAN, y: NAN },
    trust: new Map(),
    initialTrust: new Map(),
    details: {},
    mlMatch: null,
    ended: false,
  };
}

// ------------------------------------------------------------------ ML results
function onScores(data, isInit) {
  if (!live || !data || !data.players) return;
  for (const [pidStr, d] of Object.entries(data.players)) {
    const pid = Number(pidStr);
    live.trust.set(pid, d.trustScore);
    live.details[`${cfg.ID_PREFIX}${pid}`] = d;
    if (isInit && !live.initialTrust.has(pid)) live.initialTrust.set(pid, d.trustScore);
  }
  live.mlMatch = data.match || null;
  if (isInit) {
    // pre-match trust becomes the "original" trust the frontend shows (roster slot 2)
    for (const team of [footballInitialData.team1, footballInitialData.team_2]) {
      for (const entry of team) {
        const [id, arr] = Object.entries(entry)[0];
        const t = live.initialTrust.get(Number(id.slice(cfg.ID_PREFIX.length)));
        if (t !== undefined) arr[2] = t;
      }
    }
  }
}

// ------------------------------------------------------------------ replay
function applyFrame(frame) {
  const onPitch = new Set();
  for (const [side, key] of [['home', 'homePlayers'], ['away', 'awayPlayers']]) {
    const smooth = frame[`${key}Smoothed`] || [];
    const raw = frame[key] || [];
    const list = smooth.length ? smooth : raw;
    list.forEach((p, i) => {
      let { x, y } = p;
      if ((x === null || y === null) && raw[i]) ({ x, y } = raw[i]);
      const pid = match.jersey[side].get(String(p.jerseyNum));
      if (pid === undefined || x === null || y === null || x === undefined) return;
      live.pos.set(pid, toPct(x, y));
      onPitch.add(pid);
    });
  }
  if (onPitch.size) live.onPitch = onPitch;
  let b = frame.ballsSmoothed;
  if (!b || b.x === null || b.x === undefined) b = (frame.balls || [])[0];
  live.ball = b && b.x !== null && b.x !== undefined ? toPct(b.x, b.y) : { x: NAN, y: NAN };
  if (frame.periodGameClockTime !== null && frame.periodGameClockTime !== undefined) live.clockSec = frame.periodGameClockTime;
  if (frame.period) live.period = frame.period;
}

function applySnapshot(ev) {
  // used when there is no tracking (e.g. the penalty shootout, which tracking does not cover)
  const onPitch = new Set();
  for (const key of ['homePlayers', 'awayPlayers']) {
    for (const p of ev[key] || []) {
      if (p.playerId === null || p.playerId === undefined || p.x === null || p.y === null) continue;
      const pid = Number(p.playerId);
      if (!match.players.has(pid)) continue;
      live.pos.set(pid, toPct(p.x, p.y));
      onPitch.add(pid);
    }
  }
  if (onPitch.size) live.onPitch = onPitch;
  const b = (ev.ball || [])[0];
  if (b && b.x !== null && b.x !== undefined) live.ball = toPct(b.x, b.y);
  const c = eventClock(ev);
  if (c !== null) live.clockSec = c;
}

function applyScore(ev) {
  // valid-goal rule (same as the ML server): ball in the net is confirmed at the next restart;
  // a kick-off is taken by the conceding team (this also credits own goals correctly)
  const ge = ev.gameEvents || {};
  const pe = ev.possessionEvents || {};
  const sp = ge.setpieceType;
  const side = match.sideOf(ge.teamId);
  if (live.pending && sp !== null && sp !== undefined && sp !== 'O') {
    if (sp === 'K' && side) live.goals[otherSide(side)] += 1;
    live.pending = null;
  }
  if (ge.gameEventType === 'END') {
    if (live.pending) {
      const p = live.pending;
      live.goals[p.wasShot ? p.side : otherSide(p.side)] += 1;
      live.pending = null;
    }
    if (ge.endType === 'G') live.gameOver = true;
  }
  if (pe.possessionEventType === 'SH' && live.gameOver && sp === 'P' && side) {
    if (!live.shootout) live.shootout = { home: 0, away: 0 };
    if (pe.shotOutcomeType === 'G') live.shootout[side] += 1;
  }
  if (pe.shotOutcomeType === 'G' && !live.gameOver && side) {
    live.pending = { side, wasShot: pe.possessionEventType === 'SH' };
  }
  if (ge.period) live.period = ge.period;
}

function releaseEventsUntil(t) {
  const batch = [];
  const noTracking = !live.tracking.available || live.tracking.exhausted;
  while (live.evIdx < match.events.length && (match.events[live.evIdx].eventTime || 0) <= t) {
    const ev = match.events[live.evIdx++];
    applyScore(ev);
    if (noTracking) applySnapshot(ev);
    batch.push(ev);
  }
  if (batch.length) ml.enqueue(batch);
}

function tick() {
  if (!live || live.ended) return emit();
  const dtv = cfg.REPLAY_SPEED / cfg.FPS;
  const tr = live.tracking;
  if (tr.available && !tr.ended && tr.queue.length === 0) return emit();   // tracking buffer still filling
  live.vt += dtv;

  // skip dead video (half-time, breaks): jump to the next frame / event
  const nextFrame = tr.peekTime();
  const nextEv = live.evIdx < match.events.length ? match.events[live.evIdx].eventTime : null;
  const next = [nextFrame, nextEv].filter((v) => v !== null && v !== undefined);
  if (next.length && Math.min(...next) - live.vt > 2) live.vt = Math.min(...next) - 0.05;

  const frame = tr.takeUntil(live.vt);
  if (frame) applyFrame(frame);
  releaseEventsUntil(live.vt);

  if (live.evIdx >= match.events.length && tr.exhausted) {
    live.ended = true;
    console.log(`[PFF] replay of game ${match.meta.id} finished: ${live.goals.home}-${live.goals.away}`
      + (live.shootout ? ` (pens ${live.shootout.home}-${live.shootout.away})` : ''));
    if (cfg.LOOP) setTimeout(restart, 10000);
  }
  emit();
}

// ------------------------------------------------------------------ payload (unchanged shape for the frontend)
function buildFrontendPayload() {
  const onField = [];
  const homeSubs = [];
  const awaySubs = [];
  for (const team of [footballInitialData.team1, footballInitialData.team_2]) {
    for (const entry of team) {
      const [id, arr] = Object.entries(entry)[0];
      const pid = Number(id.slice(cfg.ID_PREFIX.length));
      const p = match.players.get(pid);
      const trust = live.trust.has(pid) ? live.trust.get(pid) : arr[2];
      const pos = live.onPitch.has(pid) ? live.pos.get(pid) : null;
      arr[3] = pos ? pos.x : NAN;            // keep the init-roster snapshot current for late joiners
      arr[4] = pos ? pos.y : NAN;
      if (pos) onField.push({ id, name: p.name, x: pos.x, y: pos.y, trustScore: trust });
      else (p.side === 'home' ? homeSubs : awaySubs).push({ id, name: p.name, trustScore: trust });
    }
  }
  let time = fmtClock(live.clockSec);
  if (live.shootout) time += ` · PENS ${live.shootout.home}-${live.shootout.away}`;
  footballInitialData.time_elapsed = time;
  footballInitialData.ball_position = live.ball;
  footballInitialData.team_1_goals = live.goals.home;
  footballInitialData.team_2_goals = live.goals.away;
  return {
    time,
    ball: live.ball,
    team_1_goals: live.goals.home,
    team_2_goals: live.goals.away,
    onField,
    homeSubs,
    awaySubs,
    // extra fields (ignored by the current frontend)
    match: {
      gameId: String(match.meta.id),
      home: match.meta.homeTeam.name,
      away: match.meta.awayTeam.name,
      period: live.period,
      shootout: live.shootout,
      ended: live.ended,
    },
  };
}

function emit() {
  if (!live) return;
  const payload = buildFrontendPayload();
  for (const socket of activeClients.football.values()) {
    socket.emit('football-live-data', payload);
  }
}

// ------------------------------------------------------------------ lifecycle
async function restart() {
  if (live && live.tracking) live.tracking.close();
  loadGame(cfg.GAME_ID);
  live = newLiveState();
  ml.reset();
  await ml.init(cfg.GAME_ID);
  if (cfg.START_MINUTE > 0) {
    const target = cfg.START_MINUTE * 60;
    let i = 0;
    while (i < match.events.length && (eventClock(match.events[i]) ?? 0) < target) i += 1;
    if (i < match.events.length) {
      releaseEventsUntil(match.events[i].eventTime - 1e-6);
      live.vt = match.events[i].eventTime - 0.5;
      live.tracking.skipUntil(live.vt);
      console.log(`[PFF] starting at minute ${cfg.START_MINUTE} (${i} earlier events sent to the ML server)`);
    }
  }
}

async function startAutoPipeline(sport) {
  if (sport !== 'football') return;
  await restart();
  console.log(`[PFF] replay running at ${cfg.REPLAY_SPEED}x, ${cfg.FPS} fps (ML server: ${cfg.ML_URL}; `
    + `tracking via ${live.tracking.via || 'event snapshots'})`);
  if (!timer) timer = setInterval(tick, 1000 / cfg.FPS);
}

function getFootballState() {
  if (!live || !match) return null;
  return {
    gameId: String(match.meta.id),
    home: match.meta.homeTeam.name,
    away: match.meta.awayTeam.name,
    clock: fmtClock(live.clockSec),
    period: live.period,
    score: live.goals,
    shootout: live.shootout,
    ended: live.ended,
    eventsReleased: live.evIdx,
    eventsTotal: match.events.length,
    mlQueue: ml.queue.length,
    mlReady: ml.ready,
    mlMatch: live.mlMatch,
    players: live.details,
  };
}

module.exports = { startAutoPipeline, getFootballState, buildFrontendPayload };
