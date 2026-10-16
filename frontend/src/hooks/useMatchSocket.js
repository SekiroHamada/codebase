import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { getProfile } from '../data/playerProfiles';

const BACKEND_URL = 'http://localhost:5000';
const isOnPitch = (x, y) => x !== 'NaN' && y !== 'NaN' && x != null && y != null;

/**
 * Connects to the sport namespace, keeps the live match state and merges it
 * with the static roster + persistent profiles.
 *
 * @param sport      'football' | 'cricket'
 * @param teamNames  [home/team-1 label, away/team-2 label] — must match what PlayerDot expects
 */
export default function useMatchSocket(sport, teamNames) {
  const [homeName, awayName] = teamNames;

  const [matchData, setMatchData] = useState({
    onField: [],
    homeSubs: [],
    awaySubs: [],
    time: '00:00.000',
    ball: { x: 50, y: 50 },
    team_1_goals: 0,
    team_2_goals: 0,
  });
  const [playerMeta, setPlayerMeta] = useState({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(`${BACKEND_URL}/${sport}`);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (error) => {
      setConnected(false);
      console.error('Socket Connection Error:', error.message);
    });

    // 1. Initial roster handshake
    socket.on('init-roster', (roster) => {
      const metaLookup = {};
      const onField = [];
      const homeSubs = [];
      const awaySubs = [];

      const extractTeam = (teamList, teamName, subs) => {
        if (!Array.isArray(teamList)) return;
        teamList.forEach((entry) => {
          const [id, [name, photo, initialTrust, x, y]] = Object.entries(entry)[0];
          metaLookup[id] = { id, name, photo, initialTrustScore: initialTrust, team: teamName };
          if (isOnPitch(x, y)) onField.push({ id, x, y });
          else subs.push({ id, name });
        });
      };

      extractTeam(roster.team1, homeName, homeSubs);
      extractTeam(roster.team_2, awayName, awaySubs);

      setPlayerMeta(metaLookup);
      setMatchData((prev) => ({
        ...prev,
        onField,
        homeSubs,
        awaySubs,
        time: roster.time_elapsed || prev.time,
        team_1_goals: roster.team_1_goals ?? 0,
        team_2_goals: roster.team_2_goals ?? 0,
        ball: roster.ball_position && roster.ball_position.x !== 'NaN' ? roster.ball_position : prev.ball,
      }));
    });

    // 2. Continuous live frames
    socket.on(`${sport}-live-data`, (data) => {
      if (data) setMatchData((prev) => ({ ...prev, ...data }));
    });

    return () => socket.disconnect();
  }, [sport, homeName, awayName]);

  // Merge live tracking + roster meta + persistent profile
  const enrich = useMemo(() => {
    return (player, onPitch) => {
      const meta = playerMeta[player.id];
      const profile = getProfile(sport, player.id);
      return {
        ...player,
        name: profile?.name || meta?.name || player.name || player.id,
        photo: profile?.photo || meta?.photo || '',
        number: profile?.number,
        team: meta?.team || profile?.team || 'Unknown',
        trustScore: player.trustScore ?? meta?.initialTrustScore ?? 100,
        originalTrustScore: profile?.originalTrustScore ?? meta?.initialTrustScore ?? 100,
        onPitch,
      };
    };
  }, [playerMeta, sport]);

  const onField = useMemo(
    () => matchData.onField.map((p) => enrich(p, true)),
    [matchData.onField, enrich]
  );
  const homeSubs = useMemo(
    () => matchData.homeSubs.map((p) => enrich(p, false)),
    [matchData.homeSubs, enrich]
  );
  const awaySubs = useMemo(
    () => matchData.awaySubs.map((p) => enrich(p, false)),
    [matchData.awaySubs, enrich]
  );

  return { matchData, onField, homeSubs, awaySubs, connected };
}
