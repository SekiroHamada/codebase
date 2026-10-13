import React, { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import FootballField from '../components/football/FootballField';
import Bench from '../components/football/Bench';
import Sidebar from '../components/football/Sidebar';
import ScoreBoard from '../components/football/ScoreBoard';

export default function FootballDashboard() {
  const [matchData, setMatchData] = useState({
    onField: [],
    homeSubs: [],
    awaySubs: [],
    time: "00:00.000",
    ball: { x: 50, y: 50 },
    team_1_goals: 0,
    team_2_goals: 0
  });
  const [playerMeta, setPlayerMeta] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  useEffect(() => {
    const socket = io('http://localhost:5000/football');

    socket.on('connect', () => {
      console.log('Successfully connected to backend with ID:', socket.id);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket Connection Error:', error.message);
    });
    
    // 1. Listen for initial roster metadata handshake
    socket.on('init-roster', (roster) => {
      console.log('Received init-roster data:', roster);
      const metaLookup = {};
      const startingPositions = [];
      const initialHomeSubs = [];
      const initialAwaySubs = [];

      const extractTeam = (teamList, teamName, subsArray) => {
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

          // Sort players into on-field or bench based on coordinate validity
          if (x !== 'NaN' && y !== 'NaN') {
            startingPositions.push({
              id: playerId,
              x: x, 
              y: y
            });
          } else {
            subsArray.push({
              id: playerId,
              name: name
            });
          }
        });
      };

      // Extract and sort both teams
      extractTeam(roster.team1, 'Home', initialHomeSubs);
      extractTeam(roster.team_2, 'Away', initialAwaySubs);
      
      setPlayerMeta(metaLookup);
      
      // Initialize the match state with the sorted players
      setMatchData(prev => ({ 
        ...prev, 
        onField: startingPositions,
        homeSubs: initialHomeSubs,
        awaySubs: initialAwaySubs,
        time: roster.time_elapsed || "00:00.000",
        team_1_goals: roster.team_1_goals || 0,
        team_2_goals: roster.team_2_goals || 0,
        ball: (roster.ball_position && roster.ball_position.x !== 'NaN') ? roster.ball_position : { x: 50, y: 50 }
      }));
    });

    // 2. Listen for continuous live frame updates
    socket.on('football-live-data', (data) => {
      if (data) {
        setMatchData(prev => ({ ...prev, ...data }));
      }
    });

    return () => socket.disconnect();
  }, []);

  // Merge spatial tracking data with static metadata
  const enrichedOnField = useMemo(() => {
    return matchData.onField.map(player => {
      const meta = playerMeta[player.id];
      return {
        ...player,
        name: meta ? meta.name : (player.name || player.id),
        photo: meta ? meta.photo : null,
        trustScore: player.trustScore ?? meta?.initialTrustScore ?? 100,
        team: meta ? meta.team : 'Unknown'
      };
    });
  }, [matchData.onField, playerMeta]);

  const handlePlayerClick = (player) => {
    setSelectedPlayerId(player.id);
    setIsSidebarOpen(true);
  };

  const selectedPlayer = enrichedOnField.find(p => p.id === selectedPlayerId) || null;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#000', overflow: 'hidden' }}>
      <FootballField 
        players={enrichedOnField} 
        onPlayerClick={handlePlayerClick}
        selectedPlayerId={selectedPlayerId}
        ballPosition={matchData.ball}
      />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40 }}>
        
        <ScoreBoard 
          time={matchData.time}
          team1Score={matchData.team_1_goals}
          team2Score={matchData.team_2_goals}
          team1Name="HOME"
          team2Name="AWAY"
        />

        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{ 
            position: 'absolute', 
            top: '20px', 
            right: '20px', 
            padding: '10px 18px', 
            background: '#2563eb', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer', 
            pointerEvents: 'auto',
            fontWeight: 600
          }}
        >
          {isSidebarOpen ? 'Close Details' : 'Player Details'}
        </button>

        <Bench players={matchData.homeSubs} side="left" />
        <Bench players={matchData.awaySubs} side="right" />
      </div>

      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        players={enrichedOnField}
        selectedPlayer={selectedPlayer}
      />
    </div>
  );
}