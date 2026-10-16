import React from 'react';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import CricketField from '../components/cricket/CricketField';

// Team labels must stay 'Team 1' / 'Team 2' — cricket PlayerDot colours by these.
const TEAM_NAMES = ['Team 1', 'Team 2'];

export default function CricketDashboard() {
  return (
    <DashboardLayout
      sport="cricket"
      title="Cricket"
      teamNames={TEAM_NAMES}
      scoreLabel="Runs"
      // Backend doesn't send cricket scores yet — shows "—" until team_1_runs / team_2_runs exist
      getScores={(m) => [m.team_1_runs, m.team_2_runs]}
      renderField={(props) => <CricketField {...props} />}
    />
  );
}
