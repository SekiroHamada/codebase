# Backend

Express + Socket.IO. Replays a PFF FC World Cup 2022 match and streams it to the frontend (`/football` namespace, `init-roster` + `football-live-data`, unchanged payload shape). Raw PFF events go to the ML server (`../ml_server`), which returns the trust score for every player.

```
npm install
npm start          # needs the ML server on :8000 (it keeps retrying if it isn't up yet)
```

| Variable | Default | |
|---|---|---|
| `PFF_GAME_ID` | `10517` | 2022 final; any id from `GET :8000/games` |
| `REPLAY_SPEED` | `1` | |
| `START_MINUTE` | `0` | jump into the match |
| `REPLAY_LOOP` | off | `1` = restart when the match ends |
| `ML_URL` | `http://127.0.0.1:8000` | |
| `PFF_DATA_DIR` | `data/pff_wc2022` | not committed (5.4 GB; see `.gitignore`) |

| File | What |
|---|---|
| `src/controllers/pipelineController.js` | replay clock, tracking frames, event release, score (valid-goal rule), shootout, payload |
| `src/services/pffLoader.js` | PFF files; streamed `.jsonl.bz2` tracking (Python decompressor if available, JS fallback) |
| `src/services/mlService.js` | ordered, batched, non-blocking calls to the ML server; resyncs if it restarts |
| `src/config/pff.js` | settings |
| `GET /api/football/state` | replay state + full ML output per player |

Player ids are `pff<PFF playerId>`. Coordinates are 0–100 (x along the pitch, y across it).
