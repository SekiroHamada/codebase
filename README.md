# Cricket Choking AI — Local Development Guide

This repository contains a React frontend, a Node.js/Express backend (including the football pipeline and cricket CSV replay), and a Python/FastAPI cricket machine-learning service.

The cricket demo selects a match from a backend-provided dropdown, replays its CSV deliveries in order, updates the score and wickets, evaluates each completed delivery in Python, and displays batter/bowler trust scores. **These trust scores are pressure-adjusted performance indices, not proof of a psychological cause or calibrated choking probabilities.**

## Prerequisites

- Windows 10/11, VS Code and PowerShell (commands below use PowerShell).
- Node.js with npm (tested locally with Node.js 24); Python 3.12.
- The IPL data file saved as `backend/data/mensIPLHawkeyeStats.csv`. This large file is intentionally not committed to Git.
- All commands assume you opened the **repository root** in VS Code. If your checkout is at another path, adapt the `cd` commands.

## Folder overview

```text
codebase/
├── frontend/                          # React + Vite: cricket and football dashboards
├── backend/
│   ├── data/mensIPLHawkeyeStats.csv  # Place dataset here (not committed)
│   └── src/                           # Express, Socket.IO, cricket replay / match selection
├── ml_service/
│   ├── main.py                        # FastAPI scoring endpoint
│   ├── features.py                    # ML features
│   ├── train.py                       # Model training
│   ├── requirements.txt
│   └── artifacts/                     # Generated model (not committed)
└── README.md
```

## 1. Install once

In VS Code, open **Terminal → New Terminal**. All examples use the repository root `C:\Users\jimk7\Desktop\Projects\AI\codebase`.

**Python environment and dependencies:**

```powershell
cd C:\Users\jimk7\Desktop\Projects\AI\codebase\ml_service
python -m venv .venv --copies
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

If `.venv` already exists and works, **do not recreate it**: just run the `pip install` command. Do not delete an environment while Python is using it.

**Backend dependencies:**

```powershell
cd C:\Users\jimk7\Desktop\Projects\AI\codebase\backend
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm.cmd install
npm.cmd install csv-parse
```

**Frontend dependencies:**

```powershell
cd C:\Users\jimk7\Desktop\Projects\AI\codebase\frontend
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm.cmd install
```

The PATH command is a **temporary workaround per PowerShell terminal** if `node` or `npm` is not recognized. Alternatively fix Windows PATH permanently.

## 2. Train the cricket model

Place the CSV at `backend/data/mensIPLHawkeyeStats.csv` first. Run from `ml_service`:

```powershell
cd C:\Users\jimk7\Desktop\Projects\AI\codebase\ml_service
.\.venv\Scripts\python.exe train.py --csv ..\backend\data\mensIPLHawkeyeStats.csv --exclude-match 2
Test-Path .\artifacts\cricket_model.joblib
```

`Test-Path` should return `True`. Training produces `ml_service/artifacts/cricket_model.joblib` and evaluation metrics. You only need to train once per chosen dataset/model configuration, **not every time the server starts**.

**Important match-selection limitation (ML v3):** The current v3 training and inference code uses `--exclude-match 2` for leakage-safe testing of **Match 2**. The current FastAPI service checks this selected exclusion and may return an error when replaying another match. The Node dropdown may offer other matches, but they are **not automatically supported by this particular trained model**. To properly support many selectable matches, update the training/inference pipeline to use a held-out set of demo matches or a time-aware training split and retrain; do not simply remove the leakage protection. Until then, select **Match 2** for ML v3 demonstrations. See `ml_service/main.py` and `ml_service/train.py` for the exact checks.

## 3. Start all three servers (every session)

Open **three separate VS Code terminals** and keep them open. Start in this order:

### Terminal 1 — FastAPI / Python, cricket ML (port 8001; the football ML server uses 8000)

```powershell
cd C:\Users\jimk7\Desktop\Projects\AI\codebase\ml_service
.\.venv\Scripts\python.exe -m uvicorn main:app --port 8001
```

Check <http://127.0.0.1:8001/health>. With trained v3 files and model loaded, expect:

```json
{"status":"ok","engine":"trained-context-eb-conformal-v3","trained_model":true}
```

Model metadata: <http://127.0.0.1:8001/model/info>.

### Terminal 2 — Node.js / Express (port 5000)

```powershell
cd C:\Users\jimk7\Desktop\Projects\AI\codebase\backend
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$env:CRICKET_MATCH_ID = "2"
$env:CRICKET_REPLAY_INTERVAL_MS = "2000"
$env:ML_SERVICE_URL = "http://127.0.0.1:8001"
npm.cmd run dev
```

Check <http://localhost:5000/api/health> and <http://localhost:5000/api/cricket/matches>. The latter should return `selectedMatchId` and a `matches` array with IDs and delivery counts.

### Terminal 3 — React / Vite (normally port 5173)

```powershell
cd C:\Users\jimk7\Desktop\Projects\AI\codebase\frontend
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm.cmd run dev
```

Open <http://localhost:5173/cricket> (or the exact URL printed by Vite if the port changes).

## 4. Use the cricket demo

1. Open the cricket dashboard in the browser.
2. Use **Select Match** in the top-right to ask Node.js to load a match (for validated v3 ML use **Match 2**, pending multi-match training support).
3. The backend reads CSV rows for that match and replays them sequentially at the configured interval (default: 2 seconds per delivery).
4. After each ball, Node.js sends batter, bowler, tracking values and updated score to `POST /evaluate/cricket/post-ball` on FastAPI.
5. Python returns pressure and updated batter/bowler trust-score information; Node.js broadcasts updates over the `/cricket` Socket.IO namespace.
6. The dashboard displays batter and bowler, animated delivery, innings/over/ball, runs/wickets, player trust and pressure information. The animation is a visualization, not necessarily a reconstructed physical ball trajectory.
7. **Restart Match** resets and replays the currently selected match from the start. At the last delivery, replay ends and waits for another selection or restart.

Match IDs follow the CSV. A delivery ID like `2.15.4` means second innings, over 15, ball/event 4. Note that extras can mean one CSV row does **not** equal one legal ball.

### Cricket HTTP API

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/cricket/matches` | List match IDs from the dataset |
| GET | `/api/cricket/status` | Current replay progress |
| POST | `/api/cricket/select` | Change selected match; JSON `{"matchId":"2"}` |
| POST | `/api/cricket/restart` | Restart current selected match |
| GET | `/api/health` | Express backend health |
| GET | `http://127.0.0.1:8001/health` | Python ML health |
| GET | `http://127.0.0.1:8001/model/info` | Model version and evaluation information |
| POST | `http://127.0.0.1:8001/evaluate/cricket/post-ball` | Completed-delivery ML scoring (called by Node.js) |

The cricket match is **shared across connected viewers**: selecting/restarting changes the one server-side replay, not just the current browser tab.

## 5. Troubleshooting

| Problem | Check / action |
|---|---|
| `node` or `npm.cmd` not recognized | In that terminal, run `$env:Path = "C:\Program Files\nodejs;" + $env:Path`. |
| `Permission denied` for `.venv` files | Stop Python/Uvicorn before modifying the environment; do not delete a running environment. |
| Port 8001 / 5000 / 5173 already in use | A server may already be running. Stop the existing instance with **Ctrl+C**; avoid starting duplicate instances. |
| `/health` shows `prototype-rule-based` or `trained_model:false` | Check that v3 `main.py` was copied and `artifacts/cricket_model.joblib` was generated; restart FastAPI. |
| Cricket selector reports HTTP 404 | Check `backend/src/routes/apiRoutes.js` and that `backend/src/server.js` contains `app.use('/api', apiRoutes);`; restart Node.js. |
| Dropdown takes time to populate | Node may be reading/scanning the large CSV to enumerate matches. Match metadata caching is a possible later optimization. |
| Selected match produces ML error | v3 may have been trained with a different `--exclude-match`; see multi-match limitation in Section 2. |
| Replay starts in the middle | It may have been running before the frontend connected. Use **Restart Match** and confirm the updated cricket controller is installed. |
| Frontend has no live updates | Confirm ports 5000 and 8001 are responding, check the browser console, and confirm Node Socket.IO cricket namespace is connected. |
| Python packages missing | Run `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` inside `ml_service`. |

## 6. Git workflow for the cricket feature

From repository root:

```powershell
cd C:\Users\jimk7\Desktop\Projects\AI\codebase
git branch --show-current
git status
```

Use the cricket feature branch, not `main`, when committing this work. If you are **already on** `feature/cricket-choking-ai`, stage and commit:

```powershell
git add README.md
git add backend/src frontend/src ml_service/*.py ml_service/requirements.txt
git status
git commit -m "Document cricket AI setup and integration"
git push -u origin feature/cricket-choking-ai
```

Check staged files before committing. Do **not** commit `.venv/`, `node_modules/`, `.env` secrets, the large CSV, or the generated model binary. Keep source files and dependency manifests in Git so another developer can reproduce training locally. If you already staged extra files with `git add .`, inspect `git diff --cached --name-only` before commit.

## 7. Model interpretation and research limitations

The current ML v3 combines gradient-boosted outcome estimators, contextual match-pressure features, player-history shrinkage, pressure-response comparisons, rolling performance and an interpretable trust-score transform. It also uses conformal intervals for run estimates. These methods do **not** by themselves establish that psychological pressure caused an underperformance. `chokingProbability` is intentionally not treated as a validated psychological probability. Consult `docs/MODELS_AND_FORMULAE.md` (if copied from the v3 package) and the project's mathematical documentation for formulas and validation limitations.

**Security:** The selector/restart development endpoints have no authentication or per-user match isolation. Add authorization and access control before exposing the project publicly.
