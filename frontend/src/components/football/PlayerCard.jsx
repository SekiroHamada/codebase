import React from 'react';

export default function PlayerCard({ player, isSelected }) {
  const isChoking = player.trustScore < player.threshold;

  return (
    <div style={{
      backgroundColor: isSelected ? '#333333' : '#222222',
      borderLeft: isChoking ? '4px solid #ef4444' : '4px solid #3b82f6',
      padding: '15px',
      marginBottom: '15px',
      borderRadius: '8px',
      transition: 'background-color 0.2s',
      color: '#ffffff'
    }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>{player.name}</h3>
      <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>Trust Score: <strong>{player.trustScore}</strong></p>
      <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>Threshold: {player.threshold}</p>
      
      {isChoking && (
        <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#fca5a5', backgroundColor: 'rgba(239, 68, 68, 0.2)', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
          Pressure Drop Detected
        </div>
      )}
    </div>
  );
}