const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const initializeSockets = require('./sockets/socketManager');
const initializeCricketSockets = require('./sockets/cricketSocketManager');
const apiRoutes = require('./routes/apiRoutes');
const { startAutoPipeline } = require('./controllers/pipelineController');
const { startAutoPipeline: startCricketPipeline } = require('./controllers/cricketPipelineController');

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// Initialize WebSocket namespaces[cite: 12]
initializeSockets(io);
initializeCricketSockets(io); // after the shared handler, so 'init-roster' is sent first

// Mount HTTP routes
app.use('/api', apiRoutes);

httpServer.listen(5000, () => {
  console.log('Backend server running on port 5000');
  
  // Automatically start the continuous data pipelines on boot
  startAutoPipeline('football').catch((err) => console.error('[PFF] football pipeline failed to start:', err.message));
  startCricketPipeline(); // Hawkeye ball-by-ball replay (controllers/cricketPipelineController.js)
});