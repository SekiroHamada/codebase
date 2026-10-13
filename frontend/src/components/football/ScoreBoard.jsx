import React from 'react';

export default function ScoreBoard({ time, team1Score, team2Score, team1Name = "HOME", team2Name = "AWAY" }) {
  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      pointerEvents: 'auto',
      zIndex: 50
    }}>
      {/* Score Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#18181b', // Dark background
        border: '1px solid #3f3f46',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px rgba(0,0,0,0.5)'
      }}>
        {/* Team 1 Name */}
        <div style={{ padding: '8px 16px', backgroundColor: '#f8fafc', color: '#000', fontWeight: 800, minWidth: '80px', textAlign: 'center' }}>
          {team1Name}
        </div>
        
        {/* Team 1 Score */}
        <div style={{ padding: '8px 16px', color: '#fff', fontSize: '1.4rem', fontWeight: 700, minWidth: '30px', textAlign: 'center' }}>
          {team1Score}
        </div>
        
        {/* Divider */}
        <div style={{ color: '#52525b', fontWeight: 900 }}>-</div>
        
        {/* Team 2 Score */}
        <div style={{ padding: '8px 16px', color: '#fff', fontSize: '1.4rem', fontWeight: 700, minWidth: '30px', textAlign: 'center' }}>
          {team2Score}
        </div>
        
        {/* Team 2 Name */}
        <div style={{ padding: '8px 16px', backgroundColor: '#09090b', color: '#fff', fontWeight: 800, minWidth: '80px', textAlign: 'center' }}>
          {team2Name}
        </div>
      </div>

      {/* Time Row */}
      <div style={{
        marginTop: '6px',
        backgroundColor: 'rgba(24, 24, 27, 0.85)',
        color: '#fbbf24', // Amber color for the clock
        padding: '4px 16px',
        borderRadius: '999px',
        fontSize: '0.9rem',
        fontWeight: 700,
        border: '1px solid #3f3f46',
        fontFamily: 'monospace' // Keeps the millisecond ticking stable
      }}>
        {time}
      </div>
    </div>
  );
}