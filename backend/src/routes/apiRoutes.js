const express = require('express');
const router = express.Router();

// Basic health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'Backend is running' });
});

module.exports = router;