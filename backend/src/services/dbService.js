const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function persistProcessedData(sport, dataPayload) {
  try {
    if (sport === 'cricket') {
      await prisma.cricketMatchLog.create({ data: dataPayload });
    } else {
      await prisma.footballMatchLog.create({ data: dataPayload });
    }
  } catch (error) {
    console.error(`Database Persistence Error:`, error.message);
  }
}

module.exports = { persistProcessedData };