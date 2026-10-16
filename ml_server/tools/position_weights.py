"""Usage: python tools/position_weights.py stats.pkl app/football/config/position_weights.json
Builds omega_p(k,o) (data x expert multipliers X) and job profiles pi_p - see docs/trust_formula.md section 8."""
import pickle, math, json, sys
minutes, cnt, succ, cons = pickle.load(open(sys.argv[1],'rb'))
G=['GK','CB','FB','DM','CM','AM','W','CF']
FAM={'PA passer':'Passing','CR crosser':'Passing','IT first touch (retained)':'Retention',
     'TC carry/touch (retained)':'Retention','BC carry/touch (retained)':'Retention',
     'CH dribbler':'Dribbling','CH challenge/duel':'Duels','PA defender (pass defended)':'Defending',
     'CL clearer (retained)':'Defending','SH blocker':'Defending','REC (ball recovery)':'Recovery',
     'SH shooter (goal)':'Shooting','SH keeper (no goal)':'Goalkeeping'}
SUCCESS_ONLY={'REC (ball recovery)','PA defender (pass defended)','SH blocker','IT first touch (retained)'}
NO_V={'SH shooter (goal)','SH keeper (no goal)','SH blocker','IT first touch (retained)'}
alpha,beta,xi,eps,n0=0.5,0.5,0.5,0.02,200
# expert multipliers X[key][pos] = (success, fail)
X={
 'REC (ball recovery)':        {'DM':1.5,'CM':1.4,'FB':1.1,'CB':1.1,'AM':1.0,'W':0.8,'CF':0.7,'GK':0.6},
 'PA passer':                  {'DM':1.4,'CM':1.4,'AM':1.2,'CB':1.1,'FB':1.0,'W':0.9,'CF':0.8,'GK':1.0},
 'SH shooter (goal)':          {'CF':(1.2,1.6),'W':(1.1,1.4),'AM':(1.1,1.3),'CM':(1.0,1.0),'DM':(1.0,0.8),'FB':(1.0,0.7),'CB':(1.0,0.6)},
 'CH dribbler':                {'W':1.5,'AM':1.3,'CM':1.3,'FB':1.1,'CF':1.1,'DM':1.0,'CB':0.7},
 'CH challenge/duel':          {'CB':(1.0,1.4),'DM':(1.0,1.3),'FB':(1.0,1.2),'CM':(1.0,1.1)},
 'CL clearer (retained)':      {'CB':(1.0,1.3),'GK':(1.0,1.2),'FB':(1.0,1.1)},
 'CR crosser':                 {'FB':1.3,'W':1.3,'AM':1.1},
 'SH keeper (no goal)':        {'GK':1.5},
 'PA defender (pass defended)':{'DM':1.3,'CB':1.2,'CM':1.1,'FB':1.1},
}
def xmult(k,g,o):
    v=X.get(k,{}).get(g,1.0)
    if isinstance(v,tuple): return v[0] if o==1 else v[1]
    return v
keys=list(FAM)
grp_tot={g:sum(cnt.get((g,k),0) for k in keys) for g in G}; all_tot=sum(grp_tot.values())
key_tot={k:sum(cnt.get((g,k),0) for g in G) for k in keys}
def c(g,k,o): return cons.get((g,k,o),[0,0,0])
def pooled(k,o,j):
    n=sum(c(g,k,o)[0] for g in G); return sum(c(g,k,o)[j] for g in G)/n if n else 0
def shrunk(g,k,o,j):
    n=c(g,k,o)[0]; return (c(g,k,o)[j]+n0*pooled(k,o,j))/(n+n0)
def V(g,k,o):
    if k in NO_V: return 1.0
    if k in SUCCESS_ONLY:   # value of the success = own-shot rate after it
        return ((eps+shrunk(g,k,1,1))/(eps+pooled(k,1,1)))**beta
    if o==1:
        Gp=shrunk(g,k,1,1)-shrunk(g,k,0,1); Gb=pooled(k,1,1)-pooled(k,0,1)
        return ((eps+max(Gp,0))/(eps+max(Gb,0)))**beta
    Kp=shrunk(g,k,0,2)-shrunk(g,k,1,2); Kb=pooled(k,0,2)-pooled(k,1,2)
    return ((eps+max(Kp,0))/(eps+max(Kb,0)))**beta
def R(g,k):
    lift=(cnt.get((g,k),0)/grp_tot[g])/(key_tot[k]/all_tot)
    return max(lift,0.05)**alpha
rate90={g:grp_tot[g]/minutes[g]*90 for g in G}
nbar=sum(grp_tot.values())/sum(minutes.values())*90
out={}
for mode in ('data','data+expert'):
    W={}
    for g in G:
        raw={}
        for k in keys:
            for o in (1,0):
                if k in SUCCESS_ONLY and o==0: continue
                raw[(k,o)]=R(g,k)*V(g,k,o)*(xmult(k,g,o) if mode!='data' else 1.0)
        # mean weight over this position's observed actions = 1
        num=sum(raw[(k,o)]*(c(g,k,o)[0] if c(g,k,o)[0] else 0) for (k,o) in raw)
        den=sum(c(g,k,o)[0] for (k,o) in raw)
        N=(den/num)*(nbar/rate90[g])**xi
        W[g]={f'{k}|{"S" if o else "F"}':round(min(max(N*v,0.25),4.0),2) for (k,o),v in raw.items()}
        W[g]['_N']=round(N,3)
    out[mode]=W
# family job profile from weighted evidence share (data+expert)
prof={}
for g in G:
    fam={}
    for k in keys:
        for o in (1,0):
            key=f'{k}|{"S" if o else "F"}'
            if key in out['data+expert'][g]:
                fam[FAM[k]]=fam.get(FAM[k],0)+c(g,k,o)[0]*out['data+expert'][g][key]
    s=sum(fam.values()); prof[g]={f:round(v/s,3) for f,v in fam.items() if v/s>=0.005}
json.dump({'weights':out,'profile':prof,'rate90':rate90,'nbar':nbar},open(sys.argv[2],'w'),indent=1)
print('rate90',{g:round(v,1) for g,v in rate90.items()},'nbar',round(nbar,1))
for mode in out:
    print('\n',mode)
    ks=[k for k in out[mode]['CB'] if not k.startswith('_')]
    print(f"{'key':40s}"+''.join(f'{g:>6s}' for g in G))
    for k in ks: print(f'{k:40s}'+''.join(f"{out[mode][g].get(k,float('nan')):6.2f}" for g in G))
print('\nPROFILE')
fams=['Passing','Retention','Dribbling','Duels','Defending','Recovery','Shooting','Goalkeeping']
print(f"{'':6s}"+''.join(f'{f[:9]:>10s}' for f in fams))
for g in G: print(f'{g:6s}'+''.join(f"{prof[g].get(f,0):10.3f}" for f in fams))
