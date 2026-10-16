"""Loaders for the PFF FC World Cup 2022 dataset (used for building/training the formula).

Layout expected under PFF_ROOT:
    Metadata/<gameId>.json        list[1] with teams, pitch dims, fps, period times
    Rosters/<gameId>.json         list of {player{id,nickname}, shirtNumber, positionGroupType, started, team}
    Event Data/<gameId>.json      list of events; each carries gameEvents, initialTouch (pressure),
                                  possessionEvents, fouls, grades, and a snapshot of all players + ball
    Tracking Data/<gameId>.jsonl.bz2   one JSON frame per line (~29.97 fps)
    players.csv                   dob, height, positionGroupType per player id

PFF coordinates are metres, origin at pitch centre (x in [-L/2, L/2], y in [-W/2, W/2]).
`to_unit()` converts to the Metrica 0-1 scale the backend uses.
"""
import bz2
import json
import os
from pathlib import Path
from typing import Iterator, Optional

import pandas as pd

PFF_ROOT = Path(os.environ.get("PFF_ROOT", r"C:\Users\JoeyS\code_base_sample\data\raw\pff_wc2022"))


def game_ids(root: Path = PFF_ROOT) -> list:
    return sorted(p.stem for p in (root / "Metadata").glob("*.json"))


def load_metadata(game_id, root: Path = PFF_ROOT) -> dict:
    return json.loads((root / "Metadata" / f"{game_id}.json").read_text(encoding="utf-8"))[0]


def load_roster(game_id, root: Path = PFF_ROOT) -> pd.DataFrame:
    rows = json.loads((root / "Rosters" / f"{game_id}.json").read_text(encoding="utf-8"))
    return pd.DataFrame([{
        "player_id": int(r["player"]["id"]), "name": r["player"]["nickname"],
        "team_id": int(r["team"]["id"]), "team": r["team"]["name"],
        "shirt": int(r["shirtNumber"]), "position": r["positionGroupType"], "started": r["started"],
    } for r in rows])


def load_players(root: Path = PFF_ROOT) -> pd.DataFrame:
    return pd.read_csv(root / "players.csv")


def load_events_raw(game_id, root: Path = PFF_ROOT) -> list:
    return json.loads((root / "Event Data" / f"{game_id}.json").read_text(encoding="utf-8"))


def load_events(game_id, root: Path = PFF_ROOT) -> pd.DataFrame:
    """One row per event: top-level fields + flattened gameEvents / initialTouch /
    possessionEvents / fouls / grades (prefixed). Player snapshots are left out — use
    event_snapshot() for those."""
    rows = []
    for e in load_events_raw(game_id, root):
        row = {k: e.get(k) for k in ("gameId", "gameEventId", "possessionEventId",
                                     "startTime", "endTime", "duration", "eventTime", "sequence")}
        for block in ("gameEvents", "initialTouch", "possessionEvents", "fouls", "grades"):
            for k, v in (e.get(block) or {}).items():
                row[f"{block}.{k}"] = v
        ball = (e.get("ball") or [None])[0] or {}
        row.update({"ball_x": ball.get("x"), "ball_y": ball.get("y"), "ball_z": ball.get("z")})
        rows.append(row)
    return pd.DataFrame(rows)


def event_snapshot(event: dict) -> pd.DataFrame:
    """Player positions/speeds attached to a single raw PFF event."""
    out = []
    for side in ("homePlayers", "awayPlayers"):
        for p in event.get(side) or []:
            out.append({"side": side[:4], **p})
    return pd.DataFrame(out)


def iter_tracking(game_id, root: Path = PFF_ROOT, smoothed: bool = True,
                  every: int = 1) -> Iterator[dict]:
    """Stream tracking frames without loading the whole (large) file.
    every=n yields every n-th frame (n=30 ~ 1 Hz)."""
    hk, ak = ("homePlayersSmoothed", "awayPlayersSmoothed") if smoothed else ("homePlayers", "awayPlayers")
    with bz2.open(root / "Tracking Data" / f"{game_id}.jsonl.bz2", "rt", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i % every:
                continue
            d = json.loads(line)
            ball = d.get("ballsSmoothed") if smoothed else (d.get("balls") or [None])[0]
            yield {
                "frame": d.get("frameNum"), "period": d.get("period"),
                "t": d.get("periodElapsedTime"), "video_ms": d.get("videoTimeMs"),
                "home": d.get(hk) or [], "away": d.get(ak) or [],
                "ball": ball or {}, "game_event_id": d.get("game_event_id"),
                "possession_event_id": d.get("possession_event_id"),
            }


def to_unit(x: Optional[float], y: Optional[float], length: float = 105.0, width: float = 68.0):
    """PFF centred metres -> Metrica-style 0-1 (x along length, y along width, top-left origin)."""
    if x is None or y is None:
        return None, None
    return x / length + 0.5, 0.5 - y / width
