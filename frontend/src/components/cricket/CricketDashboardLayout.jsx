import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useMatchSocket from '../../hooks/useMatchSocket';
import PlayerNav from '../dashboard/PlayerNav';
import PlayerDetails from '../dashboard/PlayerDetails';
import TeamPlayers from './TeamPlayers';
import '../../styles/dashboard.css';
import '../../styles/cricket.css';

/**
 * Cricket version of the shared dashboard (components/dashboard/DashboardLayout.jsx),
 * kept separate so cricket changes never touch the football screens. Differences:
 *   - the field also receives `matchData` (it needs the current Hawkeye delivery)
 *   - the cards under the field are "Team Players" instead of benches
 */
export default function CricketDashboardLayout({
  sport,
  title,
  teamNames,
  scoreLabel,
  getScores,
  pitchSize,
  renderField,
  cameraModes,     // optional [{ id, label }]; first entry is the default view
  fillFieldStage,  // true = canvas fills the whole stage (field fits its own camera)
}) {
  const navigate = useNavigate();
  const { matchData, onField, homeSubs, awaySubs } = useMatchSocket(sport, teamNames);
  const [selectedId, setSelectedId] = useState(null);
  const [cameraMode, setCameraMode] = useState(cameraModes?.[0]?.id);
  const [homeName, awayName] = teamNames;

  const homeOnField = useMemo(() => onField.filter((p) => p.team === homeName), [onField, homeName]);
  const awayOnField = useMemo(() => onField.filter((p) => p.team === awayName), [onField, awayName]);

  // A selected player can be on the field or on a bench (after a substitution)
  const selectedPlayer =
    [...onField, ...homeSubs, ...awaySubs].find((p) => p.id === selectedId) || null;

  const [homeScore, awayScore] = getScores(matchData);

  return (
    <div className="dash">
      <span className="dash__blob dash__blob--sky" aria-hidden="true" />
      <span className="dash__blob dash__blob--pink" aria-hidden="true" />

      <div className="dash__shell">
        <PlayerNav
          title={title}
          teams={[
            { name: homeName, players: homeOnField },
            { name: awayName, players: awayOnField },
          ]}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onHome={() => navigate('/')}
        />

        <main className="dash__main">
          <section className="centre">
            <header className="centre__head">
              <div>
                <h1>Match</h1>
                <p>Watching {onField.length} players for pressure</p>
              </div>
              <div className="centre__status">
                {cameraModes?.length > 1 && (
                  <div className="cam-switch" role="radiogroup" aria-label="Camera view">
                    {cameraModes.map((m) => (
                      <button
                        key={m.id}
                        role="radio"
                        aria-checked={cameraMode === m.id}
                        className={cameraMode === m.id ? 'is-active' : ''}
                        onClick={() => setCameraMode(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="clock">{matchData.time}</span>
              </div>
            </header>

            <div className={`field-stage ${fillFieldStage ? 'field-stage--fill' : ''}`}>
              <div className="field-card">
                {renderField({
                  players: onField,
                  onPlayerClick: (p) => setSelectedId(p.id),
                  selectedPlayerId: selectedId,
                  ballPosition: matchData.ball,
                  cameraMode,
                  matchData,
                })}
              </div>
            </div>

            <div className="benches">
              <TeamPlayers
                teamName={homeName}
                players={homeSubs}
                variant="home"
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <TeamPlayers
                teamName={awayName}
                players={awaySubs}
                variant="away"
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          </section>

          <PlayerDetails
            teams={[
              { name: homeName, score: homeScore },
              { name: awayName, score: awayScore },
            ]}
            scoreLabel={scoreLabel}
            player={selectedPlayer}
            pitchSize={pitchSize}
          />
        </main>
      </div>
    </div>
  );
}
