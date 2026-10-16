const axios = require('axios');
const { ML_URL } = require('../config/pff');

/**
 * Client for the Python ML server (ml_server/).
 *   POST /init/football    {gameId}          -> pre-match trust for every player
 *   POST /predict/football {gameId, events}  -> trust for every player after these events
 *
 * Events are queued and sent in order, in batches, without blocking the 30 fps loop.
 * If the ML server is down or restarts, the client re-initialises the game and resends
 * every event released so far, so the server's state is always complete.
 */
class MlClient {
  constructor(onScores) {
    this.onScores = onScores;
    this.gameId = null;
    this.history = [];   // every event released so far (for resync)
    this.queue = [];
    this.ready = false;
    this.busy = false;
    this.lastError = 0;
  }

  _logError(where, err) {
    const now = Date.now();
    if (now - this.lastError > 10000) {
      console.error(`[ML] ${where} failed (${err.code || err.message}) - is the ML server running at ${ML_URL}? retrying...`);
      this.lastError = now;
    }
  }

  async init(gameId) {
    this.gameId = String(gameId);
    try {
      const res = await axios.post(`${ML_URL}/init/football`, { gameId: this.gameId }, { timeout: 8000 });
      this.ready = true;
      this.queue = this.history.slice();   // (re)send everything already released
      this.onScores(res.data, true);
      console.log(`[ML] game ${this.gameId} initialised (${Object.keys(res.data.players || {}).length} players)`);
      if (!this.busy) setImmediate(() => this._pump());
      return res.data;
    } catch (err) {
      this.ready = false;
      this._logError('init', err);
      return null;
    }
  }

  reset() {
    this.history = [];
    this.queue = [];
    this.ready = false;
  }

  enqueue(events) {
    if (!events.length) return;
    this.history.push(...events);
    this.queue.push(...events);
    this._pump();
  }

  async _pump() {
    if (this.busy || !this.gameId) return;
    if (!this.ready) {
      this.busy = true;
      const ok = await this.init(this.gameId);
      this.busy = false;
      setTimeout(() => this._pump(), ok ? 0 : 3000);
      return;
    }
    if (!this.queue.length) return;
    this.busy = true;
    const batch = this.queue.slice(0, 100);
    try {
      const res = await axios.post(`${ML_URL}/predict/football`, { gameId: this.gameId, events: batch }, { timeout: 15000 });
      this.queue.splice(0, batch.length);
      this.onScores(res.data, false);
    } catch (err) {
      this._logError('predict', err);
      this.ready = false;   // server down or restarted: re-init and resend history
    }
    this.busy = false;
    if (this.queue.length || !this.ready) setTimeout(() => this._pump(), this.ready ? 0 : 3000);
  }
}

module.exports = { MlClient };
