"""Model artefacts and the registry of live games (one GameState per PFF game id)."""
import json
import os

from .game import GameState

CONFIG = os.path.join(os.path.dirname(__file__), 'config')
_model = _weights = None
games = {}


def model():
    global _model
    if _model is None:
        with open(os.path.join(CONFIG, 'model.json'), encoding='utf-8') as f:
            _model = json.load(f)
    return _model


def weights():
    global _weights
    if _weights is None:
        with open(os.path.join(CONFIG, 'position_weights.json'), encoding='utf-8') as f:
            _weights = json.load(f)
    return _weights


def new_game(game_id):
    gid = str(game_id)
    if gid not in model()['games']:
        raise KeyError(gid)
    games[gid] = GameState(gid, model(), weights())
    return games[gid]


def get_game(game_id):
    gid = str(game_id)
    return games.get(gid) or new_game(gid)
