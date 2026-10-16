"""In-process replay of one PFF match through the trust model (no server needed).

    python -m tests.replay_test [gameId] [PFF_ROOT]       (from the ml_server folder; default 10517 = 2022 final)

Prints latency, the final score and every player's trust at a few checkpoints.
"""
import json
import os
import sys
import time

SERVER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER)

from app.football import state as store  # noqa: E402

gid = sys.argv[1] if len(sys.argv) > 1 else '10517'
root = sys.argv[2] if len(sys.argv) > 2 else os.environ.get(
    'PFF_ROOT', os.path.join(SERVER, '..', 'backend', 'data', 'pff_wc2022'))
with open(os.path.join(root, 'Event Data', f'{gid}.json'), encoding='utf-8') as f:
    events = json.load(f)

t0 = time.perf_counter()
game = store.new_game(gid)
print(f'init {1000 * (time.perf_counter() - t0):.0f} ms')
names = {str(r['id']): (r['name'], r['pos'], 'H' if r['team'] == game.home else 'A') for r in game.roster.values()}
pre = game.trust_all(with_attributions=False)
checkpoints = {}
worst = 0.0
lat = []
for i, ev in enumerate(events):
    t1 = time.perf_counter()
    game.process(ev)
    out = game.trust_all()
    dt = 1000 * (time.perf_counter() - t1)
    lat.append(dt)
    worst = max(worst, dt)
    minute = int(game.clock)
    for cp in (30, 60, 80, 90, 105, 120):
        if minute >= cp and cp not in checkpoints and not game.game_over:
            checkpoints[cp] = out
checkpoints['end'] = out
lat.sort()
print(f'{len(events)} events | per-event latency (process + trust for all players): '
      f'median {lat[len(lat) // 2]:.1f} ms, p99 {lat[int(len(lat) * .99)]:.1f} ms, max {worst:.1f} ms')
print('match', game.summary())
cols = [c for c in (30, 60, 80, 90, 105, 120, 'end') if c in checkpoints]
print(f"{'player':24s} pos side  pre  " + ''.join(f'{str(c):>6s}' for c in cols) + '   obs  beta   top attribution')
for pid, (name, pos, side) in sorted(names.items(), key=lambda kv: (kv[1][2], kv[1][1])):
    end = checkpoints['end'][pid]
    if not end['entered']:
        continue
    attr = end.get('attributions') or {}
    top = max(attr.items(), key=lambda kv: abs(kv[1])) if attr else ('', 0)
    print(f'{name[:24]:24s} {end["position"]:3s}  {side}  {pre[pid]["trustScore"]:5.1f} '
          + ''.join(f'{checkpoints[c][pid]["trustScore"]:6.1f}' for c in cols)
          + f'  {end["nObs"]:4d} {end["beta"]:+.3f}  {top[0]} {top[1]:+.1f}')
