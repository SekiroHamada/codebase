import React from 'react';
import Avatar from './Avatar';

/** One bench card per team, shown below the field. `variant` = 'home' (light) | 'away' (indigo). */
export default function TeamBench({ teamName, players, variant, selectedId, onSelect }) {
  return (
    <section className={`bench bench--${variant}`}>
      <header className="bench__head">
        <span className="bench__title">{teamName} bench</span>
        <span className="bench__count">{players.length}</span>
      </header>

      {players.length === 0 ? (
        <p className="bench__empty">No substitutes</p>
      ) : (
        <div className="bench__list">
          {players.map((p) => (
            <button
              key={p.id}
              className={`bench__chip ${p.id === selectedId ? 'is-active' : ''}`}
              onClick={() => onSelect(p.id)}
              title={p.name}
            >
              <Avatar player={p} size={28} tone={variant === 'away' ? 'away-on-dark' : 'home'} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
