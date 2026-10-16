# Football ML server (trust score)

A separate FastAPI service. The Node backend replays a PFF FC World Cup 2022 match and sends the raw PFF events here; the server returns a trust score for every player. The formula is specified in [`docs/trust_formula.md`](docs/trust_formula.md).

## Run the whole stack

```
# 1. data (once): PFF WC2022 in backend/data/pff_wc2022  (Metadata, Rosters, Event Data, Tracking Data, players.csv)
robocopy "C:\Users\JoeyS\code_base_sample\data\raw\pff_wc2022" "C:\Users\JoeyS\codebase\backend\data\pff_wc2022" /E /XO

# 2. ML server  (from ml_server/)
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000

# 3. backend  (from backend/, second terminal)
npm install
npm start                      # replays the 2022 final (game 10517) in real time

# 4. frontend as usual
```

### Backend options (environment variables)

| Variable | Default | |
|---|---|---|
| `PFF_GAME_ID` | `10517` | any id from `GET :8000/games` (all 64 matches) |
| `REPLAY_SPEED` | `1` | e.g. `5` for 5× |
| `START_MINUTE` | `0` | jump into the match; earlier events are still sent to the ML server |
| `REPLAY_LOOP` | off | `1` restarts the match when it ends |
| `ML_URL` | `http://127.0.0.1:8000` | |
| `PFF_DATA_DIR` | `backend/data/pff_wc2022` | |

PowerShell example: `$env:START_MINUTE=75; $env:REPLAY_SPEED=2; npm start`.

The backend decompresses tracking with Python if it finds `python`, `python3` or `py` on the PATH (about 10× faster), and falls back to the slower pure-JS decoder otherwise.

## API

| Endpoint | |
|---|---|
| `POST /init/football` `{"gameId": "10517"}` | start a game; returns the pre-match trust for every player |
| `POST /predict/football` `{"gameId": "10517", "events": [raw PFF events, in order]}` | returns trust for every player after these events |
| `GET /games` | the 64 PFF games (date, stage, teams, result) |
| `GET /health`, `GET /docs` | status, interactive docs |
| `POST /reset/football` `{"gameId": ...}` | drop a game's state |

Each player (keyed by PFF player id) gets `trustScore` (0–100 resistance to choking, comparable across players; < 40 = choking), `chokeProbability`, `form`, `beta` (pressure sensitivity), `pressure` (Ψ), `ci95`, `epistemicSD`, `attributions` (Shapley: formHistory / thisMatch / pressure), `position`, `onPitch`, `nObs`. The backend exposes the same detail at `GET :5000/api/football/state`.

## Layout

| Path | What |
|---|---|
| `app/main.py`, `app/schemas.py` | endpoints and request models |
| `app/football/game.py` | match state: PFF events → observations, valid-goal rule, subs, shootout, recoveries, Kalman updates |
| `app/football/features.py` | §2.2 difficulty features (geometry, opponent pressure, crowding, fatigue, …) |
| `app/football/residual.py` | §2 difficulty model, Pearson / grade residuals |
| `app/football/pressure.py` | §3 stakes (utility + group Monte Carlo), Skellam leverage, shootout Markov chain, consequence |
| `app/football/priors.py` | §4–5 normal level, form history, experience, pressure-sensitivity prior |
| `app/football/kalman.py` | two-state (form, pressure sensitivity) Kalman filter |
| `app/football/trust.py` | §7 trust score, uncertainty, Shapley attributions; `compute_trust_scores(event, state)` |
| `app/football/constants.py` | every default parameter (with doc section) |
| `app/football/config/model.json` | fitted artefacts (built by `tools/build_model.py`) |
| `app/football/config/position_weights.json` | §8 position weights / job profiles (built by `tools/position_weights.py`) |
| `tools/` | offline builders |
| `tests/` | `replay_test.py` (in-process), `smoke_test.py` (over HTTP) |

## Rebuilding the model

```
python tools/position_stats.py ../backend/data/pff_wc2022 stats.pkl
python tools/position_weights.py stats.pkl app/football/config/position_weights.json    # after editing expert multipliers
python tools/build_model.py                                                              # ~2 min, writes config/model.json
python -m tests.replay_test 10517                                                        # check behaviour on the final
```

`app/football/event_parser.py` is the old Metrica parser and is no longer used.
