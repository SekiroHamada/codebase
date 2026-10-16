const express = require('express');
const { getFootballState } = require('../controllers/pipelineController');

const router = express.Router();

const { startCricketReplay, getCricketReplayStatus, getCricketMatches, selectCricketMatch } = require('../controllers/cricketController');

router.get('/cricket/status', (req, res) => {
  try { res.json(getCricketReplayStatus()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/cricket/matches', (req, res) => {
  try { res.json(getCricketMatches()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/cricket/select', async (req, res) => {
  try { res.json(await selectCricketMatch(req.body?.matchId)); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

// Frontend restart action: does not select/change the backend-configured match.
router.post('/cricket/restart', async (req, res) => {
  try { res.json(await startCricketReplay({ restart: true })); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

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
