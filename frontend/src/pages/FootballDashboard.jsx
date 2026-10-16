import React from 'react';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import FootballField from '../components/football/FootballField';

// Team labels must stay 'Home' / 'Away' — football PlayerDot colours by these.
const TEAM_NAMES = ['Home', 'Away'];
const PITCH_SIZE_M = [105, 68]; // Metrica sample pitch, used to show metres
const CAMERA_MODES = [
  { id: 'overview', label: 'Overview' },
  { id: 'ball', label: 'Ball cam' },
];

export default function FootballDashboard() {
  return (
    <DashboardLayout
      sport="football"
      title="Football"
      teamNames={TEAM_NAMES}
      scoreLabel="Goals"
      getScores={(m) => [m.team_1_goals, m.team_2_goals]}
      pitchSize={PITCH_SIZE_M}
      cameraModes={CAMERA_MODES}
      fillFieldStage
      renderField={(props) => <FootballField {...props} />}
    />
  );
}
