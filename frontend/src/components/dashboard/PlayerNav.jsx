import React, { useState } from 'react';
import Avatar from './Avatar';
import { CHOKE_THRESHOLD, trustTone, formatScore } from './trust';

/**
 * Left bar (styled after the reference "Interface" nav):
 * brand + home button, search, then every on-field player grouped by team.
 */
export default function PlayerNav({ title, teams, selectedId, onSelect, onHome }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  return (
    <aside className="nav">
      <div className="nav__brand">
        <span className="nav__title">{title}</span>
        <button className="nav__home" onClick={onHome} aria-label="Back to sport selection" title="Change sport">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="4" cy="4" r="1.6" fill="currentColor" />
            <circle cx="12" cy="4" r="1.6" fill="currentColor" />
            <circle cx="4" cy="12" r="1.6" fill="currentColor" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          </svg>
        </button>
      </div>

      <label className="nav__search">
        <input
          type="search"
          placeholder="Search players"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </label>

      <div className="nav__lists">
        {teams.map((team, ti) => {
          const players = team.players.filter((p) => !q || p.name.toLowerCase().includes(q));
          return (
            <section key={team.name} className="nav__group">
              <h4 className="nav__group-title">
                {team.name}
                <span>{players.length}</span>
              </h4>

              {players.length === 0 && (
                <p className="nav__empty">{q ? 'No match' : 'No players on the field yet'}</p>
              )}

              {players.map((p) => {
                const active = p.id === selectedId;
                const choking = p.trustScore < CHOKE_THRESHOLD;
                return (
                  <button
                    key={p.id}
                    className={`nav__item ${active ? 'is-active' : ''}`}
                    onClick={() => onSelect(p.id)}
                  >
                    <Avatar player={p} size={30} tone={ti === 0 ? 'home' : 'away'} />
                    <span className="nav__name">{p.name}</span>
                    <span className={`nav__score tone-${trustTone(p.trustScore)}`}>
                      {choking && <span className="nav__choke-dot" aria-label="Choking" />}
                      {formatScore(p.trustScore)}
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      <div className="nav__legend">
        <div className="nav__legend-row">
          <span className="legend-dot legend-dot--ok" /> Composed
        </div>
        <div className="nav__legend-row">
          <span className="legend-dot legend-dot--bad" /> Choking (trust &lt; {CHOKE_THRESHOLD})
        </div>
        <p>Click a dot on the field or a name above to see full player data.</p>
      </div>
    </aside>
  );
}
