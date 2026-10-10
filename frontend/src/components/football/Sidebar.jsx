import React, { useRef, useEffect } from 'react';
import PlayerCard from './PlayerCard';

export default function Sidebar({ isOpen, onClose, players, selectedPlayerId }) {
  const sidebarRef = useRef(null);

  // Scroll to selected player when clicked
  useEffect(() => {
    if (selectedPlayerId && sidebarRef.current) {
      const selectedEl = document.getElementById(`card-${selectedPlayerId}`);
      if (selectedEl) selectedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedPlayerId]);

  const style = {
    position: 'absolute', top: 0, right: 0,
    width: '25vw', height: '100vh',
    backgroundColor: 'rgba(30, 30, 30, 0.95)', // Slightly transparent to see field underneath
    borderLeft: '1px solid #444',
    transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 0.3s ease-in-out',
    zIndex: 50, padding: '20px', overflowY: 'auto',
    backdropFilter: 'blur(5px)', pointerEvents: 'auto'
  };

  return (
    <div style={style} ref={sidebarRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
        <h2 style={{ margin: 0, color: '#fff' }}>Player Details</h2>
        <button onClick={onClose} style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
      </div>

      {players.map(player => (
        <div key={player.id} id={`card-${player.id}`}>
          <PlayerCard player={player} isSelected={selectedPlayerId === player.id} />
        </div>
      ))}
    </div>
  );
}