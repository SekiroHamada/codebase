import React, { useEffect, useState } from 'react';

const API = 'http://localhost:5000/api/cricket';

export default function MatchSelector() {
  const [matches, setMatches] = useState([]);
  const [matchId, setMatchId] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${API}/matches`);
        if (!response.ok) throw new Error(`Matches API failed: ${response.status}`);
        const data = await response.json();
        if (active) {
          setMatches(data.matches || []);
          setMatchId(String(data.selectedMatchId || ''));
        }
      } catch (e) {
        if (active) setError(e.message);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const changeMatch = async (nextId) => {
    if (working || nextId === matchId) return;
    setWorking(true);
    setError('');
    try {
      const response = await fetch(`${API}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: nextId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to change match');
      setMatchId(String(result.matchId));
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor="cricket-match-selector" style={{ display: 'block', color: '#93c5fd', fontWeight: 700, marginBottom: 6 }}>
        Select match
      </label>
      <select
        id="cricket-match-selector"
        value={matchId}
        disabled={working || matches.length === 0}
        onChange={(event) => changeMatch(event.target.value)}
        style={{ width: '100%', padding: 10, borderRadius: 8, background: '#18181b', color: 'white', border: '1px solid #52525b' }}
      >
        {!matchId && <option value="">Loading matches...</option>}
        {matches.map(m => <option key={m.id} value={m.id}>Match {m.id} ({m.deliveries} deliveries)</option>)}
      </select>
      {working && <div style={{ color: '#a1a1aa', fontSize: 12 }}>Loading match...</div>}
      {error && <div role="alert" style={{ color: '#fca5a5', fontSize: 12 }}>{error}</div>}
    </div>
  );
}
