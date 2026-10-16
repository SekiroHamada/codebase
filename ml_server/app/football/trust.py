"""§6 Trust score = resistance to choking, comparable across players.

    m     = a + beta * Psi                 expected execution right now, vs the position average
    T     = 100 * Phi( (m + delta) / sd )  sd = sqrt(h' P h), h = (1, Psi)

T is the probability that the player is NOT performing more than `delta` SD below an average player
of his position at the current pressure. 90 = very unlikely to choke; < 40 = more likely than not.
"""
import math

import numpy as np

from .constants import PARAMS
from .kalman import initial_state
from .residual import norm_cdf


def _shapley3(c, delta, sd):
    """Exact Shapley values for the 3 numerator components (form history, this match, pressure)."""
    names = list(c)
    vals = np.array([c[k] for k in names])
    n = len(vals)
    v = lambda mask: 100.0 * float(norm_cdf((delta + sum(vals[i] for i in range(n) if mask >> i & 1)) / sd))  # noqa: E731
    out = {}
    for j in range(n):
        tot = 0.0
        for mask in range(1 << n):
            if mask >> j & 1:
                continue
            k = bin(mask).count('1')
            w = math.factorial(k) * math.factorial(n - k - 1) / math.factorial(n)
            tot += w * (v(mask | 1 << j) - v(mask))
        out[names[j]] = round(tot, 2)
    return out


def trust_output(prior, flt, psi_now, with_attributions=True):
    delta = PARAMS['delta']
    if flt is not None:
        s, P = flt.s, flt.P
    else:
        s, P = initial_state(prior, prior['sub'])
    h = np.array([1.0, psi_now])
    m = float(h @ s)
    var = float(h @ P @ h)
    sd = math.sqrt(max(var, 1e-9))
    T = 100.0 * float(norm_cdf((m + delta) / sd))
    half = 1.96 * math.sqrt(var + PARAMS['sigma2'])
    out = {
        'trustScore': round(T, 2),
        'chokeProbability': round(1 - T / 100.0, 4),
        'form': round(float(s[0]), 4),            # execution level vs position average
        'beta': round(float(s[1]), 4),            # pressure sensitivity
        'pressure': round(psi_now, 3),
        'ci95': [round(m - half, 3), round(m + half, 3)],
        'epistemicSD': round(sd, 4),
    }
    if with_attributions:
        out['attributions'] = _shapley3({'formHistory': prior['a'], 'thisMatch': float(s[0]) - prior['a'],
                                         'pressure': float(s[1]) * psi_now}, delta, sd)
    return out


def compute_trust_scores(event, state):
    """Feed one raw PFF event to `state` (a game.GameState) and return {playerId: trust output}."""
    state.process(event)
    return state.trust_all()
