import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import FootballField from '../components/football/FootballField';
import Bench from '../components/football/Bench';
import Sidebar from '../components/football/Sidebar';

// Placeholder data generator
const generateMockData = () => {
  const onField = Array.from({ length: 22 }, (_, i) => ({
    id: `p${i}`, name: `Player ${i + 1}`,
    x: Math.floor(Math.random() * 90) + 5, y: Math.floor(Math.random() * 90) + 5,
    trustScore: Math.floor(Math.random() * 100), threshold: 30
  }));
  const homeSubs = Array.from({ length: 9 }, (_, i) => ({ id: `hs${i}`, name: `H-Sub ${i+1}` }));
  const awaySubs = Array.from({ length: 9 }, (_, i) => ({ id: `as${i}`, name: `A-Sub ${i+1}` }));
  return { onField, homeSubs, awaySubs, time: "00:00" };
};

export default function FootballDashboard() {
  const [matchData, setMatchData] = useState(generateMockData());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  useEffect(() => {
    const socket = io('http://localhost:5000');
    socket.on('football-live-data', (data) => {
      if (data) setMatchData(prev => ({ ...prev, ...data }));
    });
    return () => socket.disconnect();
  }, []);

  const handlePlayerClick = (player) => {
    setSelectedPlayerId(player.id);
    setIsSidebarOpen(true);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#000', overflow: 'hidden' }}>
      
      {/* 3D Field Layer */}
      <FootballField 
        players={matchData.onField} 
        onPlayerClick={handlePlayerClick}
        selectedPlayerId={selectedPlayerId}
      />

      {/* UI Overlay Layer (Pointer Events None so you can still drag the 3D camera) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        
        {/* Toggle Sidebar Button */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 60, padding: '10px 15px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', pointerEvents: 'auto' }}
        >
          {isSidebarOpen ? 'Close Panel' : 'Open Panel'}
        </button>

        {/* Benches */}
        <Bench players={matchData.homeSubs} side="left" />
        <Bench players={matchData.awaySubs} side="right" />

        {/* Match Timer */}
        <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '1.5rem', fontWeight: 'bold', pointerEvents: 'auto' }}>
          {matchData.time}
        </div>
      </div>

      {/* Collapsible 1/4th Width Overlay Sidebar */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        players={matchData.onField}
        selectedPlayerId={selectedPlayerId}
      />
    </div>
  );
}