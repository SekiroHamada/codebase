import React from 'react';
import Avatar from '../dashboard/Avatar';

/**
 * Cricket "Team Players" card: everyone in the team who isn't currently on the field
 * (only the bowler and the striker are). Same look as the shared football bench, but
 * compact: about two rows of chips are visible and the rest scroll, so the field gets the space.
 * `variant` = 'home' (light) | 'away' (indigo).
 */
export default function TeamPlayers({ teamName, players, variant, selectedId, onSelect }) {
  return (
    <section className={`bench bench--${variant} bench--compact`}>
      <header className="bench__head">
        <span className="bench__title">
          Team Players
          <small className="bench__team">{teamName}</small>
        </span>
        <span className="bench__count">{players.length}</span>
      </header>

      {players.length === 0 ? (
        <p className="bench__empty">No players</p>
      ) : (
        <div className="bench__list">
          {players.map((p) => (
            <button
              key={p.id}
              className={`bench__chip ${p.id === selectedId ? 'is-active' : ''}`}
              onClick={() => onSelect(p.id)}
              title={p.name}
            >
              <Avatar player={p} size={20} tone={variant === 'away' ? 'away-on-dark' : 'home'} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
