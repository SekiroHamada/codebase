import React, { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import FootballField from '../components/football/FootballField';
import Bench from '../components/football/Bench';
import Sidebar from '../components/football/Sidebar';



export default function FootballDashboard() {
  const [matchData, setMatchData] = useState({
    onField: [],
    homeSubs: [],
    awaySubs: [],
    time: "00:00",
    ball:{x:50,y:50}
   });
  const [playerMeta, setPlayerMeta] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  

  useEffect(() => {
    const socket = io('http://localhost:5000/football');

    //if connection is successful
    socket.on('connect',()=>{
      console.log('Successfully connected to backend with ID:', socket.id);
    })
    //catch network or CORS error
    socket.on('connect_error', (error) => {
      console.error('Socket Connection Error:', error.message);
    });
    
    // 1. Listen for initial roster metadata handshake
    socket.on('init-roster', (roster) => {
      console.log('Received init-roster data:', roster);
      const metaLookup = {};
      const startingPositions =[];
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
          //initial field coordinates
          startingPositions.push({
            id: playerId,
            x: x, 
            y: y
          });

        });
      };

      extractTeam(roster.team1, 'Team 1');
      extractTeam(roster.team_2, 'Team 2');
      setPlayerMeta(metaLookup);
      //render the dots using these coordinates
      setMatchData(prev => ({ ...prev, onField: startingPositions }));
    });

    // 2. Listen for frame updates
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
        trustScore: player.trustScore ?? meta?.initialTrustScore ?? 50,
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
        <div style={{ 
          position: 'absolute', 
          top: '20px', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          background: 'rgba(0,0,0,0.85)', 
          color: '#fff', 
          padding: '10px 28px', 
          borderRadius: '8px', 
          fontSize: '1.4rem', 
          fontWeight: 700, 
          pointerEvents: 'auto',
          border: '1px solid #333'
        }}>
          {matchData.time}
        </div>

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