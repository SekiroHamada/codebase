"""§5 Two-state Kalman filter per player: s = (a, beta).

a    = current execution level vs the position average (0 = average, in residual SD units)
beta = pressure sensitivity (how much a drops from Psi = 0 to Psi = 1; negative = chokes)
Observation for each action: r = a + beta * Psi + noise.
"""
import math

import numpy as np

from .constants import PARAMS


def initial_state(prior, is_sub, P=PARAMS):
    s = np.array([prior['a'], prior['beta']], dtype=float)
    cov = np.diag([prior['V_a'] + (P['sigma2_cold'] if is_sub else 0.0), prior['V_beta']])
    return s, cov


class PlayerFilter:
    def __init__(self, prior, t_on, is_sub, params=None):
        self.P_ = dict(PARAMS, **(params or {}))
        self.t_last = t_on
        self.is_sub = is_sub
        self.s, self.P = initial_state(prior, is_sub, self.P_)
        self.n_obs = 0

    def predict(self, t):
        dt = max(t - self.t_last, 0.0)
        if dt > 0:
            self.P[0, 0] += dt * self.P_['q_a']
            self.P[1, 1] += dt * self.P_['q_beta']
            self.t_last = t

    def update(self, psi, r, R):
        h = np.array([1.0, psi])
        Ph = self.P @ h
        S = float(h @ Ph) + R
        innov = r - float(h @ self.s)
        z = innov / math.sqrt(S)
        c = self.P_['huber_c']
        if abs(z) > c:                      # one freak event can't crash the score
            R *= (abs(z) / c) ** 2
            S = float(h @ Ph) + R
        K = Ph / S
        self.s = self.s + K * innov
        self.P = self.P - np.outer(K, Ph)
        self.n_obs += 1
