"""Game state for one PFF match.

Feeds raw PFF events in order and keeps everything the formula needs: score (with the valid-goal rule),
clock, substitutions, shootout, positions, time on pitch, recoveries, pending retention outcomes,
per-player Kalman filters. The same class runs offline (collector mode) so the model is trained on
exactly the observations the live server sees.
"""
import numpy as np

from . import features, pressure
from .constants import (FAMILIES, GROUP, KEYS, PARAMS, REC_RATE_DEFAULT,
                        RETENTION_KEYS, SUCCESS_ONLY)
from .kalman import PlayerFilter
from .priors import compute_prior
from .residual import DifficultyModel, combine, grade_residual, outcome_residual, recovery_residual
from .trust import trust_output

F = len(FAMILIES)


_PEN_IDX = {k: features.feature_names(k).index('penalty') for k in ('shot', 'save')}


def expected_success(difficulty, penalty_rates, key, feats, game_id):
    """p-hat from the difficulty model; penalties use their empirical tournament rate (a distinct 'item')."""
    if key in _PEN_IDX and feats[_PEN_IDX[key]] > 0.5 and key in penalty_rates:
        return penalty_rates[key]
    return difficulty.predict(key, feats, game_id)


def standardise(r, key, pos, r_norm):
    """Centre/scale residuals per (action key, position) so E[r]=0, Var(r)=1 over the tournament."""
    if r is None:
        return None
    t = r_norm.get(key, {})
    m, s = t.get(pos) or t.get('_all') or (0.0, 1.0)
    c = PARAMS['z_clip']
    return max(-c, min(c, (r - m) / s))


def omega(weights_by_pos, pos, key, o):
    """§8.3 position-specific precision weight omega_p(k, o)."""
    stat = KEYS[key][1]
    W = weights_by_pos.get(pos) or {}
    s, f = W.get(f'{stat}|S'), W.get(f'{stat}|F')
    if key in SUCCESS_ONLY or o == 1 or f is None:
        w = s or 1.0
    elif o == 0:
        w = f
    else:
        w = 0.5 * ((s or 1.0) + f)
    return min(max(w, 0.5), 2.0)     # position matters, but no single action may count more than 2 ordinary ones


class GameState:
    def __init__(self, game_id, model, weights=None, collector=None):
        self.gid = str(game_id)
        self.model = model
        self.collector = collector
        g = model['games'][self.gid]
        self.meta = g
        self.home, self.away = int(g['home']['id']), int(g['away']['id'])
        self.week, self.date = g['week'], g['date']
        self.pitch = tuple(g.get('pitch') or (105.0, 68.0))
        self.roster = {int(r['id']): r for r in model['rosters'][self.gid]}
        self.stakes = {int(k): v for k, v in pressure.game_stakes(self.gid, model['games'], model['groups']).items()}
        self.Pi_half = model.get('Pi_half', 1.0)
        self.rec_rate = model.get('rec_rate', REC_RATE_DEFAULT)
        self.weights = (weights or {}).get('weights', {}).get('data+expert', {})
        self.r_norm = model.get('r_norm', {})
        self.grade_stats = model.get('grade_stats', {})
        self.rho = model.get('rho', {})
        self.difficulty = DifficultyModel(model.get('difficulty', {}), model.get('game_fold', {}))
        # match state
        self.period, self.clock = 1, 0.0
        self.score = {self.home: 0, self.away: 0}
        self.pending_goal = None
        self.game_over = False
        self.shootout = None
        self.dir_cache = {}
        self.positions = {}          # pid -> (x, y, pos, speed, team)
        self.on_field = set()
        self.on_pitch = {}           # pid -> minutes on the pitch
        self.pos_minutes = {}
        self.entered = {}            # pid -> (clock, is_sub)
        self.last_t = self.last_period = None
        self.prev_poss_team = None
        self.pending = []            # retention observations waiting for the next possession event
        self.rec_win = {}            # pid -> [minutes, count]
        self.recoveries = {}
        self.events_seen = 0
        self.priors, self.filters = {}, {}
        if collector is None:
            for pid, r in self.roster.items():
                self.priors[pid] = compute_prior(pid, r['pos'], r['started'], self.date, model)

    # ------------------------------------------------------------------ helpers
    def other(self, team):
        return self.away if team == self.home else self.home

    def attack_dir(self, team, period):
        d = self.dir_cache.get((period, team))
        if d is not None:
            return d
        g = self.meta
        left = g.get('homeStartLeft', True)
        if period >= 3 and g.get('homeStartLeftET') is not None:
            left = g['homeStartLeftET']
        home_dir = 1 if left else -1
        if period in (2, 4):
            home_dir = -home_dir
        return home_dir if team == self.home else -home_dir

    def _snapshot(self, ev):
        snap = {}
        for side, team in (('homePlayers', self.home), ('awayPlayers', self.away)):
            for p in ev.get(side) or []:
                pid = p.get('playerId')
                if pid is None or p.get('x') is None or p.get('y') is None:
                    continue
                pid = int(pid)
                pos = GROUP.get(p.get('positionGroupType')) or self.roster.get(pid, {}).get('pos')
                snap[pid] = (float(p['x']), float(p['y']), pos, p.get('speed'), team)
        return snap

    def _players(self, snap):
        return snap if snap else {p: self.positions[p] for p in self.on_field if p in self.positions}

    def _loc(self, pid, snap, ball=None):
        v = (snap or {}).get(pid) or self.positions.get(pid)
        return (v[0], v[1]) if v else ball

    def _pos(self, pid, snap):
        v = (snap or {}).get(pid) or self.positions.get(pid)
        return (v[2] if v and v[2] else None) or self.roster[pid]['pos']

    def _enter(self, pid, is_sub):
        if pid in self.entered:
            return
        self.entered[pid] = (self.clock, is_sub)
        if self.collector is None:
            self.filters[pid] = PlayerFilter(self.priors[pid], self.clock, is_sub)

    # ------------------------------------------------------------------ main entry
    def process(self, ev):
        self.events_seen += 1
        ge = ev.get('gameEvents') or {}
        pe = ev.get('possessionEvents') or {}
        it = ev.get('initialTouch') or {}
        period = ge.get('period') or self.period
        clk = pe.get('gameClock') if pe.get('gameClock') is not None else ge.get('startGameClock')
        if clk is not None:
            self.clock = float(clk) / 60.0
        t = ev.get('eventTime')
        team = ge.get('teamId')
        team = int(team) if team is not None else None
        tad = (ev.get('stadiumMetadata') or {}).get('teamAttackingDirection')
        if team in self.score and tad in ('R', 'L') and (period, team) not in self.dir_cache:
            d = 1 if tad == 'R' else -1
            self.dir_cache[(period, team)] = d
            self.dir_cache[(period, self.other(team))] = -d

        snap = self._snapshot(ev)
        dt = 0.0
        if t is not None and self.last_t is not None and self.last_period == period:
            dt = min(max(t - self.last_t, 0.0), 30.0) / 60.0
        if t is not None:
            self.last_t, self.last_period = t, period
        self.period = period
        if snap:
            for pid, v in snap.items():
                if pid not in self.roster:
                    continue
                if pid not in self.entered:
                    self._enter(pid, is_sub=not self.roster[pid]['started'])
                self.on_pitch[pid] = self.on_pitch.get(pid, 0.0) + dt
                if v[2]:
                    self.pos_minutes[v[2]] = self.pos_minutes.get(v[2], 0.0) + dt
                self.positions[pid] = v
                self.rec_win.setdefault(pid, [0.0, 0])[0] += dt
            self.on_field = {p for p in snap if p in self.roster}

        gtype = ge.get('gameEventType')
        sp = ge.get('setpieceType')
        if self.pending_goal is not None and sp not in (None, 'O'):     # §3.2 valid-goal rule
            if sp == 'K' and team in self.score:
                self.score[self.other(team)] += 1      # the conceding team kicks off (handles own goals)
            self.pending_goal = None
        if gtype == 'SUB' and ge.get('playerOnId') is not None and int(ge['playerOnId']) in self.roster:
            self._enter(int(ge['playerOnId']), is_sub=True)
        if gtype == 'END':
            self._resolve_pending(None)
            if self.pending_goal is not None:
                gteam, was_shot = self.pending_goal
                self.score[gteam if was_shot else self.other(gteam)] += 1
                self.pending_goal = None
            if ge.get('endType') == 'G':
                self.game_over = True

        a = pe.get('possessionEventType')
        if a:
            self._resolve_pending(team)
            if (sp == 'O' and a in ('IT', 'CH', 'RE', 'CL') and self.prev_poss_team is not None
                    and team is not None and team != self.prev_poss_team and ge.get('playerId') is not None):
                pid = int(ge['playerId'])
                if pid in self.roster:
                    self.rec_win.setdefault(pid, [0.0, 0])[1] += 1
                    self.recoveries[pid] = self.recoveries.get(pid, 0) + 1
            if team is not None:
                self.prev_poss_team = team
            for obs in self._observations(ev, ge, pe, it, a, team, snap, sp):
                if obs['key'] in RETENTION_KEYS:
                    self.pending.append(obs)
                else:
                    self._finalize(obs)
            if a == 'SH':
                self._after_shot(pe, team, sp)
            if pe.get('shotOutcomeType') == 'G' and not self.game_over and team in self.score:
                self.pending_goal = (team, a == 'SH')     # ball in the net; confirmed at the next restart
        self._recovery_windows()

    # ------------------------------------------------------------------ observations (§1 role table)
    def _observations(self, ev, ge, pe, it, a, team, snap, sp):
        ball = None
        b = ev.get('ball')
        if b and b[0] and b[0].get('x') is not None:
            ball = (float(b[0]['x']), float(b[0]['y']))
        out = []

        def make(pid, key, o, grade, actor=None, target=None):
            if pid is None:
                return
            pid = int(pid)
            if pid not in self.roster:
                return
            actor = int(actor) if actor is not None else pid
            if actor not in self.roster:
                actor = pid
            a_team = self.roster[actor]['team']
            pos = self._pos(pid, snap)
            loc = self._loc(pid, snap, ball)
            aloc = self._loc(actor, snap, ball)
            feats = None
            if aloc is not None:
                players = self._players(snap)
                opp = [(v[0], v[1]) for q, v in players.items() if v[4] != a_team]
                gk = next(((v[0], v[1]) for q, v in players.items() if v[4] != a_team and v[2] == 'GK'), None)
                spd = players.get(actor, (None, None, None, None))[3]
                tl = None
                if target is not None and int(target) in self.roster:
                    tl = self._loc(int(target), snap)
                feats = features.build(key, pos, aloc, self.attack_dir(a_team, self.period), self.pitch,
                                       opp, gk, spd, pe, ge, it, self.on_pitch.get(pid, 0.0), tl)
            L_override = None
            if self.game_over and a == 'SH' and sp == 'P' and key in ('shot', 'save'):
                L_override = self._kick_leverage(team)
            out.append(dict(pid=pid, key=key, o=o, grade=grade, team=self.roster[pid]['team'], pos=pos,
                            loc_c=loc, feats=feats, t=self.clock, period=self.period, L_override=L_override))

        g = pe
        if a in ('PA', 'CR'):
            target = g.get('receiverPlayerId') or g.get('targetPlayerId')
            if a == 'PA':
                po = g.get('passOutcomeType')
                make(g.get('passerPlayerId'), 'pass', None if po is None else int(po == 'C'), g.get('passerGrade'),
                     target=target)
            else:
                make(g.get('crosserPlayerId'), 'cross', int(g.get('receiverPlayerId') is not None),
                     g.get('crosserGrade'), target=target)
            if g.get('receiverPlayerId') is not None:
                make(g['receiverPlayerId'], 'receive', 0 if g.get('missedTouchType') else 1, g.get('receiverGrade'))
            elif g.get('targetPlayerId') is not None:
                make(g['targetPlayerId'], 'receive', None, g.get('targetGrade'))
            if g.get('defenderPlayerId') is not None:
                make(g['defenderPlayerId'], 'interception', None, g.get('defenderGrade'))
            if g.get('blockerPlayerId') is not None:
                make(g['blockerPlayerId'], 'block', None, g.get('blockerGrade'))
        elif a == 'SH':
            goal = g.get('shotOutcomeType') == 'G'
            shooter = g.get('shooterPlayerId')
            make(shooter, 'shot', int(goal) if g.get('shotOutcomeType') else None, g.get('shooterGrade'))
            if g.get('keeperPlayerId') is not None:
                make(g['keeperPlayerId'], 'save', int(not goal) if g.get('shotOutcomeType') else None,
                     g.get('keeperGrade'), actor=shooter)
            if g.get('blockerPlayerId') is not None:
                make(g['blockerPlayerId'], 'block', None, g.get('blockerGrade'))
        elif a == 'CH':
            winner = g.get('challengeWinnerPlayerId')
            drib = g.get('dribblerPlayerId')
            if drib is not None:
                make(drib, 'dribble', None if winner is None else int(winner == drib), g.get('dribblerGrade'))
            seen = {drib}
            for fid, gfield in (('challengerPlayerId', 'challengerGrade'), ('homeDuelPlayerId', 'homeDuelGrade'),
                                ('awayDuelPlayerId', 'awayDuelGrade'), ('ballCarrierPlayerId', 'ballCarrierGrade')):
                pid = g.get(fid)
                if pid is None or pid in seen:
                    continue
                seen.add(pid)
                make(pid, 'duel', None if winner is None else int(winner == pid), g.get(gfield))
        elif a == 'CL':
            make(g.get('clearerPlayerId'), 'clearance', 'pending', g.get('clearerGrade'))
        elif a == 'TC':
            make(g.get('ballCarrierPlayerId') or ge.get('playerId'), 'touch', 'pending', g.get('touchGrade'))
        elif a == 'BC':
            make(g.get('ballCarrierPlayerId') or ge.get('playerId'), 'carry', 'pending', g.get('ballCarrierGrade'))
        return out

    def _resolve_pending(self, next_team):
        """Retention outcome = the player's team still has the ball at the next possession event."""
        if not self.pending:
            return
        pend, self.pending = self.pending, []
        for obs in pend:
            obs['o'] = None if next_team is None else int(next_team == obs['team'])
            self._finalize(obs)

    # ------------------------------------------------------------------ shootout (§3.3)
    def _kick_leverage(self, team):
        if team not in self.score:
            return None
        so = self.shootout or {'first': team, 'goals': {self.home: 0, self.away: 0},
                               'kicks': {self.home: 0, self.away: 0}}
        first, second = so['first'], self.other(so['first'])
        return pressure.shootout_kick_leverage(so['goals'][first], so['goals'][second],
                                               so['kicks'][first], so['kicks'][second], team == first)

    def _after_shot(self, pe, team, sp):
        goal = pe.get('shotOutcomeType') == 'G'
        if self.game_over:
            if sp == 'P' and team in self.score:
                if self.shootout is None:
                    self.shootout = {'first': team, 'goals': {self.home: 0, self.away: 0},
                                     'kicks': {self.home: 0, self.away: 0}}
                self.shootout['kicks'][team] += 1
                if goal:
                    self.shootout['goals'][team] += 1

    # ------------------------------------------------------------------ recovery windows
    def _recovery_windows(self):
        win = PARAMS['rec_window']
        for pid, w in self.rec_win.items():
            if w[0] >= win:
                count = w[1]
                w[0] -= win
                w[1] = 0
                self._finalize(dict(pid=pid, key='recovery', o=None, grade=None, count=count, minutes=win,
                                    team=self.roster[pid]['team'], pos=self._pos(pid, None),
                                    loc_c=self._loc(pid, None), feats=None, t=self.clock, period=self.period,
                                    L_override=None))

    # ------------------------------------------------------------------ pressure + update
    def leverage_now(self, team, period=None, clock=None):
        period = self.period if period is None else period
        clock = self.clock if clock is None else clock
        if self.game_over:
            if self.shootout is not None or (self.week >= 4 and self.score[self.home] == self.score[self.away]):
                so = self.shootout or {'first': self.home, 'kicks': {self.home: 0, self.away: 0}}
                k = so['kicks']
                nxt = so['first'] if k[so['first']] == k[self.other(so['first'])] else self.other(so['first'])
                return self._kick_leverage(nxt) or 0.0
            return 0.0
        S, vD, _ = self.stakes.get(team, (0.5, 0.5, None))
        d = self.score[team] - self.score[self.other(team)]
        return pressure.leverage(d, pressure.minutes_remaining(period, clock), vD)

    def _finalize(self, obs):
        team = obs['team']
        S = self.stakes.get(team, (0.5, 0.5, None))[0]
        L = obs['L_override'] if obs.get('L_override') is not None else self.leverage_now(team, obs['period'], obs['t'])
        C = pressure.consequence(obs['pos'], obs['loc_c'], self.attack_dir(team, obs['period']), self.pitch[0])
        obs.update(S=S, L=L, C=C, Pi=S * L * C)
        if self.collector is not None:
            self.collector(self, obs)
            return
        r = self._residual(obs)
        if r is None:
            return
        pid = obs['pid']
        if pid not in self.filters:
            self._enter(pid, is_sub=not self.roster[pid]['started'])
        w = omega(self.weights, obs['pos'], obs['key'], obs['o'])
        flt = self.filters[pid]
        flt.predict(obs['t'])
        flt.update(pressure.psi(obs['Pi'], self.Pi_half), r, PARAMS['sigma2'] / w)

    def _residual(self, obs):
        key, pos = obs['key'], obs['pos']
        if key == 'recovery':
            rate = self.priors[obs['pid']]['rec90'] if obs['pid'] in self.priors else self.rec_rate.get(pos, 8.0)
            return standardise(recovery_residual(obs['count'], pos, obs['minutes'], {pos: rate}),
                               key, pos, self.r_norm)
        z_o = None
        if obs['o'] is not None and obs['feats'] is not None:
            p = expected_success(self.difficulty, self.model.get('penalty_rates', {}), key, obs['feats'], self.gid)
            if p is not None:
                z_o = outcome_residual(obs['o'], p)
        z_g = grade_residual(obs['grade'], key, pos, self.grade_stats) if obs['grade'] is not None else None
        r = combine(key, pos, z_g, z_o, self.rho)
        return standardise(r, key, pos, self.r_norm)

    # ------------------------------------------------------------------ output (§7)
    def psi_now(self, pid, pos):
        team = self.roster[pid]['team']
        S = self.stakes.get(team, (0.5, 0.5, None))[0]
        L = self.leverage_now(team)
        C = pressure.consequence(pos, self._loc(pid, None) if pid in self.on_field else None,
                                 self.attack_dir(team, self.period), self.pitch[0])
        return pressure.psi(S * L * C, self.Pi_half)

    def trust_all(self, with_attributions=True):
        out = {}
        for pid, r in self.roster.items():
            pos = self._pos(pid, None)
            flt = self.filters.get(pid)
            res = trust_output(self.priors[pid], flt, self.psi_now(pid, pos), with_attributions=with_attributions)
            res.update(position=pos, onPitch=pid in self.on_field, entered=pid in self.entered,
                       nObs=flt.n_obs if flt else 0)
            out[str(pid)] = res
        return out

    def summary(self):
        so = None
        if self.shootout:
            so = {'home': self.shootout['goals'][self.home], 'away': self.shootout['goals'][self.away]}
        return {'gameId': self.gid, 'period': self.period, 'clock': round(self.clock, 2),
                'score': {'home': self.score[self.home], 'away': self.score[self.away]},
                'shootout': so, 'gameOver': self.game_over, 'eventsSeen': self.events_seen}
