import { M_H, latToX, lenToZ, fieldToWorld, STUMPS_Z } from './geometry';

/**
 * Turns one Hawkeye delivery (from the backend `delivery` payload) into a timed 3D path.
 *
 * Phases:
 *   wind-up  ball held at the release point
 *   flight   release -> bounce (pitchX/pitchY), real gravity, release speed
 *   off pitch bounce -> stumps plane (stumpsX/stumpsY), ~12% speed lost at the bounce
 *   then one of:
 *     shot   bat contact just in front of the stumps -> fielded at fieldX/fieldY
 *     keeper ball carries on past the stumps to the keeper
 *     stop   bowled (at the stumps) / lbw (at the pad)
 *
 * The flight + off-pitch phases play SLOW_MO times slower than real life
 * (a real delivery is ~0.5 s); the shot phase is timed directly.
 */

export const BALL_RADIUS = 0.34;
export const SLOW_MO = 3;
const WIND_UP = 0.7;
const G = 9.81;

const RELEASE_DIST_M = 18.9; // popping crease at the bowler's end, from the batter's stumps
const RELEASE_LAT_M = 0.35;  // bowling arm, either side of the stumps
const BOUNCE_SPEED_KEEP = 0.88;
const FULL_TOSS_BELOW_M = 0.3;

const lerp = (a, b, u) => a + (b - a) * u;
const isSpin = (style) => /SPIN|ORTHODOX|UNORTHODOX/.test(style || '');

// Pitch-phase point in metres -> world [x, y, z]
const world = (latM, hM, distM) => [latToX(latM), Math.max(hM, 0) * M_H + BALL_RADIUS, lenToZ(distM)];

/** Vertical launch speed that takes the ball from h0 to h1 in t seconds under gravity. */
const vyFor = (h0, h1, t) => (h1 - h0 + 0.5 * G * t * t) / t;
const heightAt = (h0, vy, t) => h0 + vy * t - 0.5 * G * t * t;

export function describeOutcome(d) {
  if (!d) return '';
  if (d.isWicket) return `OUT · ${d.dismissal}`;
  if (d.dismissal) return d.dismissal; // e.g. retired hurt
  const extras = { Wd: 'Wide', Nb: 'No ball', Lb: 'Leg bye', B: 'Bye', NbB: 'No ball + bye', NbLb: 'No ball + leg bye' };
  if (d.extras) return `${extras[d.extras] || d.extras}${d.runs ? ` · ${d.runs} run${d.runs > 1 ? 's' : ''}` : ''}`;
  if (d.batterRuns === 6) return 'SIX';
  if (d.batterRuns === 4) return 'FOUR';
  if (d.runs === 0) return 'Dot ball';
  return `${d.runs} run${d.runs > 1 ? 's' : ''}`;
}

export function buildTrajectory(d) {
  const spin = isSpin(d.bowlingStyle);
  const v = d.speed || (spin ? 23 : 33); // m/s
  const v2 = v * BOUNCE_SPEED_KEEP;
  const tracked = !!(d.pitch || d.stumps);

  const stumps = d.stumps || { x: d.pitch ? d.pitch.x : 0, y: 0.6 };
  const pitch = d.pitch || { x: stumps.x, y: spin ? 4 : 6 };
  const relLat = d.rightArmedBowl ? RELEASE_LAT_M : -RELEASE_LAT_M;
  const relH = spin ? 2.0 : 2.2;

  const dismissal = d.dismissal || '';
  const bowled = /^b /.test(dismissal);
  const lbw = /^lbw/.test(dismissal);
  const shot = !!d.field && !bowled && !lbw;
  const fullToss = pitch.y <= FULL_TOSS_BELOW_M;

  // Where the bat (or pad) meets the ball, measured from the stumps
  const contactDist = fullToss ? 1.2 : Math.min(1.2, Math.max(0.25, pitch.y - 0.15));
  const stopDist = shot || lbw ? contactDist : 0; // the delivery phase ends here

  const segments = [];
  const add = (dur, at) => segments.push({ dur: Math.max(dur, 0.001), at });
  const release = world(relLat, relH, RELEASE_DIST_M);
  add(WIND_UP, () => release);

  // ---- release -> (bounce ->) stop point ----------------------------------
  let end; // [lat, h, dist, vyEnd] at the end of the delivery phase, metres
  let bounce = null;

  if (fullToss) {
    const tAll = RELEASE_DIST_M / v;
    const vy = vyFor(relH, stumps.y, tAll);
    const tStop = (RELEASE_DIST_M - stopDist) / v;
    const at = (t) => [lerp(relLat, stumps.x, t / tAll), heightAt(relH, vy, t), RELEASE_DIST_M - v * t];
    add(tStop * SLOW_MO, (u) => world(...at(u * tStop)));
    end = [...at(tStop), vy - G * tStop];
  } else {
    const t1 = (RELEASE_DIST_M - pitch.y) / v;
    const vy1 = vyFor(relH, 0, t1);
    add(t1 * SLOW_MO, (u) => {
      const t = u * t1;
      return world(lerp(relLat, pitch.x, u), heightAt(relH, vy1, t), lerp(RELEASE_DIST_M, pitch.y, u));
    });
    bounce = world(pitch.x, 0, pitch.y);

    const t2 = pitch.y / v2; // bounce -> stumps plane
    const vy2 = vyFor(0, stumps.y, t2);
    const tStop = (pitch.y - stopDist) / v2;
    const at = (t) => [lerp(pitch.x, stumps.x, t / t2), heightAt(0, vy2, t), pitch.y - v2 * t];
    add(tStop * SLOW_MO, (u) => world(...at(u * tStop)));
    end = [...at(tStop), vy2 - G * tStop];
  }

  const endPoint = world(end[0], end[1], end[2]);
  const deliveryEnd = segments[segments.length - 1];

  // ---- after the delivery -------------------------------------------------
  if (shot) {
    const f = fieldToWorld(d.field);
    const dist = Math.hypot(f.x - endPoint[0], f.z - endPoint[2]);
    const caught = /^c /.test(dismissal);
    const aerial = d.batterRuns === 6 || caught;
    const dur = aerial ? 1.6 + dist / 40 : 0.5 + dist / 30;
    const endY = caught ? 1.6 : BALL_RADIUS;
    const apex = aerial ? Math.max(4, dist * (d.batterRuns === 6 ? 0.35 : 0.28)) : Math.min(1.2, 0.05 * dist);

    add(dur, (u) => {
      const s = aerial ? u : 1 - (1 - u) * (1 - u); // ground shots slow down
      const base = lerp(endPoint[1], endY, u);
      const lift = aerial ? apex * 4 * u * (1 - u) : apex * Math.sin(Math.PI * Math.min(u / 0.3, 1));
      return [lerp(endPoint[0], f.x, s), base + lift, lerp(endPoint[2], f.z, s)];
    });
  } else if (!bowled && !lbw) {
    // Carries through to the keeper: standing back for pace, up to the stumps for spin
    const keeperDist = spin ? 1.8 : 14;
    const vLat = (stumps.x - pitch.x) / Math.max(pitch.y / v2, 0.05) || 0;
    const t3 = keeperDist / v2;
    const [lat0, h0, , vy0] = end;
    add(t3 * SLOW_MO, (u) => {
      const t = u * t3;
      return world(lat0 + vLat * t, heightAt(h0, vy0, t), -v2 * t); // world() keeps it above ground
    });
  }

  let total = 0;
  segments.forEach((s) => {
    s.start = total;
    total += s.dur;
  });

  const at = (time) => {
    const t = Math.min(Math.max(time, 0), total);
    const seg = segments.find((s) => t <= s.start + s.dur) || segments[segments.length - 1];
    return seg.at((t - seg.start) / seg.dur);
  };

  // Outcome is revealed when the bat/pad/stumps decide it (end of the delivery phase)
  const revealAt = deliveryEnd.start + deliveryEnd.dur;

  return {
    total,
    at,
    bounce,
    bounceAt: bounce ? segments[1].start + segments[1].dur : null,
    releaseAt: WIND_UP,
    revealAt,
    tracked,
    stumpsZ: STUMPS_Z,
  };
}
