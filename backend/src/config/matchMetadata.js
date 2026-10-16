// Shape sent to the frontend on connect ('init-roster'). Filled from the PFF data by pipelineController.
// team1 / team_2 entries: { 'pff<playerId>': [name, photo, preMatchTrust, x, y] }  (x, y = 'NaN' when on the bench)
const footballInitialData = {
  players: 0,
  gameId: null,
  homeTeam: null,
  awayTeam: null,
  team_1_goals: 0,
  team_2_goals: 0,
  ball_position: { x: 'NaN', y: 'NaN' },
  time_elapsed: "00:00.000",
  team1: [],
  team_2: []
};

const cricketInitialData = {
  players: 22,
  team1: [],
  team_2: []
};

module.exports = { footballInitialData, cricketInitialData };
