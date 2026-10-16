"""Football ML server (trust score, docs/trust_formula.md).  Run:  python -m uvicorn app.main:app --port 8000"""
import time

from fastapi import FastAPI, HTTPException

from app.football import state as store
from app.schemas import InitRequest, PredictRequest, ResetRequest

app = FastAPI(title="Choking ML Server", version="0.2.0")


@app.get("/")
def root():
    return {"service": "Choking ML Server", "data": "PFF FC World Cup 2022", "endpoints": {
        "GET /health": "status", "GET /docs": "interactive API docs", "GET /games": "available PFF games",
        "POST /init/football": "start a game, returns pre-match trust for every player",
        "POST /predict/football": "feed raw PFF events, returns trust for every player",
        "POST /reset/football": "drop game state"}}


@app.get("/health")
def health():
    m = store.model()
    return {"status": "ML server is running", "modelBuilt": m.get("built"), "games": len(m["games"]),
            "liveGames": {gid: g.events_seen for gid, g in store.games.items()}}


@app.get("/games")
def games():
    out = []
    for gid, g in sorted(store.model()["games"].items(), key=lambda kv: kv[1]["date"]):
        out.append({"gameId": gid, "date": g["date"], "week": g["week"], "home": g["home"]["name"],
                    "away": g["away"]["name"], "result": g.get("result"), "shootout": g.get("shootout")})
    return out


def _response(game, t0):
    return {"gameId": game.gid, "match": game.summary(), "players": game.trust_all(),
            "ms": round((time.perf_counter() - t0) * 1000, 2)}


@app.post("/init/football")
def init_football(req: InitRequest):
    t0 = time.perf_counter()
    try:
        game = store.new_game(req.gameId)
    except KeyError:
        raise HTTPException(404, f"unknown PFF game id {req.gameId}")
    return _response(game, t0)


@app.post("/predict/football")
def predict_football(req: PredictRequest):
    t0 = time.perf_counter()
    try:
        game = store.get_game(req.gameId)
    except KeyError:
        raise HTTPException(404, f"unknown PFF game id {req.gameId}")
    for ev in req.events:
        game.process(ev)
    resp = _response(game, t0)
    if resp["ms"] > 25:
        print(f"[warn] /predict/football took {resp['ms']:.1f} ms for {len(req.events)} events")
    return resp


@app.post("/reset/football")
def reset_football(req: ResetRequest):
    if req.gameId:
        store.games.pop(str(req.gameId), None)
    else:
        store.games.clear()
    return {"status": "reset", "gameId": req.gameId}
