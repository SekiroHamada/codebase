/**
 * Shared cricket scene geometry (world units) and Hawkeye -> world conversion.
 *
 * World frame (matches CricketField.jsx):
 *   - pitch runs along z; the batter's stumps are at +STUMPS_Z, the bowler's at -STUMPS_Z
 *   - the overview camera looks straight down with the batter at the bottom of the screen
 *   - ground oval semi-axes FIELD_RX (x) and FIELD_RZ (z)
 *
 * The drawn stumps are wider and taller than real ones so they read at overview zoom,
 * so lateral and height scales are fitted to the drawn stumps. That keeps "did it hit
 * the stumps?" visually honest even though the scene isn't to scale.
 */

export const FIELD_RX = 60;
export const FIELD_RZ = 48;

// The whole pitch (strip, creases, stumps) is drawn PITCH_SCALE times its base size
// (base: stumps at z = ±12.5, an 8 x 28 strip). Everything below scales with it.
export const PITCH_SCALE = 1.4;
export const STUMPS_Z = 12.5 * PITCH_SCALE;
export const POPPING_CREASE_Z = 10 * PITCH_SCALE;

// Boundary rope sits inside the edge of the ground: grounded past it = 4, carried past it = 6
export const ROPE_SCALE = 0.88;

const PITCH_LENGTH_M = 20.12;      // stumps to stumps
const STUMPS_HALF_WIDTH_M = 0.114; // 22.86 cm wide
const STUMPS_HEIGHT_M = 0.711;
const DRAWN_STUMPS_HALF_WIDTH = 0.48 * PITCH_SCALE; // outer stump x (0.4) + its radius (0.08)
const DRAWN_STUMPS_HEIGHT = 1.2 * PITCH_SCALE;

export const M_LEN = (2 * STUMPS_Z) / PITCH_LENGTH_M;           // along the pitch
export const M_LAT = DRAWN_STUMPS_HALF_WIDTH / STUMPS_HALF_WIDTH_M; // across the pitch
export const M_H = DRAWN_STUMPS_HEIGHT / STUMPS_HEIGHT_M;         // height

/** Hawkeye lateral metres -> world x. Hawkeye +X is a right-hander's leg side, which is screen-left (world -x). */
export const latToX = (m) => -m * M_LAT;

/** Distance from the batter's stumps in metres -> world z. */
export const lenToZ = (m) => STUMPS_Z - m * M_LEN;

/** Hawkeye fielding grid (0-96, centre 48, boundary ~48 away) -> world x/z on the ground oval. */
export const fieldToWorld = ({ x, y }) => ({
  x: -((x - 48) / 48) * FIELD_RX,
  z: -((y - 48) / 48) * FIELD_RZ, // +Y is down the ground, towards the bowler
});

/** Backend player position (% of the oval, 50/50 = centre) -> world x/z. */
export const percentToWorld = (px, py) => ({
  x: ((px - 50) / 50) * FIELD_RX,
  z: ((py - 50) / 50) * FIELD_RZ,
});
