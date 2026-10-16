import React, { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import CricketField from '../components/cricket/CricketField';
import Sidebar from '../components/cricket/Sidebar';
import MatchSelector from '../components/cricket/MatchSelector';


function parseDeliveryInfo(deliveryId) {
  if (!deliveryId || typeof deliveryId !== 'string') {
    return {
      inningsNumber: '-',
      inningsLabel: '-',
      over: '-',
      ball: '-'
    };
  }

  const parts = deliveryId.split('.');
  const inningsNumber = parts[0] || '-';
  const over = parts[1] || '-';
  const ball = parts[2] || '-';

  let inningsLabel = `${inningsNumber}th Innings`;
  if (inningsNumber === '1') inningsLabel = '1st Innings';
  if (inningsNumber === '2') inningsLabel = '2nd Innings';
  if (inningsNumber === '3') inningsLabel = '3rd Innings';
  if (inningsNumber === '4') inningsLabel = '4th Innings';

  return {
    inningsNumber,
    inningsLabel,
    over,
    ball
  };
}

export default function CricketDashboard() {
  const [matchData, setMatchData] = useState({
    onField: [],
    homeSubs: [],
    awaySubs: [],
    time: '00:00',
    runs: 0,
    wickets: 0,
    deliveryId: '',
    batter: null,
    bowler: null,
    pressure: null
  });

  const [playerMeta, setPlayerMeta] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [matchFinished, setMatchFinished] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const socket = io('http://localhost:5000/cricket');

    socket.on('connect', () => {
      console.log('Connected to cricket backend:', socket.id);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket Connection Error:', error.message);
    });

    socket.on('init-roster', (roster) => {
      console.log('Received init-roster data:', roster);

      const metaLookup = {};
      const startingPositions = [];

      const extractTeam = (teamList, teamName) => {
        if (!Array.isArray(teamList)) return;

        teamList.forEach((entry) => {
          const [playerId, [name, photo, initialTrust, x, y]] = Object.entries(entry)[0];

          metaLookup[playerId] = {
            id: playerId,
            name,
            photo,
            initialTrustScore: initialTrust,
            team: teamName
          };

          startingPositions.push({
            id: playerId,
            x,
            y
          });
        });
      };

      extractTeam(roster.team1, 'Team 1');
      extractTeam(roster.team_2, 'Team 2');

      setPlayerMeta(metaLookup);
      setMatchData((prev) => ({ ...prev, onField: startingPositions }));
    });

    socket.on('cricket-live-data', (data) => {
      if (data) {
        setMatchData((prev) => ({ ...prev, ...data }));
      }
    });
    socket.on('cricket-replay-reset', () => {
      setMatchFinished(false);
      setMatchData(prev => ({
        ...prev,
        deliveryId: '',
        runs: 0,
        wickets: 0,
        overs: '0.0',
        innings: 1,
        batter: null,
        bowler: null,
        pressure: null,
        onField: [],
        homeSubs: [],
        awaySubs: []
      }));
    });

socket.on('cricket-replay-ended', () => {
  setMatchFinished(true);
});

    return () => socket.disconnect();
  }, []);

  const enrichedOnField = useMemo(() => {
    return (matchData.onField || []).map((player) => {
      const meta = playerMeta[player.id];
      return {
        ...player,
        name: meta ? meta.name : (player.name || player.id),
        photo: meta ? meta.photo : null,
        trustScore: player.trustScore ?? meta?.initialTrustScore ?? 50,
        team: meta ? meta.team : 'Unknown',
        role: player.role || 'player'
      };
    });
  }, [matchData.onField, playerMeta]);

  const visiblePlayers = useMemo(() => {
    const batterFieldId = matchData?.batter?.id ? `p${matchData.batter.id}` : null;
    const bowlerFieldId = matchData?.bowler?.id ? `p${matchData.bowler.id}` : null;

    const selected = enrichedOnField.filter(
      (p) => p.id === batterFieldId || p.id === bowlerFieldId
    );

    return selected.map((p) => ({
      ...p,
      displayRole: p.id === batterFieldId ? 'Batter' : 'Bowler'
    }));
  }, [enrichedOnField, matchData.batter, matchData.bowler]);

  const deliveryInfo = parseDeliveryInfo(matchData.deliveryId);

  const handlePlayerClick = (player) => {
    setSelectedPlayerId(player.id);
    setIsSidebarOpen(true);
  };

  const selectedPlayer =
    visiblePlayers.find((p) => p.id === selectedPlayerId) || null;
const restartMatch = async () => {
  if (restarting) return;

  setRestarting(true);

  try {
    const response = await fetch(
      'http://localhost:5000/api/cricket/restart',
      {
        method: 'POST'
      }
    );

    if (!response.ok) {
      throw new Error('Failed to restart match');
    }

    setMatchFinished(false);
    console.log('Match restarted successfully');

  } catch (error) {
    console.error('Restart error:', error);
    alert('Could not restart the match');
  } finally {
    setRestarting(false);
  }
};
  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000',
        overflow: 'hidden'
      }}
    >
      <CricketField
        players={visiblePlayers}
        onPlayerClick={handlePlayerClick}
        selectedPlayerId={selectedPlayerId}
        deliveryId={matchData.deliveryId}
      />

      {/* TOP CENTER - compact delivery badge */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: '10px',
          fontSize: '1.1rem',
          fontWeight: 700,
          border: '1px solid #333',
          zIndex: 40
        }}
      >
        {matchData.deliveryId || 'Waiting...'}
      </div>

      {/* TOP RIGHT - innings / over / ball / score */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          width: '240px',
          background: 'rgba(0,0,0,0.88)',
          color: '#fff',
          border: '1px solid #333',
          borderRadius: '12px',
          padding: '16px',
          zIndex: 40,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
        }}
      >
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '10px', color: '#93c5fd' }}>
          Match Info
        </div>
        <MatchSelector />

        <div style={{ marginBottom: '8px', fontSize: '0.95rem' }}>
          <strong>Innings:</strong> {deliveryInfo.inningsLabel}
        </div>

        <div style={{ marginBottom: '8px', fontSize: '0.95rem' }}>
          <strong>Over:</strong> {deliveryInfo.over}
        </div>

        <div style={{ marginBottom: '8px', fontSize: '0.95rem' }}>
          <strong>Ball:</strong> {deliveryInfo.ball}
        </div>

        <div style={{ marginBottom: '8px', fontSize: '0.95rem' }}>
          <strong>Score:</strong> {matchData.runs ?? 0}/{matchData.wickets ?? 0}
        </div>

        <div style={{ marginBottom: '8px', fontSize: '0.95rem' }}>
          <strong>Wickets:</strong> {matchData.wickets ?? 0}
        </div>

        <div style={{ marginBottom: '8px', fontSize: '0.95rem' }}>
          <strong>Pressure:</strong> {matchData.pressure?.score ?? '-'}
        </div>

        <div style={{ marginTop: '12px', fontSize: '0.85rem', color: '#a1a1aa' }}>
          <div><strong>Batter:</strong> {matchData.batter?.name || '-'}</div>
          <div><strong>Bowler:</strong> {matchData.bowler?.name || '-'}</div>
        </div>

        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{
            marginTop: '14px',
            width: '100%',
            padding: '10px 12px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          {isSidebarOpen ? 'Close Player Details' : 'Open Player Details'}
        </button>
        <button
  onClick={restartMatch}
  disabled={restarting}
  style={{
    marginTop: '14px',
    width: '100%',
    padding: '12px',
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: restarting ? 'wait' : 'pointer'
  }}
>
  {restarting ? 'Restarting...' : '↻ Restart Match'}
</button>
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        players={visiblePlayers}
        selectedPlayer={selectedPlayer}
      />
    </div>
  );
}