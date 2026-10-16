"""Offline build of app/football/config/model.json from the PFF FC World Cup 2022 data.

    python -m tools.build_model [PFF_ROOT]        (run from the ml_server folder)

Default PFF_ROOT = ../backend/data/pff_wc2022. Steps (docs/trust_formula.md):
  0. games, rosters, dates, groups                     (§3.1)
  1. replay every match in kick-off order with the live GameState (collector mode) -> observations, results, minutes
  2. difficulty models per action key, 5-fold cross-fitted by match (§2.2)
  3. grade stats, grade/outcome correlation, residuals r (§2.3-2.5), recovery rates
  4. Pi_half (median pressure), Psi (§3)
  5. experience centring (§5.1), Double ML for beta heterogeneity (§5.3)
  6. per player-match sufficient statistics for priors (§4, §5.4), moment estimates of nu / tau_theta
"""
import csv
import json
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(HERE)
sys.path.insert(0, SERVER)

from app.football.constants import FAMILIES, GROUP, KEYS, POSITIONS, BASE_POSITION, PARAMS  # noqa: E402
from app.football.features import COMMON, feature_names  # noqa: E402
from app.football.game import GameState, omega, standardise  # noqa: E402
from app.football.priors import experience, personal_recovery_rate  # noqa: E402
from app.football.residual import (combine, fit_logistic, grade_residual, outcome_residual,  # noqa: E402
                                   penalty_vector, recovery_residual, sigmoid)

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get(
    'PFF_ROOT', os.path.join(SERVER, '..', 'backend', 'data', 'pff_wc2022'))
OUT = os.path.join(SERVER, 'app', 'football', 'config', 'model.json')
WEIGHTS = os.path.join(SERVER, 'app', 'football', 'config', 'position_weights.json')
NFOLD = 5
T0 = time.time()


def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


def jload(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return json.load(f)


# ------------------------------------------------------------------ 0. games, rosters, groups
games, rosters = {}, {}
for fn in sorted(os.listdir(os.path.join(ROOT, 'Metadata'))):
    if not fn.endswith('.json'):
        continue
    m = jload('Metadata', fn)[0]
    gid = str(m['id'])
    pitch = (105.0, 68.0)
    try:
        p = m['stadium']['pitches'][0]
        pitch = (float(p['length']), float(p['width']))
    except Exception:
        pass
    games[gid] = dict(date=m['date'], week=int(m['week']),
                      home=dict(id=int(m['homeTeam']['id']), name=m['homeTeam']['name'], short=m['homeTeam'].get('shortName')),
                      away=dict(id=int(m['awayTeam']['id']), name=m['awayTeam']['name'], short=m['awayTeam'].get('shortName')),
                      homeStartLeft=m.get('homeTeamStartLeft', True), homeStartLeftET=m.get('homeTeamStartLeftExtraTime'),
                      pitch=pitch)
    rosters[gid] = [dict(id=int(r['player']['id']), name=r['player']['nickname'], team=int(r['team']['id']),
                         shirt=r.get('shirtNumber'), rawPos=r.get('positionGroupType'),
                         pos=GROUP.get(r.get('positionGroupType'), 'CM'), started=bool(r.get('started')))
                    for r in jload('Rosters', fn)]
dob = {}
with open(os.path.join(ROOT, 'players.csv'), encoding='utf-8') as f:
    for row in csv.DictReader(f):
        if row.get('dob'):
            dob[str(int(float(row['id'])))] = row['dob']
parent = {}


def find(x):
    parent.setdefault(x, x)
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


for g in games.values():
    if g['week'] <= 3:
        parent[find(g['home']['id'])] = find(g['away']['id'])
roots = sorted({find(t) for t in parent})
groups = {str(t): roots.index(find(t)) for t in parent}
game_fold = {gid: i % NFOLD for i, gid in enumerate(sorted(games))}
log(f'{len(games)} games, {len(groups)} group-stage teams in {len(roots)} groups, {len(dob)} players with dob')

model = dict(version='0.2', params=PARAMS, games=games, rosters=rosters, dob=dob, groups=groups,
             game_fold=game_fold, rec_rate={}, Pi_half=1.0, summaries={}, E_center=0.0, E_mean=0.5)

# ------------------------------------------------------------------ 1. replay all matches (collector mode)
rows = []          # observations
minutes = {}       # (pid, gid) -> on-pitch minutes
recs = {}          # (pid, gid) -> ball recoveries
dir_check = [0, 0]


def collect(state, obs):
    obs = dict(obs)
    obs['gid'] = state.gid
    obs['started'] = state.roster[obs['pid']]['started']
    rows.append(obs)
    if obs['key'] == 'shot' and obs['loc_c'] is not None and not state.game_over:
        dir_check[0] += 1
        dir_check[1] += int(state.attack_dir(obs['team'], obs['period']) * obs['loc_c'][0] > 0)


for gid in sorted(games, key=lambda g: games[g]['date']):
    state = GameState(gid, model, collector=collect)
    for ev in jload('Event Data', f'{gid}.json'):
        state.process(ev)
    games[gid]['result'] = {'home': state.score[state.home], 'away': state.score[state.away]}
    if state.shootout:
        games[gid]['shootout'] = {'home': state.shootout['goals'][state.home], 'away': state.shootout['goals'][state.away]}
    for pid, mins in state.on_pitch.items():
        minutes[(pid, gid)] = mins
        recs[(pid, gid)] = state.recoveries.get(pid, 0)
log(f'replayed matches: {len(rows)} observations; total goals {sum(g["result"]["home"] + g["result"]["away"] for g in games.values())}; '
    f'shots taken towards own attacking goal: {dir_check[1]}/{dir_check[0]}')
if dir_check[0] and dir_check[1] / dir_check[0] < 0.5:
    log('WARNING: attack direction convention looks inverted')

# ------------------------------------------------------------------ 2. difficulty models
by_key = defaultdict(list)
for i, r in enumerate(rows):
    if r['key'] != 'recovery' and r['o'] is not None and r['o'] != 'pending' and r['feats'] is not None:
        by_key[r['key']].append(i)
difficulty = {}
p_hat = {}
for key, idx in sorted(by_key.items()):
    X = np.vstack([rows[i]['feats'] for i in idx])
    y = np.array([rows[i]['o'] for i in idx], dtype=float)
    folds = np.array([game_fold[rows[i]['gid']] for i in idx])
    mu = X.mean(0)
    sd = X.std(0)
    sd[sd < 1e-6] = 1.0
    Z = np.hstack([np.ones((len(idx), 1)), (X - mu) / sd])
    pen = penalty_vector(key)
    coefs, oof = [], np.zeros(len(idx))
    for k in range(NFOLD):
        tr, te = folds != k, folds == k
        w = fit_logistic(Z[tr], y[tr], pen) if tr.sum() > 50 and 0 < y[tr].mean() < 1 else np.r_[math.log((y.mean() + 1e-3) / (1 - y.mean() + 1e-3)), np.zeros(Z.shape[1] - 1)]
        coefs.append([round(float(v), 6) for v in w])
        oof[te] = sigmoid(Z[te] @ w)
    for j, i in enumerate(idx):
        p_hat[i] = float(oof[j])
    base = np.clip(y.mean(), 1e-6, 1 - 1e-6)
    ll = -np.mean(y * np.log(np.clip(oof, 1e-6, 1)) + (1 - y) * np.log(np.clip(1 - oof, 1e-6, 1)))
    ll0 = -(base * math.log(base) + (1 - base) * math.log(1 - base))
    difficulty[key] = dict(features=feature_names(key), mean=[round(float(v), 6) for v in mu],
                           sd=[round(float(v), 6) for v in sd], folds=coefs,
                           n=len(idx), success_rate=round(float(y.mean()), 4),
                           oof_logloss=round(float(ll), 4), base_logloss=round(float(ll0), 4))
    log(f'  difficulty[{key:8s}] n={len(idx):6d} success={y.mean():.3f} out-of-fold logloss {ll:.4f} vs base {ll0:.4f}')
model['difficulty'] = difficulty

# penalties are a distinct item: use their empirical success rate (Beta(1,1)-smoothed)
pen_rates = {}
for key in ('shot', 'save'):
    j = feature_names(key).index('penalty')
    idx = [i for i in by_key.get(key, []) if rows[i]['feats'][j] > 0.5]
    if idx:
        s = sum(rows[i]['o'] for i in idx)
        pen_rates[key] = round((s + 1) / (len(idx) + 2), 4)
        for i in idx:
            p_hat[i] = pen_rates[key]
model['penalty_rates'] = pen_rates
log(f'penalty success rates (shooter scores / keeper stops): {pen_rates}')

# ------------------------------------------------------------------ 3. grade stats, rho, residuals
gvals = defaultdict(list)
for r in rows:
    if r['grade'] is not None and r['key'] != 'recovery':
        gvals[(r['key'], r['pos'])].append(float(r['grade']))
        gvals[(r['key'], '_all')].append(float(r['grade']))
grade_stats = defaultdict(dict)
for (key, pos), v in gvals.items():
    if len(v) >= 50 or pos == '_all':
        grade_stats[key][pos] = [round(float(np.mean(v)), 5), round(max(float(np.std(v)), 0.1), 5)]
model['grade_stats'] = grade_stats

pairs = defaultdict(list)
zg_all, zo_all = {}, {}
for i, r in enumerate(rows):
    if r['key'] == 'recovery':
        continue
    zo = outcome_residual(r['o'], p_hat[i]) if i in p_hat else None
    zg = grade_residual(float(r['grade']), r['key'], r['pos'], grade_stats) if r['grade'] is not None else None
    zo_all[i], zg_all[i] = zo, zg
    if zo is not None and zg is not None:
        pairs[(r['key'], r['pos'])].append((zg, zo))
        pairs[(r['key'], '_all')].append((zg, zo))
rho = defaultdict(dict)
for (key, pos), v in pairs.items():
    if len(v) >= 50:
        a = np.array(v)
        c = np.corrcoef(a[:, 0], a[:, 1])[0, 1] if a[:, 0].std() > 0 and a[:, 1].std() > 0 else 0.0
        rho[key][pos] = round(float(np.clip(np.nan_to_num(c), -0.9, 0.9)), 4)
model['rho'] = rho

rec_cnt, rec_min = defaultdict(float), defaultdict(float)
for r in rows:
    if r['key'] == 'recovery':
        rec_cnt[r['pos']] += r['count']
        rec_min[r['pos']] += r['minutes']
rec_rate = {p: round(90.0 * rec_cnt[p] / rec_min[p], 3) for p in rec_min if rec_min[p] > 0}
model['rec_rate'] = rec_rate
log(f'recoveries per 90 by position: {rec_rate}')

hist = defaultdict(list)       # pid -> [{date, week, min, rec}] (same shape as summaries)
for (pid, gid), mins in minutes.items():
    hist[str(pid)].append(dict(date=games[gid]['date'], week=games[gid]['week'], min=mins, rec=recs.get((pid, gid), 0)))
personal = {}
resid = np.full(len(rows), np.nan)
for i, r in enumerate(rows):
    if r['key'] == 'recovery':
        k = (r['pid'], r['gid'])
        if k not in personal:
            personal[k] = personal_recovery_rate(r['pid'], r['pos'], games[r['gid']]['date'], hist, rec_rate)
        resid[i] = recovery_residual(r['count'], r['pos'], r['minutes'], {r['pos']: personal[k]})
    else:
        v = combine(r['key'], r['pos'], zg_all.get(i), zo_all.get(i), rho)
        if v is not None:
            resid[i] = v
ok = ~np.isnan(resid)
log(f'raw residuals: {ok.sum()} usable, mean {np.nanmean(resid):+.3f}, sd {np.nanstd(resid):.3f}')
grp_r = defaultdict(list)
for i, r in enumerate(rows):
    if ok[i]:
        grp_r[(r['key'], r['pos'])].append(resid[i])
        grp_r[(r['key'], '_all')].append(resid[i])
r_norm = defaultdict(dict)
for (key, pos), v in grp_r.items():
    if len(v) >= 50 or pos == '_all':
        r_norm[key][pos] = [round(float(np.mean(v)), 5), round(max(float(np.std(v)), 0.2), 5)]
model['r_norm'] = r_norm
for i, r in enumerate(rows):
    if ok[i]:
        resid[i] = standardise(resid[i], r['key'], r['pos'], r_norm)
log(f'standardised residuals: mean {np.nanmean(resid):+.3f}, sd {np.nanstd(resid):.3f}')

# ------------------------------------------------------------------ 4. pressure
Pi = np.array([r['Pi'] for r in rows])
Pi_half = float(np.median(Pi[ok]))
model['Pi_half'] = round(Pi_half, 6)
psi = Pi / (Pi + Pi_half)
log(f'Pi_half (median pressure) = {Pi_half:.4f}; Psi quartiles {np.percentile(psi[ok], [25, 50, 75]).round(3).tolist()}')

with open(WEIGHTS, encoding='utf-8') as f:
    weights = json.load(f)
Wpos = weights['weights']['data+expert']
omega_v = np.array([omega(Wpos, r['pos'], r['key'], r['o'] if r['o'] != 'pending' else None) for r in rows])

# ------------------------------------------------------------------ 5. experience + DML
match_minutes = defaultdict(list)          # pid -> [(date, week, minutes)]
for (pid, gid), mins in minutes.items():
    match_minutes[str(pid)].append(dict(date=games[gid]['date'], week=games[gid]['week'], min=mins, fam={}))
lins = {}
for (pid, gid) in minutes:
    E0, _ = experience(pid, games[gid]['date'], match_minutes, dob, 0.0)
    E0 = min(max(E0, 1e-9), 1 - 1e-9)
    lins[(pid, gid)] = math.log(E0 / (1 - E0))
E_center = float(np.mean(list(lins.values())))
E_of = {k: 1 / (1 + math.exp(-(v - E_center))) for k, v in lins.items()}
E_mean = float(np.mean(list(E_of.values())))
model['E_center'], model['E_mean'] = round(E_center, 6), round(E_mean, 6)
log(f'experience: centre {E_center:.3f}, mean E {E_mean:.3f}')

dml_idx = [i for i, r in enumerate(rows) if ok[i] and r['key'] != 'recovery' and r['feats'] is not None]
keys_list = sorted(KEYS)
ncom = len(COMMON)
Xc = np.array([np.r_[rows[i]['feats'][:ncom], [1.0 if rows[i]['key'] == k else 0.0 for k in keys_list]] for i in dml_idx])
yr = resid[dml_idx]
yp = psi[dml_idx]
fold = np.array([game_fold[rows[i]['gid']] for i in dml_idx])
mu, sd = Xc.mean(0), Xc.std(0)
sd[sd < 1e-6] = 1.0
Zc = np.hstack([np.ones((len(dml_idx), 1)), (Xc - mu) / sd])


def ridge(A, b, lam=1.0):
    pen = np.eye(A.shape[1]) * lam
    pen[0, 0] = 0
    return np.linalg.solve(A.T @ A + pen, A.T @ b)


r_t, p_t = np.zeros_like(yr), np.zeros_like(yp)
for k in range(NFOLD):
    tr, te = fold != k, fold == k
    r_t[te] = yr[te] - Zc[te] @ ridge(Zc[tr], yr[tr])
    p_t[te] = yp[te] - Zc[te] @ ridge(Zc[tr], yp[tr])
pos_d = [p for p in POSITIONS if p != BASE_POSITION]
E_v = np.array([E_of.get((rows[i]['pid'], rows[i]['gid']), E_mean) - E_mean for i in dml_idx])
sub_v = np.array([0.0 if rows[i]['started'] else 1.0 for i in dml_idx])
D = np.column_stack([p_t] + [p_t * np.array([1.0 if rows[i]['pos'] == p else 0.0 for i in dml_idx]) for p in pos_d]
                    + [p_t * E_v, p_t * sub_v])
names = ['beta_' + BASE_POSITION] + [f'd_{p}' for p in pos_d] + ['rho_E', 'rho_sub']
XtX_inv = np.linalg.pinv(D.T @ D)
b = XtX_inv @ D.T @ r_t
u = r_t - D @ b
meat = np.zeros((D.shape[1], D.shape[1]))
gids = np.array([rows[i]['gid'] for i in dml_idx])
for g in np.unique(gids):
    m = gids == g
    sg = D[m].T @ u[m]
    meat += np.outer(sg, sg)
se = np.sqrt(np.diag(XtX_inv @ meat @ XtX_inv))
coef = dict(zip(names, b))
ses = dict(zip(names, se))
clip = lambda v: float(np.clip(v, -0.3, 0.3))  # noqa: E731
mu_beta = {BASE_POSITION: clip(coef['beta_' + BASE_POSITION])}
for p in pos_d:
    mu_beta[p] = clip(coef['beta_' + BASE_POSITION] + coef[f'd_{p}'])
model['dml'] = dict(mu_beta={k: round(v, 4) for k, v in mu_beta.items()},
                    rho_E=round(clip(coef['rho_E']), 4), rho_sub=round(clip(coef['rho_sub']), 4),
                    raw={k: [round(float(coef[k]), 4), round(float(ses[k]), 4)] for k in names},
                    n=len(dml_idx), nuisance='cross-fitted ridge (5 folds by match)')
log('DML (coef, cluster SE): ' + ', '.join(f'{k}={coef[k]:+.3f}({ses[k]:.3f})' for k in names))

# ------------------------------------------------------------------ 6. summaries for priors
summ = defaultdict(lambda: defaultdict(lambda: np.zeros(6)))
for i, r in enumerate(rows):
    if not ok[i]:
        continue
    w, rr, ps = omega_v[i], resid[i], psi[i]
    summ[(r['pid'], r['gid'])][KEYS[r['key']][0]] += np.array([w, w * w, w * rr, w * ps, w * ps * ps, w * ps * rr])
summaries = defaultdict(list)
for (pid, gid), mins in minutes.items():
    fam = {f: [round(float(v), 5) for v in arr] for f, arr in summ.get((pid, gid), {}).items()}
    summaries[str(pid)].append(dict(g=gid, date=games[gid]['date'], week=games[gid]['week'], min=round(mins, 2),
                                    rec=recs.get((pid, gid), 0), fam=fam))
for v in summaries.values():
    v.sort(key=lambda s: s['date'])
model['summaries'] = summaries

# moment estimates (§4): within-player between-match variance and between-player variance of match means
means, within, between = defaultdict(list), [], []
for (pid, gid), fams in summ.items():
    tot = sum(fams.values())
    if tot[0] > 5:
        means[pid].append((tot[2] / tot[0], tot[1] / tot[0] ** 2))
for pid, v in means.items():
    if len(v) >= 2:
        m = np.array([a for a, _ in v])
        within.append(m.var(ddof=1) - np.mean([s for _, s in v]))
    between.append(np.mean([a for a, _ in v]))
nu2 = float(np.mean(within)) if within else None
tau2 = float(np.var(between) - (nu2 or 0) / 2) if between else None
fitted = {}
if nu2 and 0.05 ** 2 <= nu2 <= 0.4 ** 2:
    fitted['nu'] = round(math.sqrt(nu2), 4)
if tau2 and 0.05 ** 2 <= tau2 <= 0.4 ** 2:
    fitted['tau_theta'] = round(math.sqrt(tau2), 4)
model['params_fitted'] = fitted
log(f'moment estimates: nu^2={nu2}, tau_theta^2={tau2} -> using {fitted or "defaults"}')

model['built'] = time.strftime('%Y-%m-%d %H:%M:%S')
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(model, f, separators=(',', ':'))
log(f'wrote {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB)')
