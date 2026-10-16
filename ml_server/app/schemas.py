"""Request contract between the Node backend and this ML server (PFF FC data).

    POST /init/football     {"gameId": "10517"}
    POST /predict/football  {"gameId": "10517", "events": [<raw PFF event objects, in order>]}

Both return:
    {"gameId": "...", "match": {score, clock, period, shootout, ...},
     "players": {"<pff player id>": {"trustScore", "chokeProbability", "ci95", "pressure",
                                     "epistemicSD", "aleatoricSD", "beta", "attributions",
                                     "position", "onPitch", "entered", "nObs"}}}
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class InitRequest(BaseModel):
    gameId: str = Field(..., description="PFF game id, e.g. '10517' (the 2022 final).")


class PredictRequest(BaseModel):
    gameId: str
    events: List[Dict[str, Any]] = Field(..., description="Raw PFF event objects (Event Data/<gameId>.json), in order.")


class ResetRequest(BaseModel):
    gameId: Optional[str] = None
