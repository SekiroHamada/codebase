import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/home.css';

const FootballIcon = () => (
  <svg viewBox="0 0 48 48" width="40" height="40" fill="none" aria-hidden="true">
    <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="3" />
    <path d="M24 15l7 5-2.7 8.3h-8.6L17 20z" fill="currentColor" />
    <path d="M24 15V6M31 20l8.5-3M28.3 28.3l5 7.2M19.7 28.3l-5 7.2M17 20l-8.5-3"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const CricketIcon = () => (
  <svg viewBox="0 0 48 48" width="40" height="40" fill="none" aria-hidden="true">
    <rect x="21" y="5" width="9" height="28" rx="3" transform="rotate(35 25.5 19)"
      stroke="currentColor" strokeWidth="3" />
    <path d="M15.5 31.5l-6 8" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    <circle cx="35" cy="36" r="5" fill="currentColor" />
  </svg>
);

const SPORTS = [
  {
    path: '/football',
    label: 'Football',
    blurb: 'Live tracking · 22 players',
    Icon: FootballIcon,
    variant: 'primary',
  },
  {
    path: '/cricket',
    label: 'Cricket',
    blurb: 'Ball-by-ball · 22 players',
    Icon: CricketIcon,
    variant: 'soft',
  },
];

export default function Home() {
  const navigate = useNavigate();
  // Start on a plain white screen, then reveal the two options
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 450);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className={`home ${revealed ? 'is-revealed' : ''}`}>
      <header className="home__intro">
        <h1>Choose a sport</h1>
        <p>Spot who is choking under pressure, live.</p>
      </header>

      <div className="home__options">
        {SPORTS.map(({ path, label, blurb, Icon, variant }, i) => (
          <button
            key={path}
            className={`sport-card sport-card--${variant}`}
            style={{ transitionDelay: `${120 + i * 90}ms` }}
            onClick={() => navigate(path)}
          >
            <span className="sport-card__icon"><Icon /></span>
            <span className="sport-card__text">
              <span className="sport-card__label">{label}</span>
              <span className="sport-card__blurb">{blurb}</span>
            </span>
            <span className="sport-card__arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </main>
  );
}
