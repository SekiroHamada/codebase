import React from 'react';
import Avatar from './Avatar';
import { CHOKE_THRESHOLD, trustTone, formatScore } from './trust';

const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/** Two concentric progress rings: outer = live trust, inner = original baseline. */
function TrustRing({ live, original }) {
  const ring = (r, value) => {
    const c = 2 * Math.PI * r;
    return { strokeDasharray: `${(clamp(value) / 100) * c} ${c}` };
  };
  return (
    <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="50" className="ring__track" />
      <circle cx="60" cy="60" r="50" className={`ring__live tone-stroke-${trustTone(live)}`} style={ring(50, live)} />
      <circle cx="60" cy="60" r="38" className="ring__track" />
      <circle cx="60" cy="60" r="38" className="ring__orig" style={ring(38, original)} />
    </svg>
  );
}

const fmtCoord = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v.toFixed(1) : '—');

export default function PlayerDetails({ teams, scoreLabel, player, pitchSize }) {
  const [home, away] = teams;
  const delta = player ? player.trustScore - player.originalTrustScore : 0;
  const choking = player && player.trustScore < CHOKE_THRESHOLD;
  const awayTone = player?.team === away.name;

  return (
    <aside className="details">
      {/* 1. Team names */}
      <div className="card teams">
        <div className="teams__side">
          <span className="kit kit--home" />
          <span className="teams__name">{home.name}</span>
        </div>
        <span className="teams__vs">vs</span>
        <div className="teams__side teams__side--right">
          <span className="teams__name">{away.name}</span>
          <span className="kit kit--away" />
        </div>

        {/* 2. Goals per team */}
        <div className="teams__score">
          <span>{home.score ?? '—'}</span>
          <span className="teams__score-label">{scoreLabel}</span>
          <span>{away.score ?? '—'}</span>
        </div>
      </div>

      {!player ? (
        <div className="card details__empty">
          <div className="details__empty-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="36" height="36" fill="none">
              <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="3" />
              <circle cx="24" cy="24" r="3" fill="currentColor" />
              <path d="M24 4v8M24 36v8M4 24h8M36 24h8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <h3>No player selected</h3>
          <p>Click a player dot on the field to see their trust score and position.</p>
        </div>
      ) : (
        <>
          {/* 3. Photo of selected player */}
          <div className="card profile">
            <Avatar player={player} size={84} tone={awayTone ? 'away' : 'home'} />
            <div className="profile__text">
              <span className="section-label">Selected player</span>
              <h3>{player.name}</h3>
              <span className="profile__meta">
                {player.team} · ID {player.id}
              </span>
            </div>
            {choking && <span className="badge badge--bad">Choking</span>}
          </div>

          {/* 4. Live trust score */}
          <div className="card trust">
            <TrustRing live={player.trustScore} original={player.originalTrustScore} />
            <div className="trust__text">
              <span className="section-label">Trust score</span>
              <div className={`trust__value tone-${trustTone(player.trustScore)}`}>
                {formatScore(player.trustScore)}
                <small>/100</small>
              </div>
              <div className="trust__legend">
                <span><i className="swatch swatch--live" /> Live</span>
                <span><i className="swatch swatch--orig" /> Original</span>
              </div>
            </div>
          </div>

          <div className="details__pair">
            {/* 5. Original (persistent) trust score */}
            <div className="card stat">
              <span className="section-label">Original trust</span>
              <div className="stat__value">{formatScore(player.originalTrustScore)}</div>
              <span className={`delta ${delta < 0 ? 'delta--down' : 'delta--up'}`}>
                {delta >= 0 ? '+' : ''}
                {delta.toFixed(1)} vs live
              </span>
            </div>

            {/* 6. Position on the field */}
            <div className="card stat stat--dark">
              <span className="section-label">Position</span>
              {player.onPitch ? (
                <>
                  <div className="coords">
                    <span><small>X</small>{fmtCoord(player.x)}</span>
                    <span><small>Y</small>{fmtCoord(player.y)}</span>
                  </div>
                  <span className="stat__hint">
                    {pitchSize
                      ? `${((player.x / 100) * pitchSize[0]).toFixed(1)} m, ${((player.y / 100) * pitchSize[1]).toFixed(1)} m`
                      : '% of field'}
                  </span>
                </>
              ) : (
                <div className="stat__value stat__value--small">On bench</div>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
