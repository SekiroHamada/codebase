const { evaluateCricket } = require('./cricketMlService');

/**
 * Feeds every delivery of the replay, in order, to the cricket ML service (ml_service/, port 8001)
 * and keeps the latest trust score per player.
 *
 * The service is stateful: deliveries must arrive as event_index 0, 1, 2, ... for one match.
 * If it is down or restarts, we resend the replay so far from event 0 (it resets on event 0),
 * so its rolling trust state is always complete. While it is unavailable, players keep 100.
 */
class CricketTrustClient {
  constructor() {
    this.reset();
    this.disabledReason = null;
    this.lastLog = 0;
  }

  reset() {
    this.history = [];     // ML request per delivery of the current replay
    this.synced = -1;      // last event_index the service has accepted
    this.trust = new Map(); // 'p<id>' -> trustScore
    this.last = null;      // last full ML reply
    this.disabledReason = null;
  }

  _log(msg) {
    const now = Date.now();
    if (now - this.lastLog > 15000) { console.error(`[CRICKET-ML] ${msg}`); this.lastLog = now; }
  }

  /** Append a delivery and bring the service up to date. Never throws. */
  async push(request) {
    request.event_index = this.history.length;
    this.history.push(request);
    if (this.disabledReason) return;
    while (this.synced < this.history.length - 1) {
      const next = this.history[this.synced + 1];
      try {
        const reply = await evaluateCricket(next);
        this.synced += 1;
        this.last = reply;
        if (reply.batter) this.trust.set(`p${reply.batter.id}`, reply.batter.trustScore);
        if (reply.bowler) this.trust.set(`p${reply.bowler.id}`, reply.bowler.trustScore);
      } catch (err) {
        const status = err.response && err.response.status;
        const detail = err.response && err.response.data && err.response.data.detail;
        if (status === 409) {            // service lost or reordered state: resend from event 0
          this.synced = -1;
          this.trust.clear();
          this._log(`state out of sync (${detail}); resending replay from delivery 0`);
          continue;
        }
        if (status === 400) {            // model was trained for a different held-out match
          this.disabledReason = detail || 'rejected';
          console.error(`[CRICKET-ML] disabled for this replay: ${this.disabledReason}`);
          return;
        }
        this.synced = -1;                // down / 503 (model not trained): retry from 0 on the next delivery
        this.trust.clear();
        this._log(`cricket ML service unavailable (${status || err.code || err.message}); trust stays at 100 until it is back`);
        return;
      }
    }
  }

  /** Live trust; players not yet scored get the model's neutral 50 (100 while the service is off). */
  trustOf(id) {
    if (this.trust.has(id)) return this.trust.get(id);
    return this.synced >= 0 ? 50 : 100;
  }
}

module.exports = { CricketTrustClient };
