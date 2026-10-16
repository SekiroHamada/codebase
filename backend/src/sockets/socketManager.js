const { activeClients } = require('../config/state');
const { footballInitialData, cricketInitialData } = require('../config/matchMetadata');
const { startCricketReplay, getCurrentCricketPayload, getCricketReplayStatus } = require('../controllers/cricketController');

module.exports = function initializeSockets(io) {
  // Cricket Connection Pathway
  const cricketNamespace = io.of('/cricket');
  cricketNamespace.on('connection', (socket) => {
    console.log(`[CRICKET] Client connected: ${socket.id}`);
    activeClients.cricket.set(socket.id, socket);
    
    //for sending initial data
    const status = getCricketReplayStatus();
    socket.emit('init-roster', cricketInitialData);
    const latest = getCurrentCricketPayload();
    if (latest) socket.emit('cricket-live-data', latest);
    // Start only when the first cricket frontend actually joins.
    if (!status.running && !status.finished && status.processedEvents === 0) {
      startCricketReplay().catch(error => console.error('[CRICKET]', error.message));
    }
    if (status.finished) socket.emit('cricket-replay-ended', {matchId: status.matchId});


    socket.on('disconnect', () => {
      console.log(`[CRICKET] Client disconnected: ${socket.id}`);
      activeClients.cricket.delete(socket.id);
    });
  });

  // Football Connection Pathway
  const footballNamespace = io.of('/football');
  footballNamespace.on('connection', (socket) => {
    console.log(`[FOOTBALL] Client connected: ${socket.id}`);
    activeClients.football.set(socket.id, socket);
    
    //for sending initial data
    socket.emit('init-roster', footballInitialData);

    socket.on('disconnect', () => {
      console.log(`[FOOTBALL] Client disconnected: ${socket.id}`);
      activeClients.football.delete(socket.id);
    });
  });
};