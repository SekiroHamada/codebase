"""After-ball player reliability v3. Trained outcomes, EB profiles, honest uncertainty; NOT causal mental choking."""
from pathlib import Path
from typing import Optional
import math
import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from features import (request_features,pre_state,pressure_index,
                      striker_out,bowler_credited_wicket)

app=FastAPI(title='Cricket context + player baselines v3',version='3.0')
ARTIFACT=Path(__file__).resolve().parent/'artifacts'/'cricket_model.joblib'
bundle=None
try:
    if ARTIFACT.exists(): bundle=joblib.load(ARTIFACT)
except Exception as error:
    print('Model load failed:',error)

class Participant(BaseModel):
    id:str
    name:str
class Ball(BaseModel):
    delivery_id:str
    speed_mps:Optional[float]=None
    pitch_x:Optional[float]=None
    pitch_y:Optional[float]=None
    stumps_x:Optional[float]=None
    stumps_y:Optional[float]=None
    field_x:Optional[float]=None
    field_y:Optional[float]=None
    batter_runs:int=0
    bowler_runs:int=0
    total_runs:int=0
    extras:str=''
    dismissal:str=''
    legal:bool=True
class Score(BaseModel):
    innings:int
    runs:int
    wickets:int
    legal_balls:int
    target:Optional[int]=None
    scheduled_balls:int=120
class DeliveryRequest(BaseModel):
    match_id:str
    event_index:int=Field(ge=0)
    batter:Participant
    bowler:Participant
    ball:Ball
    score:Score

# In-memory replay store; one FastAPI process, one active replay per match.
state={}
def rounded(v,n=3):return round(float(v),n)
def sigmoid(x):return 1./(1.+math.exp(-max(-35.,min(35.,x))))

def get_profile(role, pid):
    return bundle.get('profiles',{}).get(role,{}).get(pid,{})

def profile_effect(profile, pressure, cfg, thresholds):
    """EB shrinkage for player long-term residual + high-low contrast."""
    n=int(profile.get('n',0)); k=cfg['profile_shrink_k']
    overall=(n/(n+k))*float(profile.get('delta_mean',0.)) if n else 0.
    nh=int(profile.get('high_n',0));nl=int(profile.get('low_n',0))
    gap=None; interval=None; usable=False
    if nh>=cfg['pressure_delta_min_n'] and nl>=cfg['pressure_delta_min_n']:
        kh=cfg['pressure_shrink_k']
        h=(nh/(nh+kh))*float(profile['high_mean'])
        l=(nl/(nl+kh))*float(profile['low_mean'])
        gap=h-l
        usable=True
        # Approximate uncertainty ignoring within-player match correlation; clearly labeled descriptive.
        sh=profile.get('high_std') or 1.
        sl=profile.get('low_std') or 1.
        se=math.sqrt((nh/(nh+kh))**2*sh**2/nh + (nl/(nl+kh))**2*sl**2/nl)
        interval=[rounded(gap-1.96*se),rounded(gap+1.96*se)]
    high_gate=max(0.,min(1.,(pressure-thresholds['low'])/max(1e-6,thresholds['high']-thresholds['low'])))
    high_effect=high_gate*gap if usable else 0.
    return overall,high_effect,gap,interval,usable

def model_predictions(x):
    models=bundle['models']
    return {k:(max(0.,float(m.predict(x)[0])) if k.endswith('_runs') else
               max(1e-3,min(1.-1e-3,float(m.predict_proba(x)[0,1]))))
            for k,m in models.items()}

def role_deviation(role,pred,ball,batter_name):
    cfg=bundle['scales']
    if role=='batter':
        expected,observed=pred['batting_runs'],max(0.,float(ball.batter_runs))
        prob=pred['batter_out'];out=1. if striker_out(ball.dismissal,batter_name) else 0.
        run=(observed-expected)/max(0.3,cfg['batting_runs'])
        wk=(prob-out)/math.sqrt(max(.06,prob*(1-prob)))
    else:
        expected,observed=pred['bowling_runs'],max(0.,float(ball.bowler_runs))
        prob=pred['bowler_wicket'];out=1. if bowler_credited_wicket(ball.dismissal) else 0.
        run=(expected-observed)/max(0.3,cfg['bowling_runs'])
        wk=(out-prob)/math.sqrt(max(.06,prob*(1-prob)))
    value=max(-5.,min(5.,run+0.4*max(-4.,min(4.,wk))))
    return value, run, wk, expected, observed, prob, bool(out)

@app.get('/health')
def health():
    ready=bool(bundle and bundle.get('version')=='cricket-context-eb-conformal-v3')
    return {'status':'ok' if ready else 'model-not-loaded',
            'engine':'trained-context-eb-conformal-v3' if ready else 'model-not-loaded',
            'trained_model':ready}

@app.get('/model/info')
def model_info():
    return {'loaded':bool(bundle),'version':bundle.get('version') if bundle else None,
            'metrics':bundle.get('metrics') if bundle else None,
            'method': 'conditional gradient boosting + EB player profiles + pressure-weighted EWMA + split conformal'}

@app.post('/evaluate/cricket/post-ball')
def evaluate(event:DeliveryRequest):
    if not bundle or bundle.get('version')!='cricket-context-eb-conformal-v3':
        raise HTTPException(503,'Train v3 using train.py, then restart FastAPI')
    excluded=bundle['metrics']['excluded_replay_match']
    if str(event.match_id)!=str(excluded):
        raise HTTPException(400,f'Retrain with --exclude-match {event.match_id}; this model excludes match {excluded}')
    match=state.get(event.match_id)
    # Idempotence: a retry of event zero should not reset/replay the score twice.
    if match and event.event_index==match['last'] and match['reply'] is not None:
        return match['reply']
    if event.event_index==0:
        match={'last':-1,'players':{},'reply':None}
        state[event.match_id]=match
    elif not match:
        raise HTTPException(409,'Start replay with event_index=0 (reset state)')
    elif event.event_index<=match['last']:
        raise HTTPException(409,'Replay went backwards; restart with event_index=0')
    elif event.event_index!=match['last']+1:
        raise HTTPException(409,'Missing delivery event; send each event sequentially')
    pred=model_predictions(request_features(event,bundle['metadata']).reshape(1,-1))
    pre=pre_state(event)
    p=pressure_index(event.score.innings,pre['runs'],pre['wickets'],pre['balls'],
                     event.score.target,event.score.scheduled_balls)
    cfg=bundle['config'];players={};explanations={}
    for role,person in (('batter',event.batter),('bowler',event.bowler)):
        d,run,wk,expected,actual,wicket_prob,wicket_out=role_deviation(role,pred,event.ball,event.batter.name)
        prof=get_profile(role,person.id)
        prior,highex,gap,gap_interval,usable=profile_effect(prof,p,cfg,bundle['thresholds'])
        key=f'{role}:{person.id}'
        entry=match['players'].setdefault(key,{'rolling':0.,'n':0})
        alpha=cfg['ema_alpha']
        weighted=d*(1.+cfg['pressure_multiplier']*p/100.)
        entry['rolling']=(1-alpha)*entry['rolling']+alpha*weighted
        entry['n']+=1
        latent=prior+highex+entry['rolling']
        score=100*sigmoid(cfg['trust_logistic_slope']*latent)
        q=bundle['intervals']['batting_runs' if role=='batter' else 'bowling_runs']
        players[role]={
          'id':person.id,'name':person.name,'trustScore':rounded(score,1),
          'chokingProbability':None,
          'expectedRuns':rounded(expected),'observedRuns':rounded(actual),
          'expectedRunsInterval90':[rounded(max(0,expected-q)),rounded(expected+q)],
          'expectedDismissalProbability':rounded(wicket_prob,4),
          'observedRelevantDismissal':wicket_out,
          'deliveryDeviation':rounded(d),
          'historicalSample':int(prof.get('n',0)),
          'historicalHighPressureCount':int(prof.get('high_n',0)),
          'historicalRelativePressureThresholds':bundle['thresholds'],
          'historicalLowPressureCount':int(prof.get('low_n',0)),
          'historicalPressureGapNormalized':rounded(gap) if gap is not None else None,
          'historicalPressureGapApprox95CI':gap_interval,
          'replayDeliveries':entry['n'],
          'uncertaintyNote': 'Player pressure gap is observational and interval ignores match-level correlation.'
        }
        explanations[role]={
          'run_residual_standardized':rounded(run),
          'wicket_residual_standardized':rounded(wk),
          'combined_delivery_residual':rounded(d),
          'shrunken_player_baseline':rounded(prior),
          'pressure_conditioned_history_adjustment':rounded(highex),
          'pressure_weighted_rolling_residual':rounded(entry['rolling']),
          'trust_logit':rounded(cfg['trust_logistic_slope']*latent),
          'historical_pressure_gap_reliable_enough_to_display':usable}
    tracked=('speed_mps','pitch_x','pitch_y','stumps_x','stumps_y')
    missing=[name for name in tracked if getattr(event.ball,name) is None]
    result={
      'match_id':event.match_id,'event_index':event.event_index,
      'delivery_id':event.ball.delivery_id,'model_version':bundle['version'],
      'status':'trained_reliability_model_not_causal',
      'pressure':{'score':p,'level':'HIGH' if p>=70 else 'MEDIUM' if p>=40 else 'LOW'},
      'batter':players['batter'],'bowler':players['bowler'],
      'data_quality':{'missing_tracking_fields':missing,'imputed':False,
                      'model_handles_missing_tracking':True},
      'explanations':explanations,
      'model_limitations':{
          'trust_score_calibrated_as_probability':False,
          'choking_probability_available':False,
          'mental_pressure_causation_identified':False,
          'expected_runs_interval_is_marginal_not_conditional':True},
      'note':'Post-ball outcomes compared with context-aware ML expectations; trust is an engineering index. No mental-pressure causal claim.'}
    match['last']=event.event_index
    match['reply']=result
    return result
