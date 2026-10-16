"""v3 train/inference feature parity. After-ball Hawk-Eye may be used; outcome is never a predictor."""
import math
import re
import numpy as np

STYLES = {'FAST_SEAM':1,'MEDIUM_SEAM':2,'SEAM':3,'LEG_SPIN':4,'OFF_SPIN':5,
          'LEFT_ARM_ORTHODOX':6,'SLOW_LEFT_ARM_ORTHODOX':6,'LEFT_ARM_CHINAMAN':7,'UNKNOWN':0}
FEATURES = ['innings','runs_before','wickets_before','legal_balls_before','target',
            'batter_id','bowler_id','right_handed','right_armed','style_id',
            'ball_speed','pitch_x','pitch_y','stumps_x','stumps_y',
            'phase','required_run_rate','current_run_rate','pressure_pre',
            'needs_runs','remaining_balls']
TRACKING_BOUNDS = {'ball_speed': (15,55), 'pitch_x':(-3,3), 'pitch_y':(0,25),
                   'stumps_x':(-3,3),'stumps_y':(-1,4)}

def number(value, default=np.nan):
    try:
        if value is None or str(value).strip()=='': return default
        n=float(value)
        return default if (not math.isfinite(n) or n == -1) else n
    except (TypeError,ValueError): return default

def legal_ball(extras):
    """Wide/no-ball are not legal deliveries; byes/leg-byes are legal."""
    extras = str(extras or '').lower()
    return 'wd' not in extras and 'wide' not in extras and 'nb' not in extras and 'no.ball' not in extras

def bowler_credited_wicket(dismissal):
    value = str(dismissal or '').strip().lower()
    if not value: return False
    return not any(x in value for x in ('run out','retired','obstructing','timed out'))

def striker_out(dismissal, striker_name):
    value = str(dismissal or '').strip().lower()
    if not value: return False
    if 'run out' in value:
        m=re.search(r'run out\s*\((.*?)\)',value)
        if not m: return False  # ambiguous, do not assume striker was dismissed
        return m.group(1).strip()==str(striker_name).strip().lower()
    if any(x in value for x in ('retired','obstructing','timed out')):
        return str(striker_name).strip().lower() in value
    return True

def pressure_index(innings,runs,wickets,legal_balls,target=None,scheduled_balls=120):
    """Engineering proxy for *match-context* pressure, not measured mental pressure."""
    balls=max(1,int(scheduled_balls))
    phase=min(1.,max(0.,legal_balls/balls))
    wk=min(1.,max(0.,wickets/10.))
    late_leverage=phase*(0.4+0.6*wk)
    chase_strain=0.
    if int(innings)==2 and target is not None and math.isfinite(number(target)):
        remaining=max(1,balls-int(legal_balls))
        needed=max(0.,float(target)-float(runs))
        req=needed*6./remaining
        # 0 if already won. Sigmoid of required rate, emphasis towards end.
        chase_strain=(1. / (1.+math.exp(-max(-40.,min(40.,(req-8.)/2.5)))))*phase if needed>0 else 0.
    return round(100.*(0.25*phase**1.7+0.2*wk+0.35*chase_strain+0.2*late_leverage),2)

def build_values(innings,runs_before,wickets_before,balls_before,target,batter_id,bowler_id,
                 handed=None,armed=None,style=None,speed=None,px=None,py=None,sx=None,sy=None,
                 scheduled_balls=120):
    innings=int(innings); runs_before=max(0.,float(runs_before));
    wickets_before=max(0.,float(wickets_before)); balls_before=max(0.,float(balls_before))
    target_num=number(target)
    remaining=max(0.,float(scheduled_balls)-balls_before)
    needed=max(0.,target_num-runs_before) if math.isfinite(target_num) and innings==2 else np.nan
    rrr=needed*6/max(1.,remaining) if math.isfinite(needed) else np.nan
    crr=runs_before*6/max(1.,balls_before)
    base=[innings,runs_before,wickets_before,balls_before,target_num,number(batter_id),number(bowler_id),
          number(handed),number(armed),STYLES.get(str(style or 'UNKNOWN').upper(),0),
          number(speed),number(px),number(py),number(sx),number(sy),
          min(1.,balls_before/max(1.,scheduled_balls)),rrr,crr,
          pressure_index(innings,runs_before,wickets_before,balls_before,target_num,scheduled_balls),
          needed,remaining]
    for field,(lo,hi) in TRACKING_BOUNDS.items():
        i=FEATURES.index(field)
        if not math.isfinite(base[i]) or base[i]<lo or base[i]>hi:base[i]=np.nan
    return base

def pre_state(event):
    ball,sc=event.ball,event.score
    return dict(runs=max(0,sc.runs-ball.total_runs), wickets=max(0,sc.wickets-int(bool(ball.dismissal.strip()))),
                balls=max(0,sc.legal_balls-int(ball.legal)))

def request_features(event,metadata):
    ball,sc=event.ball,event.score
    pre=pre_state(event)
    batmeta=metadata.get('batters',{}).get(event.batter.id,{})
    bowlmeta=metadata.get('bowlers',{}).get(event.bowler.id,{})
    return np.array([build_values(sc.innings,pre['runs'],pre['wickets'],pre['balls'],sc.target,
        event.batter.id,event.bowler.id,batmeta.get('handed'),bowlmeta.get('armed'),bowlmeta.get('style'),
        ball.speed_mps,ball.pitch_x,ball.pitch_y,ball.stumps_x,ball.stumps_y,sc.scheduled_balls)],float)
