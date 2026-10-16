"""Turns the backend's raw Metrica row (list of strings) into a typed dict."""
import math
import re
from typing import Optional

COLUMNS = [
    "team", "type", "subtype", "period",
    "start_frame", "start_time", "end_frame", "end_time",
    "from", "to",
    "start_x", "start_y", "end_x", "end_y",
]
_INT = {"period", "start_frame", "end_frame"}
_FLOAT = {"start_time", "end_time", "start_x", "start_y", "end_x", "end_y"}
_PLAYER_RE = re.compile(r"^Player(\d+)$")


def to_backend_id(name: str) -> Optional[str]:
    """'Player19' -> 'p19' (the id the backend/frontend use). '' -> None."""
    m = _PLAYER_RE.match((name or "").strip())
    return f"p{m.group(1)}" if m else None


def _num(v: str, cast):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(x):
        return None
    return int(x) if cast is int else x


def parse_event(row: list) -> dict:
    row = list(row) + [""] * (len(COLUMNS) - len(row))  # pad short rows
    ev = {}
    for name, raw in zip(COLUMNS, row):
        raw = (raw or "").strip()
        if name in _INT:
            ev[name] = _num(raw, int)
        elif name in _FLOAT:
            ev[name] = _num(raw, float)   # coords stay on Metrica 0-1 scale
        else:
            ev[name] = raw or None
    ev["from_id"] = to_backend_id(ev["from"] or "")
    ev["to_id"] = to_backend_id(ev["to"] or "")
    return ev
