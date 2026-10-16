# Cricket demo overlay — apply to cloned repo

This is a **ball-by-ball after-ball prototype**, not a trained or validated choking AI. Trust scores are demonstration execution indices; choking probabilities are intentionally `null`.

## Installation
1. Copy contents of this ZIP into repository root, merging folders but keeping all other files.
2. Copy `mensIPLHawkeyeStats.csv` to `backend/data/mensIPLHawkeyeStats.csv`.
3. In `backend/src/server.js`, add `const { startCricketReplay } = require('./controllers/cricketController');` beside the other imports. Inside `httpServer.listen(...`, after `startAutoPipeline('cricket');` add `startCricketReplay().catch(console.error);`.
4. In `backend/src/sockets/socketManager.js`, add `const { getCurrentCricketPayload } = require('../controllers/cricketController');` at top. Within the cricket `connection` handler, immediately after `socket.emit('init-roster', cricketInitialData);`, add `const latest = getCurrentCricketPayload(); if (latest) socket.emit('cricket-live-data', latest);`.
5. In `backend/`, run `npm install` and `npm install csv-parse`.
6. In `ml_service/`, run `python -m venv .venv`, activate it, `pip install -r requirements.txt` and `python -m uvicorn main:app --host 127.0.0.1 --port 8000`.
7. In separate terminal, `cd backend`, then set environment variables: PowerShell: `$env:CRICKET_MATCH_ID='2'; $env:CRICKET_REPLAY_INTERVAL_MS='2000'; npm run dev`. CMD: `set CRICKET_MATCH_ID=2` then `npm run dev`.
8. In another terminal, `cd frontend`, `npm install`, `npm run dev`.
9. Open `/cricket` route in frontend (see `src/App.jsx` for route), open devtools console and verify `cricket-live-data` messages. Display text fields from `matchData`: `runs`, `wickets`, `overs`, `batter.trustScore`, `bowler.trustScore`, `pressure.score`, and `modelStatus`.

## Data limitations
- Both `ball` and `score` objects are **after** a delivery, so no forecast is claimed.
- Input CSV match identifiers may start at `2` rather than `1`: default ID is `2`.
- Target is inferred from innings 1 and only valid for conventional full matches, not DLS/shortened or incomplete innings.
- Missing measurements remain `null`, never fabricated.
- Player field coordinates in the demo are schematic layout positions, not real player tracking.
- Current player scores describe one delivery and do not use trained historical baselines. This must be replaced with validated ML for the actual project.
- After-ball historical replay is not guaranteed to have exact score or wicket semantics for all edge cases; verify match totals and dismissal classifications against known references.
- If FastAPI is down, the replay retries the same delivery rather than advancing.
