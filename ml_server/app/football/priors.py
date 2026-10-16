"""§4 Pre-match prior per player from his earlier World Cup matches.

summaries[pid] (built offline) holds per earlier match the sums over his actions
[S0, S2, Sr, Sp, Spp, Spr] = [sum w, sum w^2, sum w r, sum w psi, sum w psi^2, sum w psi r]
(per skill family; they are pooled here).
"""
import math
from datetime import date as _date

import numpy as np

from .constants import PARAMS


def _d(s):
    return _date.fromisoformat(s[:10])


def experience(pid, match_date, summaries, dob, center):
    """E in (0,1) from age, WC minutes and knockout minutes before this match."""
    P = PARAMS
    prev = [s for s in summaries.get(str(pid), []) if s['date'] < match_date]
    M = sum(s['min'] for s in prev)
    K = sum(s['min'] for s in prev if s['week'] >= 4)
    b = dob.get(str(pid))
    age = (_d(match_date) - _d(b)).days / 365.25 if b else 27.0
    lin = P['a1'] * (age - 27) / 4 + P['a2'] * math.log1p(M / 90) + P['a3'] * math.log1p(K / 90)
    return 1.0 / (1.0 + math.exp(-(lin - center))), dict(age=round(age, 1), wcMinutes=round(M), koMinutes=round(K))


def personal_recovery_rate(pid, pos, match_date, summaries, rec_rate, kappa=3.0):
    """Gamma-Poisson posterior mean of the player's own recoveries per 90 (prior = position rate)."""
    prev = [s for s in summaries.get(str(pid), []) if s['date'] < match_date]
    N = sum(s.get('rec', 0) for s in prev)
    M = sum(s['min'] for s in prev)
    base = rec_rate.get(pos, 8.0)
    return (kappa * base + N) / (kappa + M / 90.0)


def compute_prior(pid, pos, started, match_date, model):
    P = dict(PARAMS, **model.get('params_fitted', {}))
    summaries = model['summaries']
    prev = [s for s in summaries.get(str(pid), []) if s['date'] < match_date]
    totals = []
    for s in prev:
        t = np.sum(np.array(list(s['fam'].values())), axis=0) if s['fam'] else np.zeros(6)
        totals.append((s, t))

    # pressure sensitivity: population prior (DML) + experience, updated with his own history
    E, exp_info = experience(pid, match_date, summaries, model['dob'], model['E_center'])
    dml = model.get('dml', {})
    beta0 = (dml.get('mu_beta', {}).get(pos, P['mu_beta'])
             + dml.get('rho_E', P['rho_E']) * (E - model.get('E_mean', 0.5))
             + dml.get('rho_sub', P['rho_sub']) * (0.0 if started else 1.0))
    sxy = sum(t[5] - t[3] * t[2] / t[0] for _, t in totals if t[0] > 0)
    sxx = sum(t[4] - t[3] ** 2 / t[0] for _, t in totals if t[0] > 0)
    prec_b = 1.0 / P['tau_beta'] ** 2 + sxx
    beta = (beta0 / P['tau_beta'] ** 2 + sxy) / prec_b

    # form: recency-weighted, shrunk mean of his pressure-neutral residuals (0 = position average)
    num, prec = 0.0, 1.0 / P['tau_theta'] ** 2
    for s, t in totals:
        if t[0] <= 0 or t[1] <= 0:
            continue
        w = 2.0 ** (-(_d(match_date) - _d(s['date'])).days / P['half_life_days'])
        rbar = (t[2] - beta * t[3]) / t[0]
        pi = 1.0 / (P['sigma2'] * t[1] / t[0] ** 2 + P['nu'] ** 2)
        num += w * pi * rbar
        prec += w * pi
    a = num / prec
    return dict(a=a, V_a=1.0 / prec + P['nu'] ** 2, beta=beta, V_beta=1.0 / prec_b, beta0=beta0,
                E=E, sub=not started, pos=pos, matches_before=len(prev), experience=exp_info,
                rec90=personal_recovery_rate(pid, pos, match_date, summaries, model.get('rec_rate', {})))
