import React from 'react';

export default function PlayerCard({ player }) {
  if (!player) return null;

  const scoreColor = player.trustScore >= 75 ? '#22c55e' : player.trustScore >= 50 ? '#eab308' : '#ef4444';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      backgroundColor: '#18181b',
      border: '1px solid #27272a',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '10px'
    }}>
      <img 
        src={player.photo || 'https://via.placeholder.com/64?text=?'} 
        alt={player.name}
        onError={(e) => {
          e.target.onerror = null;
          e.target.src = 'https://via.placeholder.com/64?text=?';
        }}
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          objectFit: 'cover',
          border: '2px solid #3f3f46'
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ 
          color: '#f4f4f5', 
          fontWeight: 600, 
          fontSize: '0.95rem',
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap' 
        }}>
          {player.name}
        </div>
        
        <div style={{ color: '#71717a', fontSize: '0.8rem', marginTop: '2px' }}>
          ID: {player.id}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
          <span style={{ color: '#a1a1aa', fontSize: '0.78rem' }}>Trust Score:</span>
          <span style={{ color: scoreColor, fontWeight: 700, fontSize: '0.85rem' }}>
            {player.trustScore}%
          </span>
        </div>
      </div>
    </div>
  );
}