const express = require('express');
const { getFootballState } = require('../controllers/pipelineController');

const router = express.Router();

// Basic health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'Backend is running' });
});

// Current PFF replay state + full ML output per player (choke probability, CI, attributions, ...)
router.get('/football/state', (req, res) => {
  const state = getFootballState();
  if (!state) return res.status(503).json({ error: 'football pipeline not started yet' });
  res.json(state);
});

module.exports = router;
