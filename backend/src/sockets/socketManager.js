const { activeClients } = require('../config/state');
const { footballInitialData, cricketInitialData } = require('../config/matchMetadata');

module.exports = function initializeSockets(io) {
  // Cricket Connection Pathway
  const cricketNamespace = io.of('/cricket');
  cricketNamespace.on('connection', (socket) => {
    console.log(`[CRICKET] Client connected: ${socket.id}`);
    activeClients.cricket.set(socket.id, socket);
    
    //for sending initial data
    socket.emit('init-roster', cricketInitialData);


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