"""Cricket ML v3: match-group split (train/calibrate/test); player residual profiles on calibration only."""
import argparse,json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, HistGradientBoostingClassifier
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import mean_absolute_error, roc_auc_score, brier_score_loss
from features import (FEATURES, build_values, pressure_index, legal_ball,
                      bowler_credited_wicket, striker_out)

TASKS = {'batting_runs':'reg','bowling_runs':'reg','batter_out':'clf','bowler_wicket':'clf'}

def prepare(path):
    df=pd.read_csv(path,low_memory=False)
    df['innings']=pd.to_numeric(df.delivery.astype(str).str.split('.').str[0],errors='coerce')
    df=df[df.innings.isin([1,2])].copy()
    df['legal']=[legal_ball('' if pd.isna(v) else v) for v in df.extras]
    dismissal=df.dismissalDetails.fillna('').astype(str)
    df['dismissed']=dismissal.str.strip().ne('')
    df['batter_out']=[striker_out(a,b) for a,b in zip(dismissal,df.batter)]
    df['bowler_wicket']=[bowler_credited_wicket(a) for a in dismissal]
    df['pre_runs']=df.groupby(['matchId','innings'],sort=False).runs.cumsum()-df.runs
    df['pre_wickets']=df.groupby(['matchId','innings'],sort=False).dismissed.cumsum()-df.dismissed.astype(int)
    df['pre_balls']=df.groupby(['matchId','innings'],sort=False).legal.cumsum()-df.legal.astype(int)
    first=df[df.innings==1].groupby('matchId').runs.sum().to_dict()
    df['target']=np.where(df.innings==2,df.matchId.map(first)+1,np.nan)
    df['pressure_pre']=[pressure_index(int(r.innings),r.pre_runs,r.pre_wickets,r.pre_balls,r.target) for r in df.itertuples(index=False)]
    X=np.asarray([build_values(r.innings,r.pre_runs,r.pre_wickets,r.pre_balls,r.target,r.batterId,r.bowlerId,
                int(r.rightHandedBat),int(r.rightArmedBowl),r.bowlingStyle,r.ballSpeed,r.pitchX,r.pitchY,r.stumpsX,r.stumpsY)
                for r in df.itertuples(index=False)],float)
    bat=pd.to_numeric(df.batterRuns,errors='coerce').fillna(0).clip(0,8).to_numpy(float)
    bowl=pd.to_numeric(df.bowlerRuns,errors='coerce').fillna(0).clip(0,8).to_numpy(float)
    outcomes={'batting_runs':bat,'bowling_runs':bowl,'batter_out':df.batter_out.to_numpy(int),
              'bowler_wicket':df.bowler_wicket.to_numpy(int)}
    # Metadata must be from allowed train/calibration matches only, otherwise it leaks no labels
    # but can incorporate unrelated replay metadata. Kept separate from training.
    return df,X,outcomes

def group_split(indices, groups, fraction,seed):
    tr,te=next(GroupShuffleSplit(n_splits=1,test_size=fraction,random_state=seed).split(
        np.zeros(len(indices)),groups=groups[indices]))
    return indices[tr],indices[te]

def predict(model,X,task):
    return model.predict(X).astype(float) if task=='reg' else model.predict_proba(X)[:,1]

def role_deviation(y,expected,scales,role):
    run_key='batting_runs' if role=='batter' else 'bowling_runs'
    wicket_key='batter_out' if role=='batter' else 'bowler_wicket'
    sign=1. if role=='batter' else -1.
    p=np.clip(expected[wicket_key],1e-3,1-1e-3)
    # Centered standardized outcomes and wickets; clipping prevents extreme rare-event effects.
    run_delta=sign*(y[run_key]-expected[run_key])/max(0.3,scales[run_key])
    wicket_delta=(p-y[wicket_key]) if role=='batter' else (y[wicket_key]-p)
    wicket_delta=wicket_delta/np.sqrt(np.maximum(0.06,p*(1-p)))
    return np.clip(run_delta+0.4*np.clip(wicket_delta,-4,4),-5.,5.)

def role_profiles(df, indices, deviations, role, low_threshold, high_threshold):
    col='batterId' if role=='batter' else 'bowlerId'
    ids=df.iloc[indices][col].astype(str).to_numpy()
    ps=df.iloc[indices].pressure_pre.to_numpy(float)
    profiles={}
    for pid in np.unique(ids):
        v=deviations[ids==pid]; p=ps[ids==pid]
        low=v[p<=low_threshold]; high=v[p>=high_threshold]
        n=len(v)
        profiles[pid]={'n':int(n),'delta_sum':round(float(v.sum()),6),
            'delta_mean':round(float(v.mean()),6),
            'delta_std':round(float(v.std(ddof=1)) if n>=2 else 1.,6),
            'high_n':int(len(high)),'high_mean':round(float(high.mean()),6) if len(high) else None,
            'high_std':round(float(high.std(ddof=1)),6) if len(high)>1 else None,
            'low_n':int(len(low)),'low_mean':round(float(low.mean()),6) if len(low) else None,
            'low_std':round(float(low.std(ddof=1)),6) if len(low)>1 else None}
    return profiles

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--csv',default='../backend/data/mensIPLHawkeyeStats.csv')
    ap.add_argument('--exclude-match',default='2')
    ap.add_argument('--out',default='artifacts')
    a=ap.parse_args()
    df,X,y=prepare(a.csv)
    groups=df.matchId.astype(str).to_numpy()
    eligible=np.flatnonzero(groups != str(a.exclude_match))
    # Evaluation: 60% train, 20% calibration/player profiling, 20% untouched test (grouped matches).
    development,test=group_split(eligible,groups,.20,seed=42)
    train,calib=group_split(development,groups,.25,seed=43)
    assert len({*groups[train]}&{*groups[calib]})==0
    assert len({*groups[test]}&{*groups[train],*groups[calib]})==0
    models={};metrics={}; cal_pred={}; test_pred={}
    for key,kind in TASKS.items():
        if kind=='reg':
            m=HistGradientBoostingRegressor(max_iter=105,max_leaf_nodes=23,min_samples_leaf=100,
                learning_rate=.07,random_state=42)
        else:
            m=HistGradientBoostingClassifier(max_iter=105,max_leaf_nodes=15,min_samples_leaf=120,
                learning_rate=.07,random_state=42)
        m.fit(X[train],y[key][train]); models[key]=m
        cal_pred[key]=predict(m,X[calib],kind)
        test_pred[key]=predict(m,X[test],kind)
        if kind=='reg':
            metrics[key+'_mae']=round(float(mean_absolute_error(y[key][test],test_pred[key])),4)
        else:
            metrics[key+'_brier']=round(float(brier_score_loss(y[key][test],test_pred[key])),5)
            metrics[key+'_auc']=round(float(roc_auc_score(y[key][test],test_pred[key])),4) if len(np.unique(y[key][test]))==2 else None
    # Constant-prior baselines on the *same* held-out matches for fair comparisons.
    for key,kind in TASKS.items():
        prior=float(np.mean(y[key][train]))
        if kind=='reg': metrics[key+'_constant_baseline_mae']=round(float(np.mean(np.abs(y[key][test]-prior))),4)
        else: metrics[key+'_constant_baseline_brier']=round(float(brier_score_loss(y[key][test],np.full(len(test),prior))),5)
    scales={k:round(float(np.std(y[k][calib]-cal_pred[k],ddof=1)),6) for k in ('batting_runs','bowling_runs')}
    intervals={}
    for key in ('batting_runs','bowling_runs'):
        abs_error=np.abs(y[key][calib]-cal_pred[key])
        # Split-conformal marginal interval at nominal 90%, clipped at zero for counts of runs.
        n=len(abs_error);order=min(n-1,max(0,int(np.ceil((n+1)*0.90))-1))
        q=float(np.sort(abs_error)[order]);intervals[key]=round(q,5)
        metrics[key+'_test_90pct_coverage']=round(float(np.mean(np.abs(y[key][test]-test_pred[key])<=q)),4)
    profiles={}
    low_threshold=float(np.quantile(df.iloc[calib].pressure_pre.to_numpy(float),.25))
    high_threshold=float(np.quantile(df.iloc[calib].pressure_pre.to_numpy(float),.80))
    thresholds={'low':round(low_threshold,4),'high':round(high_threshold,4),
                'definition':'calibration-set pressure bottom 25% vs top 20%'}
    for role in ('batter','bowler'):
        caldev=role_deviation({k:v[calib] for k,v in y.items()},cal_pred,scales,role)
        profiles[role]=role_profiles(df,calib,caldev,role,low_threshold,high_threshold)
    base=df.iloc[np.concatenate([train,calib])]
    metadata={'batters':{},'bowlers':{}}
    for r in base.itertuples(index=False):
        metadata['batters'][str(r.batterId)]={'handed':int(r.rightHandedBat)}
        metadata['bowlers'][str(r.bowlerId)]={'armed':int(r.rightArmedBowl),'style':str(r.bowlingStyle)}
    metrics.update(train_rows=len(train),calibration_rows=len(calib),test_rows=len(test),
        train_matches=len(np.unique(groups[train])),calibration_matches=len(np.unique(groups[calib])),
        test_matches=len(np.unique(groups[test])),excluded_replay_match=str(a.exclude_match),
        pressure_is_proxy=True,trust_score_is_heuristic=True)
    config={'profile_shrink_k':30,'pressure_shrink_k':20,'pressure_delta_min_n':12,
            'ema_alpha':0.18,'pressure_multiplier':0.4,'trust_logistic_slope':0.65}
    bundle={'models':models,'features':FEATURES,'metadata':metadata,'metrics':metrics,
            'profiles':profiles,'scales':scales,'intervals':intervals,'thresholds':thresholds,
            'version':'cricket-context-eb-conformal-v3','config':config}
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    joblib.dump(bundle,out/'cricket_model.joblib',compress=3)
    (out/'metrics.json').write_text(json.dumps(metrics,indent=2),encoding='utf-8')
    print('Saved:',out/'cricket_model.joblib')
    print(json.dumps(metrics,indent=2))
    print('Profiles:',len(profiles['batter']),'batters,',len(profiles['bowler']),'bowlers')
    print('Calibrated residual scales:',scales,'90% run intervals:',intervals,'pressure cutoffs:',thresholds)
if __name__=='__main__':main()
