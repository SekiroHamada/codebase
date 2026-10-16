# Football Trust Score: Baseline Formula (v0.2, with positional logic)

**Data:** PFF FC, FIFA Men's World Cup 2022 (64 matches).
**Code home:** implemented in `ml_server/app/football/` (entry point `trust.py` → `compute_trust_scores(event, state)`). Fitted values and implementation notes are in §12.
**Position tables** in §8 are generated from the data by `ml_server/tools/position_stats.py` and `position_weights.py`; re-run them after changing any expert multiplier.

---

## 0. What the number means

$T_i(t)\in[0,100]$ is the probability (in %) that player $i$ is, **right now and under this moment's pressure**, performing within his normal range **for the job his position demands**. It conditions on everything observed so far: his previous World Cup matches plus this match up to time $t$.

- $T\ge75$: good · $50$ to $75$: warning · $T<40$: choking (same as the frontend `CHOKE_THRESHOLD = 40`)
- `chokeProbability` $=1-T/100$

### Master formula

$$
T_i(t)=100\,\Phi\!\left(\frac{\boldsymbol\pi_{p}^{\top}\big(\hat{\mathbf x}_i(t)-\hat{\boldsymbol\theta}_i\big)+\hat\beta_i(t)\,\Psi_i(t)+\Delta_p}{\sqrt{\mathbf h_t^{\top}\,\mathbf P_i(t)\,\mathbf h_t}}\right),
\qquad
\mathbf h_t=\begin{pmatrix}\boldsymbol\pi_p\\ \Psi_i(t)\end{pmatrix},\qquad p=p(i,t)
$$

| Symbol | Meaning | Section | Mathematics |
|---|---|---|---|
| $\hat{\mathbf x}_i(t)$ | current form in each **skill family** (passing, dribbling, shooting, …) | §6 | multivariate state-space model, Kalman filter |
| $\hat{\boldsymbol\theta}_i$ | the player's normal level in each skill family | §4 | hierarchical / empirical Bayes |
| $\boldsymbol\pi_p$ | the **job profile** of position $p$: how much each skill family matters | §8.2 | information weighting |
| $\hat\beta_i(t)$ | pressure sensitivity (negative = gets worse under pressure) | §5, §6 | causal inference (Double ML), Bayesian updating |
| $\Psi_i(t)$ | psychological pressure of the moment, 0 to 1 | §3 | decision theory, Skellam, Markov chains, psychophysics |
| $\mathbf P_i(t)$ | posterior covariance = epistemic uncertainty | §6 | Kalman filter |
| $\Delta_p$ | tolerance (how far below normal is still "normal"), calibrated per position | §7, §8.8 | probabilistic calibration |

Position enters in **seven** places (§8):
1. which skill families make up the job ($\boldsymbol\pi_p$)
2. how much each action and outcome moves the form estimate ($\omega_p$)
3. what is "expected" for that position (difficulty model)
4. what counts as success
5. grade-vs-outcome mix
6. which areas of the pitch carry consequence
7. per-position priors and calibration

With a single skill family and every position hook neutral, the formula reduces to the scalar baseline of v0.1.

```
PFF event ─► roles → players ─► r  (§2: position-aware, difficulty-adjusted residual)
          └─► Ψ  (§3: match stakes × in-game leverage × position-aware consequence)
priors θ, φ, β per skill family (§4–5: form history, experience, starter/sub)
          ─► Kalman update of the family-form vector with weight ω_p (§6)
          ─► T = job-profile-weighted form vs normal (§7), uncertainty, attributions
```

---

## 1. Notation

- $i$: player · $e$: event · $m$: match on date $d_m$ · $t$: match clock in minutes (`gameClock / 60`, continuous through extra time).
- **Position group** $p(i,t)$ is taken from the event snapshot `homePlayers[] / awayPlayers[].positionGroupType` **at that moment**:

| Group | PFF codes | Minutes coded (tournament) |
|---|---|---|
| GK | GK | 12,118 |
| CB | LCB, RCB | 27,680 |
| FB | LB, RB | 23,200 |
| DM | DM | 2,039 (PFF rarely codes DM; estimates shrink to the pooled value) |
| CM | CM | 26,711 |
| AM | AM | 5,112 |
| W | LW, RW | 20,898 |
| CF | CF | 15,556 |

- **Action key** $k=(a,\rho)$: action type `possessionEventType` plus the player's **role** in it. One event can update several players (passer and receiver, shooter and keeper, both duellers):

| Action key $k$ | Player field | Grade field | Skill family $f(k)$ |
|---|---|---|---|
| pass (passer) | `passerPlayerId` | `passerGrade` | Passing |
| cross (crosser) | `crosserPlayerId` | `crosserGrade` | Passing |
| receive (receiver / target) | `receiverPlayerId` / `targetPlayerId` | `receiverGrade` / `targetGrade` | Retention |
| touch, ball carry (TC, BC) | `ballCarrierPlayerId` | `touchGrade` / `ballCarrierGrade` | Retention |
| dribble | `dribblerPlayerId` | `dribblerGrade` | Dribbling |
| challenge / duel | `challengerPlayerId`, `homeDuelPlayerId`, `awayDuelPlayerId` | `challengerGrade`, `homeDuelGrade`, `awayDuelGrade` | Duels |
| pass defended / interception | `defenderPlayerId` on PA / CR | `defenderGrade` | Defending |
| clearance | `clearerPlayerId` | `clearerGrade` | Defending |
| shot block | `blockerPlayerId` | `blockerGrade` | Defending |
| **ball recovery** (derived, §2.1) | `gameEvents.playerId` | — | Recovery |
| shot | `shooterPlayerId` | `shooterGrade` | Shooting |
| shot faced | `keeperPlayerId` | `keeperGrade` | Goalkeeping |

- **Skill families** $\mathcal F=\{\text{Passing},\text{Retention},\text{Dribbling},\text{Duels},\text{Defending},\text{Recovery},\text{Shooting},\text{Goalkeeping}\}$, with $F=8$.

---

## 2. Execution residual $r$: "how well, compared with how hard, for this position"

*Psychometrics (item response theory), generalised linear models, information theory.*

### 2.1 Success indicator $o_e\in\{0,1\}$

PFF letter codes are undocumented in the dataset. ✓ marks definitions confirmed from the data.

| Action key | $o=1$ when | Evidence |
|---|---|---|
| pass (passer) | `passOutcomeType == 'C'` | ✓ 11,630 `C` vs 11,542 events with a receiver |
| cross | `receiverPlayerId` is not null (reached a teammate) | ✓ field meaning |
| receive | `missedTouchType` is null | 173 events carry a missed touch |
| touch / carry / clearance | the team still has the ball at the next possession event | ✓ derived; `ballCarryOutcome` `R`/`L` likely retained/lost |
| dribble, challenge, duel | `challengeWinnerPlayerId == player` | ✓ |
| pass defended, shot block | always a success (the event exists because he did it) | ✓ |
| **ball recovery** | always a success | ✓ derived (below) |
| shot | `shotOutcomeType == 'G'` (on-target `S` to verify) | ✓ `G` = ball in net |
| shot faced (keeper) | `shotOutcomeType != 'G'` | ✓ |

**Ball recovery (derived).** An open-play event (`setpieceType == 'O'`) of type IT, CH, RE or CL is a recovery for `gameEvents.playerId` when the acting team differs from the team of the previous possession event. This yields 4.0 (CF) to 10.3 (CB) recoveries per 90, and 7.8 for goalkeepers (collecting loose balls).

Recoveries have no failure counterpart, so they enter as a **count residual**. Every 10 on-pitch minutes,

$$
r=\frac{n-\mu}{\sqrt\mu},\qquad \mu=\hat\lambda_i\cdot\frac{10}{90},\qquad
\hat\lambda_i=\frac{\kappa\lambda_p+N_i}{\kappa+M_i/90},\quad \kappa=3
$$

Here $\hat\lambda_i$ is the Gamma–Poisson posterior mean of the **player's own** recoveries per 90 (prior = his position's rate $\lambda_p$, worth 3 matches; $N_i$, $M_i$ = his earlier recoveries and minutes). A forward who never presses is therefore not penalised for his normal work-rate.

**Position-specific success refinements** (optional; off in the baseline):

- **CF / W / AM receiving:** success = the team still has the ball 5 s after his first touch (hold-up play).
- **CB / DM passing:** success = completed **and** no opponent shot within 15 s (no "hospital pass").

### 2.2 Expected success: position-aware difficulty model

$$
\hat p_e=\sigma\!\left(\mathbf w_{k}^{\top}\mathbf X_e+\mathbf u_{k,p}^{\top}\mathbf X^{\text{core}}_e\right),\qquad \mathbf u_{k,p}\sim\mathcal N(\mathbf 0,\tau_u^2\mathbf I)
$$

This is a hierarchical logistic regression, i.e. an item-response model. The shared coefficients $\mathbf w_k$ are learned from all positions. The position deviations $\mathbf u_{k,p}$ (on a few core features: distance to goal, pressure type, nearest-opponent distance) are ridge-shrunk towards zero. The effect: **a centre-back's failed dribble is judged against centre-back dribbles, a striker's pass against striker passes.** Fit with 5-fold cross-fitting, splitting folds by match.

$\mathbf X_e$ contains **physical and technical difficulty only**:

- **Geometry:** distance and angle to goal (`teamAttackingDirection`); pass length and angle; ball height (`ballHeightType`, `initialHeightType`); body part (`bodyType`).
- **Opponent pressure on the ball:** `pressureType` / `initialPressureType` (N/P/L/A); nearest-opponent distance; crowding kernel $K_e=\sum_{j\in\text{opp}}\exp\!\left(-\lVert\mathbf u_j-\mathbf u_e\rVert^2/2s^2\right)$ with $s=2.5$ m.
- **Shots and shots faced:** number of outfield opponents inside the shooting triangle (ball, left post, right post). A point is inside when all its barycentric coordinates are $\ge0$. Also deflection (`deflectorPlayerId`), shot type, set piece.
- **Kinematics:** `speed`. **Fatigue (confounder):** minutes on the pitch, and high-speed distance ($v>5.5$ m/s) in the last 10 minutes, from tracking.

**Excluded on purpose:** score, clock, match stage, starter/sub, experience. These are the psychological treatment. Controlling for them would erase the effect we want to measure (a "bad control").

### 2.3 Outcome residual (Pearson)

$$
z^{o}_e=\frac{o_e-\hat p_e}{\sqrt{\hat p_e(1-\hat p_e)}},\qquad \hat p_e\leftarrow\operatorname{clip}(\hat p_e,0.03,0.97),\quad z^{o}_e\leftarrow\operatorname{clip}(z^{o}_e,-4,4)
$$

Failing an easy action produces a large negative residual; failing a hard one a small one. The residual is monotone in the surprisal $-\log\Pr(o_e)$, so a missed open goal hurts far more than a missed 30-yard shot.

### 2.4 Grade residual

$$
z^{g}_e=\frac{g_e-\bar g_{k,p}}{s_{k,p}}
$$

Standardised per action key **and position**. PFF grades lie in $\{-1.5,\dots,+1.5\}$, and 84% are $0$.

### 2.5 Combined residual: position-specific mix $a_p(k)$

$$
r_e=\frac{a_p(k)\,z^{g}_e+\big(1-a_p(k)\big)\,z^{o}_e}{\sqrt{a_p^2+(1-a_p)^2+2a_p(1-a_p)\varrho_{k,p}}}
$$

Here $\varrho_{k,p}$ is the empirical correlation of the two residuals; the denominator keeps $\operatorname{Var}(r)=1$.

| $a_p(k)$ default | Value | Why |
|---|---|---|
| passes by DM, CM, AM | **0.7** | the passer grade matters more for midfielders |
| shots by CF, W, AM | **0.4** | for attackers the outcome against chance quality is what matters |
| everything else | 0.5 | |
| no success definition / no grade | 1 / 0 | |

**Data-driven alternative.** Choose $a_p(k)$ to maximise the split-half reliability of player form (classical test theory):

$$
a_p^*(k)=\arg\max_a\ \frac{2\,\rho_{1/2}(a)}{1+\rho_{1/2}(a)}
$$

$\rho_{1/2}(a)$ is the correlation between a player's mean $r$ on odd and on even events of the same match (Spearman–Brown corrected). It picks the mix that measures *stable* form best for that position.

---

## 3. Psychological pressure $\Psi$

*Decision theory, probability (Poisson, Skellam, Markov chains), psychophysics.*

$$
\Pi_e=S_{\text{match}}\cdot L(t)\cdot C_{e,p},\qquad \Psi_e=\frac{\Pi_e}{\Pi_e+\Pi_{1/2}}\in[0,1)
$$

The saturating (Hill) form has $\Pi_{1/2}$ = the tournament median of $\Pi$, so $\Psi=0.5$ at a median moment.

### 3.1 Match stakes $S_{\text{match}}$

**Utility of each finishing position** (an assumption you can tweak):

| Finish | Champion | Runner-up | 3rd | 4th | QF exit | R16 exit | Group exit |
|---|---|---|---|---|---|---|---|
| $U$ | 1.00 | 0.35 | 0.20 | 0.12 | 0.06 | 0.03 | 0 |

$$
s=\mathbb E[U\mid\text{win}]-\mathbb E[U\mid\text{lose}],\qquad
S_{\text{match}}=\max\!\left(\left(\frac{s}{s_{\text{final}}}\right)^{\gamma},S_{\min}\right),\quad \gamma=0.5\ (\text{Stevens power law}),\quad S_{\min}=0.15
$$

Future knockout games are treated as 50/50.

| Match type | `metadata.week` | $s$ | $S_{\text{match}}$ |
|---|---|---|---|
| Final | 8 | 0.650 | **1.00** |
| Semi-final | 6 | 0.515 | **0.89** |
| Quarter-final | 5 | 0.358 | **0.74** |
| Round of 16 | 4 | 0.209 | **0.57** |
| Group: this game decides qualification ($\Delta Q=1$) | 1–3 | 0.134 | **0.45** |
| Third-place match | 7 | 0.080 | **0.35** |
| Group, $\Delta Q=0.6$ | 1–3 | 0.081 | **0.35** |
| Group, $\Delta Q=0.4$ (typical matchday 1) | 1–3 | 0.054 | **0.29** |
| Group dead rubber | 1–3 | 0 | **0.15** (floor) |

**Group stage** ("important match to stay in the group"): $s=\Delta Q\cdot\mathbb E[U\mid\text{reach R16}]$ with $\mathbb E[U\mid\text{reach R16}]=0.134$ and $\Delta Q=\Pr(q\mid W)-\Pr(q\mid L)$.

$\Delta Q$ is computed before kick-off by Monte Carlo ($10^4$ simulations) of the group's remaining fixtures, including the simultaneous other game on matchday 3. Goals per team are $\text{Poisson}(1.345)$ (WC 2022: 172 goals in 64 games), and the FIFA tiebreakers are applied: points → goal difference → goals scored → coin flip. Groups are the connected components of the week 1–3 fixture graph.

### 3.2 In-game leverage $L(t)$

Remaining goals are $G_A\sim\text{Pois}(\lambda m)$ and $G_B\sim\text{Pois}(\lambda m)$, with $\lambda=1.345/90$ per minute and $m$ = minutes left (to 90, or to 120 in extra time). Their difference is Skellam distributed:

$$
\Pr(G_A-G_B=k)=e^{-(\mu_A+\mu_B)}\left(\frac{\mu_A}{\mu_B}\right)^{k/2}I_{\lvert k\rvert}\!\left(2\sqrt{\mu_A\mu_B}\right)
$$

The match value to the player's team at score difference $d$ is

$$
V(d,m)=\Pr(D>0)+v_D\Pr(D=0),\qquad D=d+G_A-G_B
$$

- **Knockout:** $v_D=0.5$ (a draw goes to extra time / penalties).
- **Group:** $v_D=\dfrac{\Pr(q\mid D)-\Pr(q\mid L)}{\Pr(q\mid W)-\Pr(q\mid L)}$.

The leverage index is the one-goal swing, normalised to 1 at kick-off:

$$
L(t)=\min\!\left(\frac{\tfrac12\left[V(d+1,m)-V(d-1,m)\right]}{\bar L},\;3\right),\qquad \bar L=0.231
$$

Knockout game between equal teams:

| Score \ minute | 0′ | 30′ | 60′ | 75′ | 85′ | 89′ |
|---|---|---|---|---|---|---|
| level | 1.00 | 1.19 | 1.51 | 1.77 | 2.02 | 2.13 |
| ±1 | 0.84 | 0.92 | 1.02 | 1.06 | 1.08 | 1.08 |
| ±2 | 0.50 | 0.45 | 0.32 | 0.20 | 0.08 | 0.02 |

**Live score:** count a goal when `shotOutcomeType == 'G'` **and** a kick-off (`setpieceType == 'K'`) or the game end follows. This removes disallowed goals: the raw count is 196, the filtered count 173, against the official 172. The remaining one-goal gap (probably an own goal) needs a manual check.

### 3.3 Penalty shootout: Markov chain

**Shootout kicks** are `setpieceType == 'P'` shots after `gameEventType == 'END'` with `endType == 'G'`; this rule finds all 26 shootout goals of 2022. The state $(a,b,k_A,k_B)$ is solved by backward induction with conversion $\pi=0.76$; sudden death between equal teams is 0.5.

$$
L_{\text{kick}}=\min\!\left(\frac{\Pr(\text{win}\mid\text{score})-\Pr(\text{win}\mid\text{miss})}{\bar L},3\right)
$$

| Kick | 1st kick | 5th, can win it (4–3) | 5th at 3–3 / must score | sudden death |
|---|---|---|---|---|
| $L$ | 1.22 | 1.65 | 2.16 | 2.16 |

The keeper facing each kick gets the same $L$.

### 3.4 Action consequence: position-aware

$$
C_{e,p}=1+\eta^{\text{own}}_p\,e^{-\delta^{\text{own}}_e/\ell}+\eta^{\text{opp}}_p\,e^{-\delta^{\text{opp}}_e/\ell},\qquad \ell=18\ \text{m}
$$

$\delta^{\text{own}}, \delta^{\text{opp}}$ are the distances (m) to the player's own goal and to the opponent goal.

| | GK | CB | FB | DM | CM | AM | W | CF |
|---|---|---|---|---|---|---|---|---|
| $\eta^{\text{own}}_p$ (pressure near own goal) | 1.5 | 1.5 | 1.2 | 1.2 | 0.9 | 0.5 | 0.4 | 0.3 |
| $\eta^{\text{opp}}_p$ (pressure near opponent goal) | 0 | 0.3 | 0.6 | 0.6 | 0.9 | 1.2 | 1.3 | 1.5 |

A centre-back in his own box and a striker in the opponent's box both feel about 2.5× pressure. A striker tracking back into his own box feels less, because that is not his job.

### 3.5 What is and isn't in $\Psi$

Opponent pressure on the ball is physical difficulty and belongs in $\mathbf X$ (§2.2). $\Psi$ is purely what is at stake. Keeping these apart is what makes $\beta$ causal.

---

## 4. Pre-match prior: normal level and form history, per skill family

*Hierarchical Bayes, empirical Bayes shrinkage, exponential smoothing.*

For each previous WC match $m$ and family $f$, take the weighted, pressure-neutral mean residual:

$$
\bar r_{imf}=\frac{\sum_{e\in f}\omega_e\,(r_e-\hat\beta_i\Psi_e)}{\sum_{e\in f}\omega_e},\qquad
n_{imf}=\frac{\left(\sum\omega_e\right)^2}{\sum\omega_e^2},\qquad
\pi_{imf}=\left(\frac{\sigma^2}{n_{imf}}+\nu^2\right)^{-1}
$$

$n_{imf}$ is the Kish effective sample size; $\sigma^2=1$.

**Two-level normal level.** The general level pools all families; each family deviates from it:

$$
\hat\theta_i=\frac{\tau_\theta^{-2}\mu_{\theta,p}+\sum_{m,f}\pi_{imf}\bar r_{imf}}{\tau_\theta^{-2}+\sum_{m,f}\pi_{imf}},\qquad
\hat\theta_{i,f}=\hat\theta_i+\frac{\sum_m\pi_{imf}\,(\bar r_{imf}-\hat\theta_i)}{\tau_s^{-2}+\sum_m\pi_{imf}}
$$

**Form history** (exponentially decayed deviation from normal, per family):

$$
\hat\varphi_{i,f}=\frac{\sum_m w_m\,\pi_{imf}\,(\bar r_{imf}-\hat\theta_{i,f})}{\kappa_\varphi+\sum_m w_m\,\pi_{imf}},\qquad
V_{\varphi,f}=\left(\kappa_\varphi+\sum_m w_m\,\pi_{imf}\right)^{-1},\qquad
w_m=2^{-(d_{\text{now}}-d_m)/h}
$$

This is two-timescale smoothing (the same idea as a MACD indicator). It lets form history differ by skill: a striker can be in poor shooting form but good passing form. Because his job profile weights shooting more (§8.2), his trust at kick-off reflects the shooting slump more.

- **No history:** $\hat\theta_{i,f}=\mu_{\theta,p}=0$ (residuals are position-centred by construction), $\hat\varphi=0$.
- **Defaults:** $\tau_\theta=0.20$, $\tau_s=0.10$, $\nu=0.15$, $\kappa_\varphi=100$, $h=7$ days. Fit by REML / method of moments.

---

## 5. Experience $E$ and pressure sensitivity $\beta$

*Causal inference (Double Machine Learning), conjugate Bayesian regression.*

### 5.1 Experience index

$$
E_i=\sigma\!\left(a_1\frac{\text{age}_i-27}{4}+a_2\ln\!\left(1+\frac{M_i}{90}\right)+a_3\ln\!\left(1+\frac{K_i}{90}\right)-c\right)
$$

- **age:** `metadata.date` minus `players.csv` `dob`.
- $M_i$: WC minutes before this match; $K_i$: knockout minutes before this match.
- $c$ centres the median player at $E\approx0.5$.
- **Defaults:** $a_1=0.5$, $a_2=0.6$, $a_3=0.8$. Add $+a_4\ln(1+\text{caps}/20)$ if caps are added later.

### 5.2 Prior for pressure sensitivity (position-specific)

$$
\beta_i\sim\mathcal N\!\left(\mu_{\beta,p}+\rho_E(E_i-\bar E)+\rho_{\text{sub}}\mathbb 1[\text{sub}],\ \tau_{\beta,p}^2\right)
$$

**Defaults:** $\mu_{\beta,p}=0$, $\tau_{\beta,p}=0.15$, $\rho_E=+0.10$ (an assumption until estimated), $\rho_{\text{sub}}=0$.

### 5.3 Population estimation with Double ML

The model is partially linear with a heterogeneous effect:

$$
r_e=\beta(\mathbf Z_e)\Psi_e+g(\mathbf X_e)+\varepsilon_e,\qquad \mathbf Z_e=(p,\ E_i,\ \mathbb 1[\text{sub}])
$$

1. **Cross-fit** gradient-boosted nuisance models ($K=5$, folds by match): $\tilde r=r-\hat\ell(\mathbf X)$, $\tilde\Psi=\Psi-\hat m(\mathbf X)$.
2. **Regress** $\tilde r$ on $\tilde\Psi\cdot[1,\ \text{position dummies},\ E,\ \mathbb 1[\text{sub}]]$. This gives $\mu_{\beta,p}$ **per position**, plus $\rho_E$ and $\rho_{\text{sub}}$, with match-clustered, Neyman-orthogonal standard errors.

This tests whether, for example, strikers choke more than centre-backs, based on evidence rather than assumption.

### 5.4 Player-level $\beta$ from his history

The update uses within-match centred data, so day-to-day form does not leak into the slope:

$$
\hat\beta_i=\frac{\tau_{\beta,p}^{-2}\beta_{0,i}+\sum_e\omega_e(\Psi_e-\bar\Psi_{im})(r_e-\bar r_{im})}{\tau_{\beta,p}^{-2}+\sum_e\omega_e(\Psi_e-\bar\Psi_{im})^2},\qquad
V_\beta=\left(\tau_{\beta,p}^{-2}+\sum_e\omega_e(\Psi_e-\bar\Psi_{im})^2\right)^{-1}
$$

Compute $\hat\beta_i$ first, then §4.

---

## 6. In-match form: multivariate Kalman filter

*State-space models, factor models, optimal filtering, robust statistics.*

The state is $\mathbf s=(x_{\text{Pass}},x_{\text{Ret}},x_{\text{Drib}},x_{\text{Duel}},x_{\text{Def}},x_{\text{Rec}},x_{\text{Shot}},x_{\text{GK}},\ \beta)^{\top}\in\mathbb R^{F+1}$.

The skill families share a **general-form factor**: a player who is "off" today tends to be off at everything. The family covariance therefore has factor structure, $\boldsymbol\Sigma=\nu_g^2\mathbf 1\mathbf 1^{\top}+\nu_d^2\mathbf I$. One bad pass slightly lowers the estimate of his shooting form too, through the shared factor, but mostly his passing form.

### 6.1 Entry (kick-off for starters, the `SUB` time for substitutes)

$$
\mathbf s_0=\begin{pmatrix}\hat{\boldsymbol\theta}_i+\hat{\boldsymbol\varphi}_i+\delta_{\text{sub}}\mathbb 1[\text{sub}]\,\mathbf 1\\ \hat\beta_i\end{pmatrix},
\qquad
\mathbf P_0=\begin{pmatrix}\big(\nu_g^2+\sigma^2_{\text{cold}}\mathbb 1[\text{sub}]\big)\mathbf 1\mathbf 1^{\top}+\nu_d^2\mathbf I+\operatorname{diag}(\mathbf V_\varphi) & \mathbf 0\\ \mathbf 0^{\top} & V_\beta\end{pmatrix}
$$

- **Defaults:** $\nu_g=0.12$, $\nu_d=0.10$, $\delta_{\text{sub}}=0$, $\sigma^2_{\text{cold}}=0.02$.
- `OFF`/`ON` pairs (temporary exits) don't reset the state.
- **A position change mid-match also doesn't reset it:** the skill-family state belongs to the player; only $\boldsymbol\pi_p$, $\omega_p$ and $\Delta_p$ switch.

### 6.2 Predict, before each of the player's events

$$
\mathbf P^-=\mathbf P+\Delta t\begin{pmatrix}g(t)\left(q_g\mathbf 1\mathbf 1^{\top}+q_d\mathbf I\right)&\mathbf 0\\ \mathbf 0^{\top}&q_\beta\end{pmatrix},\qquad
g(t)=1+\zeta\,e^{-(t-t_{\text{on}})/\tau_w},\quad \tau_w=\tau_{w0}(1-0.5E_i)
$$

**Defaults:** $q_g=0.0007$ and $q_d=0.0003$ per min, $q_\beta=10^{-5}$ per min, $\zeta=1$ for subs and $0$ for starters, $\tau_{w0}=10$ min.

### 6.3 Update, on each event where the player has a role

$$
\mathbf h_e=\mathbf e_{f(k)}+\Psi_e\,\mathbf e_{\beta},\qquad
R_e=\frac{\sigma^2}{\omega_p(k,o_e)},\qquad
S_e=\mathbf h_e^{\top}\mathbf P^-\mathbf h_e+R_e,\qquad
\mathbf K_e=\frac{\mathbf P^-\mathbf h_e}{S_e}
$$

$$
\mathbf s\leftarrow\mathbf s^-+\mathbf K_e\big(r_e-\mathbf h_e^{\top}\mathbf s^-\big),\qquad
\mathbf P\leftarrow(\mathbf I-\mathbf K_e\mathbf h_e^{\top})\mathbf P^-(\mathbf I-\mathbf K_e\mathbf h_e^{\top})^{\top}+\mathbf K_eR_e\mathbf K_e^{\top}
$$

- $\mathbf e_{f(k)}$ is the unit vector of the action's skill family; $\mathbf e_\beta$ the unit vector of the $\beta$ component.
- $\omega_p(k,o)$ is the **position-specific precision weight** (§8.3): how strongly this action, with this outcome, should move this position's form.
- **Huber robustness:** with $z=(r_e-\mathbf h_e^{\top}\mathbf s^-)/\sqrt{S_e}$, if $\lvert z\rvert>3$ set $R_e\leftarrow R_e(\lvert z\rvert/3)^2$.
- The observation is $r=x_f+\beta\Psi+\varepsilon$, so failures concentrated in high-pressure moments push $\beta$ negative. That is the live choke detector.

---

## 7. Output: score, uncertainty, explanation

$$
\mu_i(t)=\boldsymbol\pi_p^{\top}\hat{\mathbf x}+\hat\beta\,\Psi_i(t),\qquad
\bar\theta_i=\boldsymbol\pi_p^{\top}\hat{\boldsymbol\theta}_i,\qquad
\sigma^2_{\text{epi}}=\mathbf h_t^{\top}\mathbf P\,\mathbf h_t,\qquad
T_i(t)=100\,\Phi\!\left(\frac{\mu_i(t)-\bar\theta_i+\Delta_p}{\sigma_{\text{epi}}}\right)
$$

$\Psi_i(t)$ is evaluated for the current moment at the player's snapshot location, so trust reacts to rising pressure before he acts. $\Delta_p$ (default 0.25) is calibrated **per position** (§8.8).

### Server response fields

| Field | Value |
|---|---|
| `trustScore` | $T$ |
| `chokeProbability` | $1-T/100$ |
| `ci95` | next action's residual relative to normal: $(\mu-\bar\theta)\pm1.96\sqrt{\sigma^2_{\text{epi}}+\sigma^2/\bar\omega_p}$, split into epistemic ($\sigma_{\text{epi}}$) and aleatoric ($\sigma/\sqrt{\bar\omega_p}$) parts |
| `attributions` | exact Shapley values (below) |

### Attributions: exact Shapley values, now per skill family

The numerator components are:

- $c_{\text{history}}=\boldsymbol\pi_p^{\top}\hat{\boldsymbol\varphi}$
- $c_f=\pi_{p,f}\,(\hat x_f-\hat\theta_f-\hat\varphi_f-\delta_{\text{sub}}\mathbb 1[\text{sub}])$ for each family with $\pi_{p,f}>0$
- $c_{\text{sub}}=\delta_{\text{sub}}\mathbb 1[\text{sub}]$
- $c_{\text{pressure}}=\hat\beta\Psi$

$$
v(\mathcal S)=100\,\Phi\!\left(\frac{\Delta_p+\sum_{j\in\mathcal S}c_j}{\sigma_{\text{epi}}}\right),\qquad
\phi_j=\sum_{\mathcal S\subseteq N\setminus\{j\}}\frac{\lvert\mathcal S\rvert!\,(\lvert N\rvert-\lvert\mathcal S\rvert-1)!}{\lvert N\rvert!}\Big[v(\mathcal S\cup\{j\})-v(\mathcal S)\Big]
$$

At most 11 components gives $2^{11}=2048$ evaluations, which is exact and takes milliseconds. Example output: *"−24 from shooting form, −6 from pressure sensitivity, +4 from passing form."*

### Behaviour with the defaults (position-aware simulation)

The table below uses the full filter: 8 families, the §8.3 weights, the §8.2 job profiles, $\Psi=0.5$, one action every 2 minutes. It shows $T$ before the sequence and after each action.

| Sequence | CB | DM | CM | W | CF |
|---|---|---|---|---|---|
| 3 missed big chances ($r=-1.5$) | 92 → 90 → 88 → **86** | 92 → 89 → 86 → **83** | 92 → 89 → 85 → **80** | 92 → 82 → 68 → **52** | 92 → 71 → 43 → **21** |
| 4 failed dribbles ($r=-1.5$) | 92 → … → **85** | 92 → … → **79** | 92 → … → **70** | 92 → 80 → 63 → 45 → **29** | 92 → … → **43** |
| 4 bad passes ($r=-2.5$) | 92 → … → **33** | 92 → … → **34** | 92 → … → **30** | 92 → … → **49** | 92 → … → **47** |
| 3 lost duels ($r=-1.5$) | 92 → … → **65** | 92 → … → **71** | 92 → … → **78** | 92 → … → **75** | 92 → … → **69** |
| 4 good recoveries ($r=+1$) | 92 → **97** | 92 → **98** | 92 → **98** | 92 → **97** | 92 → **97** |

Missed shots sink a striker, failed dribbles sink a winger, bad passes punish midfielders and centre-backs most, and lost duels hurt centre-backs most.

Single-family reference values (v0.1): starter at kick-off 91.7; sub on entry 86.2; a starter after 1 / 2 / 3 / 4 very bad actions ($r=-3$) falls to 79 / 61 / 40 / 22.

---

## 8. Positional logic

### 8.1 Position assignment

- **Hard (baseline):** $p(i,t)$ = the snapshot `positionGroupType` at the event, mapped to the 8 groups (§1).
- **Soft (optional, for hybrid roles such as wing-backs or false nines):** a membership vector

$$
m_g(i,t)=(1-\epsilon)\,\mathbb 1[g=p(i,t)]+\epsilon\,\frac{\exp\!\left(-\lVert\bar{\mathbf u}_i-\mathbf c_g\rVert^2/2s_m^2\right)}{\sum_{g'}\exp\!\left(-\lVert\bar{\mathbf u}_i-\mathbf c_{g'}\rVert^2/2s_m^2\right)}
$$

$\bar{\mathbf u}_i$ is the player's mean location over the last 10 minutes relative to his team's centroid (attacking direction normalised); $\mathbf c_g$ is the tournament template location of group $g$. Every position quantity becomes a mixture, e.g. $\omega=\sum_g m_g\omega_g$ and $\boldsymbol\pi=\sum_g m_g\boldsymbol\pi_g$. **Defaults:** $\epsilon=0$ (hard), $s_m=8$ m.

### 8.2 Job profile $\boldsymbol\pi_p$: how form is combined differently per position

The job profile is each skill family's share of the position's **weighted evidence** (Fisher information), flattened by a power $\gamma_\pi$:

$$
\pi_{p,f}=\frac{\left(\sum_{k\in f}\sum_o n_p(k,o)\,\omega_p(k,o)\right)^{\gamma_\pi}}{\sum_{f'}\left(\sum_{k\in f'}\sum_o n_p(k,o)\,\omega_p(k,o)\right)^{\gamma_\pi}},\qquad \gamma_\pi=0.5
$$

- $\gamma_\pi=1$ weights by pure volume (passing dominates every position).
- $\gamma_\pi=0$ gives equal families.
- $0.5$ lets important but rarer actions (shots for strikers, dribbles for wingers) carry real weight.

Families below 0.5% of a position's evidence are set to 0.

| $\pi_{p,f}$ | Passing | Retention | Dribbling | Duels | Defending | Recovery | Shooting | Goalkeeping |
|---|---|---|---|---|---|---|---|---|
| **GK** | 0.288 | 0.245 | 0 | 0 | 0.113 | 0.119 | 0 | **0.234** |
| **CB** | 0.294 | 0.274 | 0 | 0.139 | **0.172** | 0.121 | 0 | 0 |
| **FB** | 0.305 | 0.242 | 0.046 | 0.151 | 0.130 | 0.126 | 0 | 0 |
| **DM** | 0.326 | 0.223 | 0 | 0.161 | 0.147 | **0.143** | 0 | 0 |
| **CM** | **0.330** | 0.231 | 0.041 | 0.130 | 0.106 | 0.130 | 0.032 | 0 |
| **AM** | 0.297 | 0.210 | 0.084 | 0.146 | 0.076 | 0.115 | 0.073 | 0 |
| **W** | 0.263 | 0.226 | **0.127** | 0.138 | 0.069 | 0.096 | 0.082 | 0 |
| **CF** | 0.235 | 0.196 | 0.075 | **0.205** | 0.072 | 0.087 | **0.131** | 0 |

You can override any row directly. The table is just a starting point derived from the data.

### 8.3 Event weight $\omega_p(k,o)$: how outcomes count differently per position

$$
\omega_p(k,o)=\operatorname{clip}\Big(N_p\cdot\underbrace{R_p(k)^{\alpha_R}}_{\text{role relevance}}\cdot\underbrace{V_p(k,o)^{\alpha_V}}_{\text{consequence}}\cdot\underbrace{X_p(k,o)^{\kappa_X}}_{\text{expert prior}},\ 0.25,\ 4\Big)
$$

**Role relevance:** how characteristic the action is of the position (share lift),

$$
R_p(k)=\frac{n_p(k)/n_p}{n(k)/n}
$$

**Consequence:** how much the outcome changes what happens next for this position, measured in the data as the chance of a shot by either team within $W=15$ s:

$$
V_p(k,1)=\frac{\epsilon+\tilde G_p(k)}{\epsilon+\bar G(k)},\qquad
V_p(k,0)=\frac{\epsilon+\tilde K_p(k)}{\epsilon+\bar K(k)}
$$

$$
G=\Pr(\text{own shot}\le W\mid\text{success})-\Pr(\text{own shot}\le W\mid\text{fail}),\qquad
K=\Pr(\text{opp shot}\le W\mid\text{fail})-\Pr(\text{opp shot}\le W\mid\text{success})
$$

- **Success-only actions** (recovery, interception): $V=(\epsilon+\tilde P_p)/(\epsilon+\bar P)$ with $P=\Pr(\text{own shot}\le W\mid k)$.
- **Shots and shots faced:** $V=1$, because the goal itself is the outcome and the residual already measures it against chance quality.
- **Empirical-Bayes shrinkage** for small cells: $\tilde G_p=(n_pG_p+n_0\bar G)/(n_p+n_0)$, $n_0=200$. Smoothing $\epsilon=0.02$.

**Expert prior** $X_p(k,o)$ encodes football knowledge that the 15-second window cannot see (table below). $\kappa_X=1$; set $\kappa_X=0$ for a purely data-driven model.

**Normalisation:**

$$
N_p=\underbrace{\frac{\sum n_p(k,o)}{\sum n_p(k,o)\,R^{\alpha_R}V^{\alpha_V}X^{\kappa_X}}}_{\text{mean weight}=1}\cdot\underbrace{\left(\frac{\bar n}{n_p^{90}}\right)^{\xi}}_{\text{information-rate equalisation}},\qquad \xi=0.5
$$

Actions per 90 are GK 65.6, CB 142.2, FB 122.9, DM 119.3, CM 124.9, AM 93.8, W 89.4, CF 65.2 ($\bar n=108.9$). Strikers and keepers act less often, so with $\xi=0.5$ each of their actions counts about 1.3× more. A striker's trust can then move within a match, rather than taking twice as long as a centre-back's. $\xi=0$ turns this off; $\xi=1$ fully equalises.

**Exponents:** $\alpha_R=\alpha_V=0.5$, a square-root compression: the data tilts the weights without letting one cell dominate.

#### Expert multipliers $X_p(k,o)$ (defaults; edit freely)

A single value applies to both success and failure; "S / F" gives them separately; blank = 1.

| Action | GK | CB | FB | DM | CM | AM | W | CF |
|---|---|---|---|---|---|---|---|---|
| ball recovery | 0.6 | 1.1 | 1.1 | **1.5** | **1.4** | 1.0 | 0.8 | 0.7 |
| pass (passer) | 1.0 | 1.1 | 1.0 | **1.4** | **1.4** | 1.2 | 0.9 | 0.8 |
| shot (S / F) | | 1.0 / 0.6 | 1.0 / 0.7 | 1.0 / 0.8 | 1.0 / 1.0 | 1.1 / **1.3** | 1.1 / **1.4** | 1.2 / **1.6** |
| dribble | | 0.7 | 1.1 | 1.0 | **1.3** | **1.3** | **1.5** | 1.1 |
| challenge / duel (S / F) | | 1.0 / **1.4** | 1.0 / 1.2 | 1.0 / 1.3 | 1.0 / 1.1 | | | |
| clearance (S / F) | 1.0 / 1.2 | 1.0 / 1.3 | 1.0 / 1.1 | | | | | |
| cross | | | 1.3 | | | 1.1 | 1.3 | |
| pass defended / interception | | 1.2 | 1.1 | 1.3 | 1.1 | | | |
| shot faced | 1.5 | | | | | | | |

#### Resulting weights $\omega_p(k,o)$ (data × expert, normalised)

| Action / outcome | GK | CB | FB | DM | CM | AM | W | CF |
|---|---|---|---|---|---|---|---|---|
| pass ✓ | 0.76 | 0.75 | 0.89 | 1.09 | 1.10 | 1.30 | 1.06 | 1.23 |
| pass ✗ | 1.04 | 1.07 | 0.92 | 1.04 | 1.10 | 0.94 | 0.79 | 0.83 |
| cross ✓ | 0.25 | 0.27 | 1.51 | 0.45 | 0.62 | 1.38 | 2.05 | 1.20 |
| cross ✗ | 0.25 | 0.27 | 1.53 | 0.44 | 0.67 | 1.37 | 1.99 | 1.14 |
| receive / first touch | 1.08 | 0.92 | 0.91 | 0.72 | 0.76 | 0.82 | 0.95 | 1.04 |
| touch ✓ | 0.62 | 0.45 | 0.87 | 0.62 | 0.71 | 1.17 | 1.37 | 1.96 |
| touch ✗ | 0.70 | 0.48 | 0.89 | 0.65 | 0.84 | 1.04 | 1.21 | 1.65 |
| ball carry ✓ | 0.40 | 0.57 | 0.83 | 0.70 | 0.83 | 0.99 | 1.51 | 1.35 |
| ball carry ✗ | 0.41 | 0.59 | 0.80 | 0.70 | 0.85 | 1.04 | 1.43 | 1.35 |
| dribble ✓ | 0.25 | 0.25 | 0.92 | 0.52 | 0.79 | 1.65 | **2.70** | 1.81 |
| dribble ✗ | 0.28 | 0.25 | 0.96 | 0.52 | 0.86 | 1.60 | **2.31** | 1.80 |
| duel ✓ | 0.33 | 0.69 | 0.79 | 0.80 | 0.73 | 1.06 | 1.14 | **2.22** |
| duel ✗ | 0.42 | **1.37** | 1.28 | 1.09 | 0.79 | 0.97 | 0.94 | 1.19 |
| interception / pass defended | 0.87 | 1.02 | 1.02 | 1.16 | 0.85 | 0.89 | 0.89 | 1.09 |
| clearance ✓ | 1.02 | 1.18 | 1.05 | 0.62 | 0.55 | 0.62 | 0.63 | 0.96 |
| clearance ✗ | 1.38 | **1.48** | 0.90 | 0.75 | 0.68 | 0.57 | 0.58 | 1.05 |
| shot block | 0.25 | 1.22 | 0.85 | 0.71 | 0.71 | 0.67 | 0.54 | 0.90 |
| **ball recovery** | 0.57 | 0.78 | 0.96 | **1.14** | **1.09** | 1.11 | 0.91 | 0.92 |
| shot ✓ (goal) | 0.25 | 0.50 | 0.64 | 0.67 | 0.66 | 1.33 | 1.56 | **2.74** |
| **shot ✗ (no goal)** | 0.25 | 0.30 | 0.45 | 0.54 | 0.66 | 1.58 | 1.98 | **3.66** |
| shot faced | **4.00** | — | — | — | — | — | — | — |

How to read it: $\omega=2$ means the action moves the form estimate as much as two ordinary actions.

Because the Pearson residual (§2.3) already scales by chance quality, a striker missing a 0.05-xG shot barely moves; missing a 0.5-xG chance moves him a lot, ×3.66. A centre-back's failed dribble is discounted twice over, on purpose: it gets a low weight here, *and* the CB-specific difficulty model (§2.2) already expects CB dribbles to fail more.

### 8.4 What the data says (evidence behind §8.3)

All 64 matches; shot windows are 15 s.

| | GK | CB | FB | DM | CM | AM | W | CF |
|---|---|---|---|---|---|---|---|---|
| actions per 90 | 65.6 | 142.2 | 122.9 | 119.3 | 124.9 | 93.8 | 89.4 | 65.2 |
| pass completion | 0.74 | 0.88 | 0.82 | 0.86 | 0.87 | 0.80 | 0.80 | 0.73 |
| duel win rate | — | 0.54 | 0.47 | 0.42 | 0.43 | 0.38 | 0.33 | 0.33 |
| goals per shot | — | 0.10 | 0.08 | — | 0.08 | 0.13 | 0.15 | 0.20 |
| lift: dribble | 0.02 | 0.13 | 0.86 | 0.51 | 0.71 | 2.07 | **3.28** | 1.90 |
| lift: shot | 0 | 0.32 | 0.46 | 0.84 | 0.76 | 2.10 | 2.27 | **3.89** |
| lift: clearance | 0.85 | **1.63** | 1.17 | 0.99 | 0.61 | 0.48 | 0.48 | 0.72 |
| lift: interception | 0.96 | **1.35** | 1.09 | **1.34** | 0.96 | 0.63 | 0.56 | 0.44 |
| duel won → own-shot gain $G$ | — | +2.7 pp | +2.2 | +4.3 | +3.6 | +7.2 | +5.7 | **+9.9** |
| duel lost → concede-shot cost $K$ | — | **+10.9 pp** | +8.5 | +6.9 | +5.0 | +6.7 | +4.3 | +1.5 |
| pass completed → own-shot gain $G$ | +0.2 pp | +1.4 | +3.2 | +5.3 | +4.0 | +9.1 | +9.0 | **+10.5** |
| pass failed → concede-shot cost $K$ | +0.6 pp | **+2.5** | +1.6 | +2.0 | +1.9 | +1.5 | +1.9 | +1.5 |
| dribble won → own-shot gain $G$ | — | — | +12.2 pp | — | +12.0 | **+21.4** | +17.3 | +17.2 |
| own shot ≤15 s after a recovery | 0.1% | 1.9% | 3.5% | 4.9% | 5.3% | **13.0%** | 9.4% | 8.8% |

**On recoveries, data and expert view pull in opposite directions.** Attackers' recoveries lead to shots more often (high turnovers), so the data alone weights them up. But recovering the ball is a core *job* of defensive and central midfielders, which is what the expert multiplier encodes. The product puts DM/CM recoveries (1.14 / 1.09) above W/CF (0.91 / 0.92). Turn $\kappa_X$ up or down to choose the balance.

### 8.5 Goalkeeper module

- **Shot stopping:** for shots faced, $o=1$ if no goal. $\hat p$ = the probability that the shot doesn't go in, from the shot-difficulty model (§2.2: distance, angle, body part, shot type, defenders in the shooting triangle, deflection, keeper distance from his line). The keeper's residual is saves above expected.
- **Distribution:** goalkeeper passes, with GK-specific expectations (long vs short).
- **Claims and sweeping:** clearances by the goalkeeper; crosses involving `keeperPlayerId`.
- **Shootouts:** each kick faced carries $L_{\text{kick}}$ (§3.3).
- Keepers have few actions, so the information-rate factor $N_{\text{GK}}$ boosts each one, and shots faced hit the cap $\omega=4$.

### 8.6 Off-ball defending channel (optional; uses tracking data)

Defenders' work is largely off the ball, so this adds observations to the Defending family for CB, FB and DM:

1. **Expected position.** Learn each player's expected position relative to his team as an affine function of the ball position, $\hat{\mathbf u}_i(t)=\mathbf A_i\mathbf b(t)+\mathbf c_i$, fitted by least squares on his own **low-pressure** frames ($\Psi<0.3$).
2. **At each danger moment** (opponent ball in the final third, or an opponent shot), measure the deviation $\delta_i=\lVert\mathbf u_i-\hat{\mathbf u}_i\rVert$ and score it:

$$
r^{\text{off}}_i=-\frac{\delta_i-\bar\delta_p}{s_{\delta,p}}
$$

3. Feed $r^{\text{off}}$ to the filter as a Defending observation with weight $\omega^{\text{off}}_p$ (default 0.5).

PFF's `positionGrade`, `closingDownGrade` and `movementGrade` can be used in the same way once the player they refer to is confirmed.

### 8.7 Position-aware expectations (summary)

- **Difficulty model** (§2.2): position random effects, so expectations are position-relative.
- **Grades** (§2.4): standardised per position.
- **Success definitions** (§2.1): optional position-specific refinements.
- **Normal-level priors** (§4): $\mu_{\theta,p}=0$ is exact because residuals are position-centred; $\tau_{\theta,p}$ can differ by position.

### 8.8 Per-position calibration and pressure effects

- **$\Delta_p$** and an optional isotonic map are fitted **separately per position**. Among moments with $T\approx x$, about $1-x/100$ of them should be followed by under-performance (the job-profile-weighted mean $r$ of the next 5 actions $<\bar\theta-\Delta_p$). This keeps a choke flag equally trustworthy for a keeper and a winger. Check with per-position Brier scores and reliability diagrams, leaving one match out at a time.
- **$\mu_{\beta,p}$ and $\tau_{\beta,p}$** come from the DML heterogeneity regression (§5.3).

### 8.9 Position knobs: summary

| Knob | Symbol | Default | Where |
|---|---|---|---|
| Job profile | $\boldsymbol\pi_p$ | table §8.2 ($\gamma_\pi=0.5$) | §7 trust |
| Event weights | $\omega_p(k,o)$ | table §8.3 | §6 update |
| Expert multipliers | $X_p(k,o)$, $\kappa_X$ | table §8.3, 1 | §8.3 |
| Data tilt | $\alpha_R,\alpha_V$ | 0.5, 0.5 | §8.3 |
| Information-rate equalisation | $\xi$ | 0.5 | §8.3 |
| Grade vs outcome mix | $a_p(k)$ | 0.7 midfield passes, 0.4 attacker shots, else 0.5 | §2.5 |
| Pitch-zone pressure | $\eta^{\text{own}}_p,\eta^{\text{opp}}_p$ | table §3.4 | §3 |
| Difficulty model position effects | $\tau_u$ | CV | §2.2 |
| Pressure-sensitivity prior | $\mu_{\beta,p},\tau_{\beta,p}$ | 0, 0.15 → DML | §5 |
| Tolerance | $\Delta_p$ | 0.25 → calibrated | §7 |
| Soft membership | $\epsilon, s_m$ | 0, 8 m | §8.1 |
| Off-ball channel weight | $\omega^{\text{off}}_p$ | 0.5 (CB, FB, DM), off elsewhere | §8.6 |

---

## 9. All other parameters

| Param | Default | Meaning | Fit |
|---|---|---|---|
| $\sigma^2$ | 1 | per-action residual variance | fixed (§2.5) |
| $s$ | 2.5 m | crowding kernel width | CV |
| $U(\cdot)$, $\gamma$, $S_{\min}$ | §3.1, 0.5, 0.15 | stakes | design / sensitivity |
| $\lambda$ | 1.345/90 per min | goals per team per minute | WC 2022; Elo later |
| $\pi$ | 0.76 | shootout conversion | data |
| $\ell$ | 18 m | consequence length scale | |
| $\Pi_{1/2}$ | median $\Pi$ | Ψ half-saturation | data |
| $\tau_\theta,\ \tau_s,\ \nu,\ \kappa_\varphi,\ h$ | 0.20, 0.10, 0.15, 100, 7 days | form priors | REML / CV |
| $\nu_g,\ \nu_d$ | 0.12, 0.10 | general vs family-specific day form | REML |
| $q_g,\ q_d,\ q_\beta$ | 0.0007, 0.0003, $10^{-5}$ per min | process noise | max. likelihood of innovations |
| $a_1,a_2,a_3$ | 0.5, 0.6, 0.8 | experience weights | DML heterogeneity |
| $\rho_E,\ \rho_{\text{sub}}$ | +0.10, 0 | experience / sub effect on β | DML |
| $\delta_{\text{sub}},\ \sigma^2_{\text{cold}},\ \zeta,\ \tau_{w0}$ | 0, 0.02, 1, 10 min | substitute entry | data |
| Huber $c$ | 3 | outlier threshold | |
| $W,\ n_0,\ \epsilon$ | 15 s, 200, 0.02 | consequence window, shrinkage, smoothing | sensitivity |

---

## 10. PFF field reference

| Need | Where |
|---|---|
| Match type | `Metadata.week`: 1–3 group matchdays · 4 R16 · 5 QF · 6 SF · 7 third place · 8 final |
| Extra time | `Metadata.homeTeamStartLeftExtraTime` not null; events with `period` 3–4 |
| Shootout kicks | `setpieceType == 'P'` shots after `gameEventType == 'END'` with `endType == 'G'` |
| Live score | `shotOutcomeType == 'G'` followed by a kick-off or the game end |
| Starters / subs | `Rosters[].started`; `SUB` events (`playerOnId`, `playerOffId`, `startGameClock`); `OFF`/`ON` = temporary |
| Position at the action | snapshot `homePlayers[] / awayPlayers[].positionGroupType` (11 codes, §1) |
| Ball recovery | derived (§2.1) |
| Age | `players.csv` `dob` vs `Metadata.date` |
| Attacking direction | `stadiumMetadata.teamAttackingDirection` |
| Coordinates | metres from the centre spot; pitch 105 × 68 (`stadiumMetadata`) |
| Opponent pressure on the ball | `pressureType`, `initialPressureType` |
| Tracking | `Tracking Data/<game>.jsonl.bz2`, ~29.97 fps |

---

## 11. Upgrade path

1. **Full hierarchical Bayesian fit** (PyMC/Stan) of all priors jointly.
2. **IRT with ability inside the logit:** $\Pr(o=1)=\sigma\big(x_{i,f}+\beta_i\Psi-b_p(\mathbf X)\big)$.
3. **Switching state-space / HMM** with an explicit "choking" state.
4. **Family-specific pressure sensitivity** $\beta_{i,f}$ (a striker may choke on shots but not passes).
5. **Team and opponent strength** (Elo) in λ and in $\mathbf X$.
6. **xT / VAEP** instead of the 15-second shot window for consequence $V$.
7. **Project models:** the VAE replaces the difficulty model; the Transformer models career-long drift of β and of $\boldsymbol\theta$.

---

## 12. Implementation (v0.2) and fitted values

### Refinements made while implementing

1. **Explicit general-form factor.** The filter state is $(g, d_{\text{Passing}},\dots,d_{\text{Goalkeeping}},\beta)$ with $x_f=g+d_f$. This is the same factor covariance as §6, but $g$ is reported separately (`generalForm`, and as its own attribution).
2. **Standardised residuals.** After §2.5, residuals are centred and scaled per (action key, position), so $\mathbb E[r]=0$ and $\operatorname{Var}(r)=1$ across the tournament.
3. **Penalties are a distinct item.** Shots and saves on penalties use the empirical tournament rates (Beta(1,1)-smoothed): the taker scores **0.657**, the keeper stops **0.279**. The general shot model put a keeper's chance of stopping a penalty near 0.5.
4. **Recoveries are measured against the player's own work-rate** (§2.1).
5. **Valid-goal rule.** Ball in the net is confirmed at the next restart, and the goal is credited to the team that did **not** kick off. This also handles own goals, which PFF records under the conceding team. It reproduces all **172** goals of the tournament, plus all **26** shootout goals.
6. **Retention outcomes** (touch, carry, clearance) are resolved at the next possession event, which is safe to compute live.

### Fitted on the 64 matches (`tools/build_model.py`)

| Quantity | Value |
|---|---|
| Difficulty models, out-of-fold log-loss vs base rate | pass 0.309 vs 0.447 · shot 0.356 vs 0.402 · cross 0.481 vs 0.515 · carry 0.502 vs 0.552 · clearance 0.529 vs 0.548 · touch 0.589 vs 0.609 · save 0.639 vs 0.659 · dribble 0.664 vs 0.679 · duel 0.680 vs 0.693 · receive 0.030 vs 0.032 |
| $\Pi_{1/2}$ | 0.440 (Ψ quartiles 0.415 / 0.50 / 0.60) |
| DML (match-clustered SE) | $\beta_{\text{CM}}=-0.021\,(0.024)$; position deltas all within ±0.05 (not significant); $\rho_E=+0.126\,(0.078)$; $\rho_{\text{sub}}=-0.054\,(0.033)$ |
| $\tau_\theta$ | 0.141 (moment estimate, used) |
| $\nu$ | moment estimate 0.048, below the plausible floor, so the default 0.15 is kept (see calibration) |
| Recoveries per 90 | GK 7.6 · CB 10.2 · FB 9.0 · DM 8.6 · CM 8.6 · AM 6.5 · W 5.7 · CF 4.1 |
| Speed | ~14 ms median per event, including trust and attributions for all 50 players |

### Not yet implemented

- Per-position calibration of $\Delta_p$ (§8.8)
- REML fit of the remaining hyperparameters
- The off-ball channel (§8.6)
- Soft position membership (§8.1)
- High-speed-distance fatigue from tracking: $\mathbf X$ currently uses minutes on the pitch and speed only
