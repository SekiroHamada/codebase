// Shared trust-score helpers. Below CHOKE_THRESHOLD the player dot turns red on the field.
export const CHOKE_THRESHOLD = 40;

export function trustTone(score) {
  if (score >= 75) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

export function formatScore(score) {
  return typeof score === 'number' && !Number.isNaN(score) ? score.toFixed(1) : '—';
}
