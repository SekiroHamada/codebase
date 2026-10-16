const { cricketState } = require('../config/cricketState');

/**
 * Extra /cricket connection handler, added alongside the shared socketManager.
 * The shared handler sends 'init-roster' and tracks the client; this one then
 * sends the current delivery, because cricket only emits once per delivery.
 * Call it after initializeSockets(io) so the roster arrives first.
 */
module.exports = function initializeCricketSockets(io) {
  io.of('/cricket').on('connection', (socket) => {
    if (cricketState.latestPayload) {
      socket.emit('cricket-live-data', cricketState.latestPayload);
    }
  });
};
