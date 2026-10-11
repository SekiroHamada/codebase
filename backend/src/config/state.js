// Track connected sockets to satisfy strict state requirements
const activeClients = {
  cricket: new Map(),
  football: new Map()
};

// In-memory caching for immediate data retrieval
const dataCache = {
  cricket: [],
  football: []
};

module.exports = { activeClients, dataCache };