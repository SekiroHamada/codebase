"""§2.2 Difficulty features X_e (physical / technical difficulty only - never score, clock, stakes)."""
import math

import numpy as np

from .constants import POSITIONS, BASE_POSITION, PARAMS

FOOT = {'L', 'R', 'LS', 'RS', 'LT', 'RT', 'LB', 'RB', 'LC', 'RC', 'LK', 'RK', 'LA', 'RA'}
HANDS = {'TWOHANDS', 'LH', 'RH', 'PA', 'PU'}

POS_DUMMIES = [p for p in POSITIONS if p != BASE_POSITION]

COMMON = ['dist_goal', 'wide', 'x_prog', 'press_P', 'press_L', 'press_A', 'near_opp', 'crowd',
          'speed', 'speed_na', 'h_A', 'h_L', 'h_V', 'h_H', 'h_M', 'body_head', 'body_hands', 'body_other',
          'setpiece', 'penalty', 'fatigue'] \
    + [f'pos_{p}' for p in POS_DUMMIES] \
    + [f'pos_{p}*dist' for p in POS_DUMMIES] + [f'pos_{p}*press' for p in POS_DUMMIES]

EXTRA = {
    'pass':    ['pass_len', 'pass_fwd', 'pt_C', 'pt_O', 'pt_T', 'pt_F', 'pt_B'],
    'cross':   ['pass_len', 'pass_fwd'],
    'shot':    ['tri_def', 'gk_dist', 'st_V', 'st_F', 'deflected', 'ball_moving'],
    'save':    ['tri_def', 'gk_dist', 'st_V', 'st_F', 'deflected', 'ball_moving'],
    'dribble': ['ch_A', 'ch_B', 'ch_D', 'ch_T', 'ch_FIFTY', 'ch_S', 'ch_H'],
    'duel':    ['ch_A', 'ch_B', 'ch_D', 'ch_T', 'ch_FIFTY', 'ch_S', 'ch_H'],
}


def feature_names(key):
    return COMMON + EXTRA.get(key, [])


def is_interaction(name):
    return '*' in name


def _in_triangle(p, a, b, c):
    (px, py), (ax, ay), (bx, by), (cx, cy) = p, a, b, c
    det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(det) < 1e-9:
        return False
    l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det
    l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det
    return l1 >= 0 and l2 >= 0 and (1 - l1 - l2) >= 0


def build(key, pos, loc, attack_dir, pitch, opponents, opp_gk, speed, pe, ge, it, minutes_on, target_loc=None):
    """Return the feature vector (np.ndarray) for an observation. `opponents` = list of (x, y)."""
    L, W = pitch
    x, y = loc
    gx = attack_dir * L / 2.0
    f = dict.fromkeys(feature_names(key), 0.0)
    dist = math.hypot(gx - x, y)
    f['dist_goal'] = dist / 50.0
    f['wide'] = abs(y) / (W / 2.0)
    f['x_prog'] = attack_dir * x / (L / 2.0)
    pt = (pe.get('pressureType') or it.get('initialPressureType'))
    pressed = 0.0
    if pt in ('P', 'L', 'A'):
        f[f'press_{pt}'] = 1.0
        pressed = 1.0
    if opponents:
        ds = [math.hypot(ox - x, oy - y) for ox, oy in opponents]
        f['near_opp'] = min(min(ds), 15.0) / 15.0
        s2 = 2 * PARAMS['crowd_s'] ** 2
        f['crowd'] = sum(math.exp(-d * d / s2) for d in ds)
    else:
        f['near_opp'] = 1.0
    if speed is None:
        f['speed_na'] = 1.0
    else:
        f['speed'] = min(float(speed), 12.0) / 8.0
    ht = pe.get('ballHeightType') or it.get('initialHeightType')
    if ht in ('A', 'L', 'V', 'H', 'M'):
        f[f'h_{ht}'] = 1.0
    bt = pe.get('bodyType') or it.get('initialBodyType')
    if bt == 'HE':
        f['body_head'] = 1.0
    elif bt in HANDS:
        f['body_hands'] = 1.0
    elif bt and bt not in FOOT:
        f['body_other'] = 1.0
    sp = ge.get('setpieceType')
    f['setpiece'] = 1.0 if sp not in (None, 'O') else 0.0
    f['penalty'] = 1.0 if sp == 'P' else 0.0
    f['fatigue'] = (minutes_on or 0.0) / 90.0
    if pos != BASE_POSITION and pos in POSITIONS:
        f[f'pos_{pos}'] = 1.0
        f[f'pos_{pos}*dist'] = f['dist_goal']
        f[f'pos_{pos}*press'] = pressed
    if key in ('pass', 'cross') and target_loc is not None:
        tx, ty = target_loc
        f['pass_len'] = math.hypot(tx - x, ty - y) / 50.0
        f['pass_fwd'] = attack_dir * (tx - x) / 50.0
    if key == 'pass':
        ptype = pe.get('passType')
        if ptype in ('C', 'O', 'T', 'F', 'B'):
            f[f'pt_{ptype}'] = 1.0
    if key in ('shot', 'save'):
        post1, post2 = (gx, -3.66), (gx, 3.66)
        f['tri_def'] = float(sum(1 for o in opponents
                                 if o != opp_gk and _in_triangle(o, (x, y), post1, post2)))   # outfield blockers
        if opp_gk is not None:
            f['gk_dist'] = math.hypot(opp_gk[0] - gx, opp_gk[1]) / 10.0
        st = pe.get('shotType')
        if st in ('V', 'F'):
            f[f'st_{st}'] = 1.0
        f['deflected'] = 1.0 if pe.get('deflectorPlayerId') else 0.0
        f['ball_moving'] = 1.0 if pe.get('ballMoving') else 0.0
    if key in ('dribble', 'duel'):
        ct = pe.get('challengeType')
        if ct in ('A', 'B', 'D', 'T', 'FIFTY', 'S', 'H'):
            f[f'ch_{ct}'] = 1.0
    return np.fromiter((f[n] for n in feature_names(key)), dtype=float)
