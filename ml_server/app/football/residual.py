"""§2 Execution residual: difficulty model (logistic / IRT), Pearson residual, grade residual, combination."""
import math

import numpy as np

from .constants import PARAMS, mix_a
from .features import feature_names, is_interaction


def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def norm_cdf(x):
    """Standard normal CDF (vectorised, Abramowitz-Stegun 7.1.26 erf, |err| < 1.5e-7)."""
    x = np.asarray(x, dtype=float)
    z = np.abs(x) / math.sqrt(2.0)
    t = 1.0 / (1.0 + 0.3275911 * z)
    y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * np.exp(-z * z)
    return 0.5 * (1.0 + np.sign(x) * y)


# ---------------------------------------------------------------- training (used by tools/build_model.py)
def fit_logistic(X, y, penalty, iters=30, tol=1e-7):
    """L2-penalised logistic regression by Newton / IRLS. X already standardised, column 0 = intercept."""
    n, k = X.shape
    w = np.zeros(k)
    lam = np.diag(penalty)
    for _ in range(iters):
        p = sigmoid(X @ w)
        g = X.T @ (p - y) + lam @ w
        H = (X * (p * (1 - p))[:, None]).T @ X + lam
        step = np.linalg.solve(H, g)
        w -= step
        if np.max(np.abs(step)) < tol:
            break
    return w


def penalty_vector(key, lam_main=1.0, lam_inter=10.0):
    names = feature_names(key)
    return np.array([0.0] + [lam_inter if is_interaction(n) else lam_main for n in names])


# ---------------------------------------------------------------- inference
class DifficultyModel:
    def __init__(self, spec, game_fold):
        self.spec = spec              # key -> {mean, sd, folds:[coef...]}
        self.game_fold = game_fold    # game id -> fold index
        self._cache = {}

    def predict(self, key, x, game_id):
        m = self.spec.get(key)
        if m is None:
            return None
        k = self.game_fold.get(str(game_id), 0)
        ck = (key, k)
        if ck not in self._cache:
            self._cache[ck] = (np.array(m['mean']), np.array(m['sd']), np.array(m['folds'][k]))
        mu, sd, w = self._cache[ck]
        z = w[0] + ((x - mu) / sd) @ w[1:]
        return float(sigmoid(z))


def outcome_residual(o, p):
    lo, hi = PARAMS['p_clip']
    p = min(max(p, lo), hi)
    z = (o - p) / math.sqrt(p * (1 - p))
    c = PARAMS['z_clip']
    return max(-c, min(c, z))


def grade_residual(g, key, pos, grade_stats):
    st = grade_stats.get(key, {})
    mean, sd = st.get(pos) or st.get('_all') or (0.0, 0.5)
    c = PARAMS['z_clip']
    return max(-c, min(c, (g - mean) / sd))


def combine(key, pos, z_g, z_o, rho_table):
    """§2.5: unit-variance mix of grade and outcome residuals."""
    if z_g is None and z_o is None:
        return None
    if z_o is None:
        return z_g
    if z_g is None:
        return z_o
    a = mix_a(key, pos)
    rt = rho_table.get(key, {})
    rho = rt.get(pos, rt.get('_all', 0.3))
    denom = math.sqrt(max(a * a + (1 - a) ** 2 + 2 * a * (1 - a) * rho, 1e-6))
    return (a * z_g + (1 - a) * z_o) / denom


def recovery_residual(count, pos, minutes, rec_rate):
    """Poisson Pearson residual of recoveries in a window of on-pitch minutes."""
    mu = max(rec_rate.get(pos, 8.0) / 90.0 * minutes, 1e-3)
    c = PARAMS['z_clip']
    return max(-c, min(c, (count - mu) / math.sqrt(mu)))
