import React, { useState } from 'react';

const initialsOf = (name = '') => {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) return parts[parts.length - 1];
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
};

/** Round player avatar: photo if available, otherwise initials / shirt number. */
export default function Avatar({ player, size = 40, tone = 'home' }) {
  const [broken, setBroken] = useState(false);
  const showPhoto = player?.photo && !broken;

  return (
    <span
      className={`avatar avatar--${tone}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {showPhoto ? (
        <img src={player.photo} alt={player.name} onError={() => setBroken(true)} />
      ) : (
        initialsOf(player?.name)
      )}
    </span>
  );
}
