/**
 * Persistent player profiles (frontend-only, never changed by live data).
 *
 * `originalTrustScore` is the pre-match baseline the live ML trust score is
 * compared against. Fill in real names, photos and baselines here — the
 * dashboard reads this list and never writes to it.
 *
 * IDs match the backend (`p<number>` from the Metrica tracking CSV headers).
 */

const makeTeam = (team, numbers) =>
  Object.fromEntries(
    numbers.map((n) => [
      `p${n}`,
      Object.freeze({
        id: `p${n}`,
        name: `Player ${n}`,
        number: n,
        team,
        photo: '',               // URL to a headshot; initials are shown when empty
        originalTrustScore: 100, // pre-match baseline (0–100)
      }),
    ])
  );

export const FOOTBALL_PROFILES = Object.freeze({
  ...makeTeam('Home', [11, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14]),
  ...makeTeam('Away', [25, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28]),
});

// Cricket has no data feed yet — add entries here once the backend sends a roster.
export const CRICKET_PROFILES = Object.freeze({});

const BY_SPORT = { football: FOOTBALL_PROFILES, cricket: CRICKET_PROFILES };

export function getProfile(sport, id) {
  return BY_SPORT[sport]?.[id] ?? null;
}
