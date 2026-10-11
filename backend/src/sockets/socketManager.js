const { activeClients } = require('../config/state');

module.exports = function initializeSockets(io) {
  // Cricket Connection Pathway
  const cricketNamespace = io.of('/cricket');
  cricketNamespace.on('connection', (socket) => {
    activeClients.cricket.set(socket.id, socket);
    
    socket.on('disconnect', () => {
      activeClients.cricket.delete(socket.id);
    });
  });

  // Football Connection Pathway
  const footballNamespace = io.of('/football');
  footballNamespace.on('connection', (socket) => {
    activeClients.football.set(socket.id, socket);
    
    socket.on('disconnect', () => {
      activeClients.football.delete(socket.id);
    });
  });
};