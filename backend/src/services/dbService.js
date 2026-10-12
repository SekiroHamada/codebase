// Database persistence temporarily disabled due to CLI conflict
// const { PrismaClient } = require('@prisma/client');
// const prisma = new PrismaClient();

async function persistProcessedData(sport, dataPayload) {
  try {
    // Log instead of saving
    console.log(`[DB Bypass] Captured frame for ${sport}.`);
  } catch (error) {
    console.error(`Database Persistence Error:`, error.message);
  }
}

module.exports = { persistProcessedData };