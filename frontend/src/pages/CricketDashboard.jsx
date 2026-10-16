import React from 'react';
import CricketDashboardLayout from '../components/cricket/CricketDashboardLayout';
import CricketField from '../components/cricket/CricketField';

// Team labels must stay 'Team 1' / 'Team 2' — cricket PlayerDot colours by these.
// Team 1 is the side that bats first in the replayed Hawkeye match.
const TEAM_NAMES = ['Team 1', 'Team 2'];
const CAMERA_MODES = [
  { id: 'overview', label: 'Overview' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'ball', label: 'Ball cam' },
];

const fmtScore = (runs, wickets) => (runs == null ? undefined : `${runs}/${wickets ?? 0}`);

export default function CricketDashboard() {
  return (
    <CricketDashboardLayout
      sport="cricket"
      title="Cricket"
      teamNames={TEAM_NAMES}
      scoreLabel="Runs"
      getScores={(m) => [fmtScore(m.team_1_runs, m.team_1_wickets), fmtScore(m.team_2_runs, m.team_2_wickets)]}
      cameraModes={CAMERA_MODES}
      fillFieldStage
      renderField={(props) => <CricketField {...props} />}
    />
  );
}
