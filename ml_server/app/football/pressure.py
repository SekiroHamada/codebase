"""§3 Psychological pressure: stakes, in-game leverage (Skellam), shootout Markov chain, consequence."""
import math
from functools import lru_cache

import numpy as np

from .constants import PARAMS, UTILITY, ETA

_K = 16
_LGAMMA = np.array([math.lgamma(k + 1) for k in range(_K)])


def _pmf(mu):
    if mu <= 0:
        out = np.zeros(_K); out[0] = 1.0
        return out
    k = np.arange(_K)
    return np.exp(-mu + k * math.log(mu) - _LGAMMA)


@lru_cache(maxsize=100000)
def _value_q(d, m_q, vd_q, lam):
    """V(d,m) = P(D>0) + vD P(D=0), D = d + G_A - G_B (Skellam)."""
    m = m_q / 4.0
    vD = vd_q / 1000.0
    pa = _pmf(lam * m)
    pb = _pmf(lam * m)
    diff = np.convolve(pa, pb[::-1])          # index j -> G_A - G_B = j - (K-1)
    k = np.arange(diff.size) - (_K - 1)
    final = d + k
    return float(diff[final > 0].sum() + vD * diff[final == 0].sum())


def match_value(d, m, vD, lam=None):
    lam = PARAMS['goals_per_team'] / 90.0 if lam is None else lam
    d = int(max(-6, min(6, d)))
    return _value_q(d, int(round(max(m, 0.0) * 4)), int(round(vD * 1000)), lam)


def leverage_raw(d, m, vD):
    return 0.5 * (match_value(d + 1, m, vD) - match_value(d - 1, m, vD))


L_BAR = leverage_raw(0, 90.0, 0.5)   # ~0.231


def leverage(d, m, vD):
    return min(leverage_raw(d, m, vD) / L_BAR, PARAMS['L_max'])


def minutes_remaining(period, clock_min):
    end = 90.0 if period <= 2 else 120.0
    return max(end - clock_min, 0.5)


# ---------------------------------------------------------------- §3.3 shootout
@lru_cache(maxsize=None)
def _pwin(a, b, ka, kb, pi):
    """P(team kicking first wins). ka, kb = kicks taken; regulation 5 each then sudden death (0.5 when level)."""
    if ka <= 5 and kb <= 5:
        if a > b + (5 - kb):
            return 1.0
        if b > a + (5 - ka):
            return 0.0
    if ka >= 5 and kb >= 5 and ka == kb:
        if a != b:
            return 1.0 if a > b else 0.0
        return 0.5
    if ka == kb:
        return pi * _pwin(a + 1, b, ka + 1, kb, pi) + (1 - pi) * _pwin(a, b, ka + 1, kb, pi)
    return pi * _pwin(a, b + 1, ka, kb + 1, pi) + (1 - pi) * _pwin(a, b, ka, kb + 1, pi)


def shootout_kick_leverage(goals_first, goals_second, kicks_first, kicks_second, kicker_is_first):
    pi = PARAMS['pen_conversion']
    a, b, ka, kb = goals_first, goals_second, kicks_first, kicks_second
    if kicker_is_first:
        raw = _pwin(a + 1, b, ka + 1, kb, pi) - _pwin(a, b, ka + 1, kb, pi)
    else:
        raw = _pwin(a, b, ka, kb + 1, pi) - _pwin(a, b + 1, ka, kb + 1, pi)
    return min(max(raw, 0.0) / L_BAR, PARAMS['L_max'])


# ---------------------------------------------------------------- §3.1 stakes
def _knockout_raw():
    U = UTILITY
    e_final = 0.5 * U['champion'] + 0.5 * U['runner_up']
    e_third = 0.5 * U['third'] + 0.5 * U['fourth']
    final = U['champion'] - U['runner_up']
    third = U['third'] - U['fourth']
    sf = e_final - e_third
    e_sf = 0.5 * e_final + 0.5 * e_third
    qf = e_sf - U['qf']
    e_qf = 0.5 * e_sf + 0.5 * U['qf']
    r16 = e_qf - U['r16']
    e_r16 = 0.5 * e_qf + 0.5 * U['r16']
    return {4: r16, 5: qf, 6: sf, 7: third, 8: final}, e_r16, final


KO_RAW, E_R16, S_FINAL = _knockout_raw()


def compress_stakes(s):
    return max((max(s, 0.0) / S_FINAL) ** PARAMS['gamma_S'], PARAMS['S_min'])


def knockout_stakes(week):
    return compress_stakes(KO_RAW.get(week, KO_RAW[4]))


def group_qualification(game_id, games, groups, rng=None):
    """Monte Carlo of the group's remaining fixtures (including this game).
    Returns {team_id: (P(q|W), P(q|D), P(q|L))} for both teams of `game_id`."""
    rng = rng or np.random.default_rng(int(game_id))
    g = games[str(game_id)]
    home, away, date = g['home']['id'], g['away']['id'], g['date']
    grp = groups.get(str(home))
    teams = sorted(int(t) for t, gi in groups.items() if gi == grp)
    tix = {t: i for i, t in enumerate(teams)}
    played, remaining = [], []
    for gid, x in games.items():
        if x['week'] > 3 or groups.get(str(x['home']['id'])) != grp:
            continue
        if gid != str(game_id) and x['date'] < date:      # kicked off strictly earlier (MD3 games are simultaneous)
            played.append((x['home']['id'], x['away']['id'], x['result']['home'], x['result']['away']))
        else:
            remaining.append((x['home']['id'], x['away']['id']))
    n = PARAMS['mc_sims']
    pts = np.zeros((n, 4)); gd = np.zeros((n, 4)); gf = np.zeros((n, 4))

    def add(h, a, gh, ga):
        hi, ai = tix[h], tix[a]
        pts[:, hi] += np.where(gh > ga, 3, np.where(gh == ga, 1, 0))
        pts[:, ai] += np.where(ga > gh, 3, np.where(gh == ga, 1, 0))
        gd[:, hi] += gh - ga; gd[:, ai] += ga - gh
        gf[:, hi] += gh; gf[:, ai] += ga

    for h, a, gh, ga in played:
        add(h, a, np.full(n, gh), np.full(n, ga))
    lam = PARAMS['goals_per_team']
    this_h = this_a = None
    for h, a in remaining:
        gh = rng.poisson(lam, n); ga = rng.poisson(lam, n)
        add(h, a, gh, ga)
        if h == home and a == away:
            this_h, this_a = gh, ga
    key = pts * 1e6 + gd * 1e3 + gf + rng.random((n, 4))       # FIFA tiebreakers then coin flip
    rank = np.argsort(np.argsort(-key, axis=1), axis=1)
    qualified = rank < 2
    out = {}
    for team, own, opp in ((home, this_h, this_a), (away, this_a, this_h)):
        q = qualified[:, tix[team]]
        res = []
        for mask in (own > opp, own == opp, own < opp):
            res.append(float(q[mask].mean()) if mask.any() else 0.0)
        out[team] = tuple(res)
    return out


def game_stakes(game_id, games, groups):
    """Per team: (S_match, draw value v_D)."""
    g = games[str(game_id)]
    home, away, week = g['home']['id'], g['away']['id'], g['week']
    if week >= 4:
        S = knockout_stakes(week)
        return {home: (S, 0.5, None), away: (S, 0.5, None)}
    q = group_qualification(game_id, games, groups)
    out = {}
    for team, (pw, pd_, pl) in q.items():
        dq = pw - pl
        vD = (pd_ - pl) / dq if dq > 1e-6 else 1.0 / 3.0
        out[team] = (compress_stakes(dq * E_R16), min(max(vD, 0.0), 1.0), dq)
    return out


# ---------------------------------------------------------------- §3.4 consequence
def consequence(pos, loc, attack_dir, pitch_len):
    if loc is None:
        return 1.0
    x, y = loc
    half = pitch_len / 2.0
    own = (-attack_dir * half, 0.0)
    opp = (attack_dir * half, 0.0)
    d_own = math.hypot(x - own[0], y - own[1])
    d_opp = math.hypot(x - opp[0], y - opp[1])
    e_own, e_opp = ETA.get(pos, (1.0, 1.0))
    ell = PARAMS['ell']
    return 1.0 + e_own * math.exp(-d_own / ell) + e_opp * math.exp(-d_opp / ell)


def psi(Pi, Pi_half):
    return Pi / (Pi + Pi_half) if Pi > 0 else 0.0
