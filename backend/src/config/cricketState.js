// Cricket-only runtime state (kept separate from the shared config/state.js).

// Most recent delivery frame, handed to clients that connect mid-match
const cricketState = {
  latestPayload: null,
};

module.exports = { cricketState };
