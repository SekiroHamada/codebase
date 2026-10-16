"""Usage: python tools/position_stats.py <PFF_ROOT> stats.pkl
Counts actions, outcomes and 15-second shot consequences per position group (all PFF WC2022 matches)."""
import json, glob, collections, bisect, sys, pickle, os
ROOT = sys.argv[1]
GROUP = {'GK':'GK','LCB':'CB','RCB':'CB','MCB':'CB','LB':'FB','RB':'FB','LWB':'FB','RWB':'FB',
         'DM':'DM','CM':'CM','AM':'AM','LW':'W','RW':'W','LM':'W','RM':'W','CF':'CF'}
minutes = collections.Counter()
cnt = collections.Counter()            # (grp,key)
succ = collections.Counter()           # (grp,key) successes
cons = collections.defaultdict(lambda: [0,0,0,0,0,0])  # (grp,key,o) -> [n, own_shot15, opp_shot15]
files = [f for f in glob.glob(os.path.join(ROOT, 'Event Data', '*.json'))]
for fn in files:
    ev = json.load(open(fn))
    roster = {}
    gid = os.path.splitext(os.path.basename(fn))[0]
    try:
        for r in json.load(open(os.path.join(ROOT, 'Rosters', gid + '.json'))):
            roster[int(r['player']['id'])] = (r['positionGroupType'], int(r['team']['id']))
    except Exception: pass
    # shot times per team per period
    shots = collections.defaultdict(list)
    for e in ev:
        pe = e.get('possessionEvents') or {}
        if pe.get('possessionEventType') == 'SH':
            shots[(e['gameEvents']['period'], e['gameEvents']['teamId'])].append(e['eventTime'])
    for k in shots: shots[k].sort()
    teams = {r[1] for r in roster.values()}
    def shot_within(period, team, t, w=15.0):
        L = shots.get((period, team), [])
        i = bisect.bisect_right(L, t)
        return i < len(L) and L[i] <= t + w
    prev_t = None; prev_period = None; prev_poss_team = None
    poss_idx = [i for i, e in enumerate(ev) if (e.get('possessionEvents') or {}).get('possessionEventType')]
    next_team = {}
    for j in range(len(poss_idx) - 1):
        next_team[poss_idx[j]] = ev[poss_idx[j+1]]['gameEvents']['teamId'] if ev[poss_idx[j+1]]['gameEvents']['period'] == ev[poss_idx[j]]['gameEvents']['period'] else None
    for i, e in enumerate(ev):
        ge = e['gameEvents']; pe = e.get('possessionEvents') or {}; per = ge['period']; t = e['eventTime']
        snap = {}
        for side in ('homePlayers', 'awayPlayers'):
            for p in e.get(side) or []:
                if p.get('playerId') is not None:
                    snap[int(p['playerId'])] = GROUP.get(p.get('positionGroupType'), None)
        # minutes by position
        if prev_t is not None and prev_period == per and t is not None:
            dt = min(max(t - prev_t, 0), 30) / 60
            for pid, g in snap.items():
                if g: minutes[g] += dt
        prev_t, prev_period = t, per
        a = pe.get('possessionEventType')
        if not a: continue
        team = ge['teamId']; opp = next(iter(teams - {team}), None) if team else None
        def grp(pid):
            return snap.get(pid) or GROUP.get(roster.get(pid, (None,))[0])
        def add(pid, key, o, own_team):
            if pid is None: return
            g = grp(int(pid))
            if not g: return
            cnt[(g, key)] += 1
            if o is None: return
            succ[(g, key)] += o
            other = next(iter(teams - {own_team}), None)
            c = cons[(g, key, o)]
            c[0] += 1; c[1] += shot_within(per, own_team, t); c[2] += shot_within(per, other, t)
        nt = next_team.get(i)
        retained = None if nt is None else int(nt == team)
        # recovery: possession switched to this team in open play
        if prev_poss_team is not None and team is not None and team != prev_poss_team and ge.get('setpieceType') == 'O' and a in ('IT', 'CH', 'RE', 'CL'):
            add(ge.get('playerId'), 'REC (ball recovery)', 1, team)
        if team is not None: prev_poss_team = team
        if a == 'PA':
            o = int(pe.get('passOutcomeType') == 'C')
            add(pe.get('passerPlayerId'), 'PA passer', o, team)
            if pe.get('defenderPlayerId'): add(pe['defenderPlayerId'], 'PA defender (pass defended)', 1 - o, opp)
        elif a == 'CR':
            o = int(pe.get('receiverPlayerId') is not None)
            add(pe.get('crosserPlayerId'), 'CR crosser', o, team)
        elif a == 'SH':
            o = int(pe.get('shotOutcomeType') == 'G')
            add(pe.get('shooterPlayerId'), 'SH shooter (goal)', o, team)
            if pe.get('keeperPlayerId'): add(pe['keeperPlayerId'], 'SH keeper (no goal)', 1 - o, opp)
            if pe.get('blockerPlayerId'): add(pe['blockerPlayerId'], 'SH blocker', 1, opp)
        elif a == 'CH':
            w = pe.get('challengeWinnerPlayerId')
            if pe.get('dribblerPlayerId'):
                add(pe['dribblerPlayerId'], 'CH dribbler', int(w == pe['dribblerPlayerId']), team)
            for r in ('challengerPlayerId', 'homeDuelPlayerId', 'awayDuelPlayerId'):
                pid = pe.get(r)
                if pid and pid != pe.get('dribblerPlayerId'):
                    my = roster.get(int(pid), (None, None))[1]
                    add(pid, 'CH challenge/duel', int(w == pid), my)
        elif a == 'CL':
            add(pe.get('clearerPlayerId'), 'CL clearer (retained)', retained, team)
        elif a in ('BC', 'TC'):
            add(pe.get('ballCarrierPlayerId') or ge.get('playerId'), a + ' carry/touch (retained)', retained, team)
        elif a == 'IT':
            add(ge.get('playerId'), 'IT first touch (retained)', retained, team)
pickle.dump((dict(minutes), dict(cnt), dict(succ), {k: v for k, v in cons.items()}), open(sys.argv[2], 'wb'))
print('files', len(files), 'minutes', {k: round(v) for k, v in minutes.items()})
