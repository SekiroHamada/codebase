import React from 'react';

/**
 * Name tag floating above a player dot, coloured by team so it matches the
 * dot's outer ring: light tag for the home side, black tag for the away side.
 * `badge` is a short team marker shown in front of the name (e.g. "H" / "A").
 */
export default function PlayerTag({ name, badge, dark, isSelected }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 6px 2px 2px',
        borderRadius: '6px',
        background: dark ? 'rgba(0, 0, 0, 0.88)' : 'rgba(255, 255, 255, 0.95)',
        color: dark ? '#ffffff' : '#1d1d2c',
        fontFamily: 'Outfit, system-ui, sans-serif',
        fontSize: '10px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        boxShadow: isSelected
          ? '0 0 0 2px #5a5db4'
          : '0 1px 3px rgba(0, 0, 0, 0.35)',
      }}
    >
      <span
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          minWidth: '14px',
          height: '14px',
          padding: '0 2px',
          borderRadius: '4px',
          background: dark ? '#e9b9d3' : '#5a5db4', // pink = away, indigo = home
          color: dark ? '#1d1d2c' : '#ffffff',
          fontSize: '9px',
          fontWeight: 700,
        }}
      >
        {badge}
      </span>
      {name}
    </div>
  );
}
