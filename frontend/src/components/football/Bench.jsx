import React from 'react';

export default function Bench({ players, side }) {
  const isLeft = side === 'left';
  
  const containerStyle = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [isLeft ? 'left' : 'right']: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    zIndex: 5,
    pointerEvents: 'auto', // Allow clicking over the 3D canvas
  };

  const dotStyle = {
    width: '12px', height: '12px', borderRadius: '50%', 
    backgroundColor: '#9ca3af', border: '2px solid #fff'
  };

  return (
    <div style={containerStyle}>
      {players.map(player => (
        <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexDirection: isLeft ? 'row' : 'row-reverse' }}>
          <div style={dotStyle} />
          <span style={{ color: '#fff', fontSize: '12px', textShadow: '1px 1px 2px #000' }}>
            {player.name}
          </span>
        </div>
      ))}
    </div>
  );
}