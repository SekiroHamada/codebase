import React from 'react';
import PlayerCard from './PlayerCard';

export default function Sidebar({ isOpen, onClose, players, selectedPlayer }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      width: '320px',
      height: '100%',
      backgroundColor: '#09090b',
      borderLeft: '1px solid #27272a',
      zIndex: 50,
      padding: '20px',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ color: '#ffffff', margin: 0, fontSize: '1.15rem' }}>Player Details</h3>
        <button 
          onClick={onClose}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            color: '#a1a1aa', 
            fontSize: '1.2rem', 
            cursor: 'pointer' 
          }}
        >
          ✕
        </button>
      </div>

      {selectedPlayer ? (
        <div style={{ marginBottom: '24px' }}>
          <span style={{ color: '#93c5fd', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Selected Player
          </span>
          <div style={{ marginTop: '8px' }}>
            <PlayerCard player={selectedPlayer} />
          </div>
        </div>
      ) : (
        <p style={{ color: '#71717a', fontSize: '0.85rem', marginBottom: '20px' }}>
          Click any dot on the field to view details.
        </p>
      )}

      <div>
        <span style={{ color: '#71717a', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
          Visible Players ({players.length})
        </span>
        <div style={{ marginTop: '10px' }}>
          {players.map(p => (
            <PlayerCard key={p.id} player={p} />
          ))}
        </div>
      </div>
    </div>
  );
}