"""Constants and default parameters for the football trust score.

Every value here is documented in docs/trust_formula.md (section numbers in comments).
"""

# §1 position groups (PFF positionGroupType -> group)
GROUP = {
    'GK': 'GK',
    'LCB': 'CB', 'RCB': 'CB', 'MCB': 'CB', 'CB': 'CB',
    'LB': 'FB', 'RB': 'FB', 'LWB': 'FB', 'RWB': 'FB',
    'DM': 'DM', 'CM': 'CM', 'LCM': 'CM', 'RCM': 'CM',
    'AM': 'AM', 'LW': 'W', 'RW': 'W', 'LM': 'W', 'RM': 'W',
    'CF': 'CF', 'ST': 'CF',
}
POSITIONS = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'CF']
BASE_POSITION = 'CM'   # dummy-coding baseline

# §1 skill families
FAMILIES = ['Passing', 'Retention', 'Dribbling', 'Duels', 'Defending', 'Recovery', 'Shooting', 'Goalkeeping']
FAM_INDEX = {f: i for i, f in enumerate(FAMILIES)}

# action key -> (skill family, key used in config/position_weights.json)
KEYS = {
    'pass':         ('Passing',     'PA passer'),
    'cross':        ('Passing',     'CR crosser'),
    'receive':      ('Retention',   'IT first touch (retained)'),
    'touch':        ('Retention',   'TC carry/touch (retained)'),
    'carry':        ('Retention',   'BC carry/touch (retained)'),
    'dribble':      ('Dribbling',   'CH dribbler'),
    'duel':         ('Duels',       'CH challenge/duel'),
    'interception': ('Defending',   'PA defender (pass defended)'),
    'clearance':    ('Defending',   'CL clearer (retained)'),
    'block':        ('Defending',   'SH blocker'),
    'recovery':     ('Recovery',    'REC (ball recovery)'),
    'shot':         ('Shooting',    'SH shooter (goal)'),
    'save':         ('Goalkeeping', 'SH keeper (no goal)'),
}
SUCCESS_ONLY = {'interception', 'block', 'recovery'}
RETENTION_KEYS = {'touch', 'carry', 'clearance'}      # outcome = team still has the ball at next possession event
SHOT_KEYS = {'shot', 'save'}

# §2.5 grade-vs-outcome mix a_p(k)
def mix_a(key, pos):
    if key == 'pass' and pos in ('DM', 'CM', 'AM'):
        return 0.7
    if key == 'shot' and pos in ('CF', 'W', 'AM'):
        return 0.4
    return 0.5

# §3.1 utility of finishing positions
UTILITY = {'champion': 1.00, 'runner_up': 0.35, 'third': 0.20, 'fourth': 0.12, 'qf': 0.06, 'r16': 0.03, 'group': 0.0}

# §3.4 position-aware consequence (eta_own, eta_opp)
ETA = {
    'GK': (1.5, 0.0), 'CB': (1.5, 0.3), 'FB': (1.2, 0.6), 'DM': (1.2, 0.6),
    'CM': (0.9, 0.9), 'AM': (0.5, 1.2), 'W': (0.4, 1.3), 'CF': (0.3, 1.5),
}

# default recoveries per 90 by position (overwritten by model.json)
REC_RATE_DEFAULT = {'GK': 7.81, 'CB': 10.34, 'FB': 9.08, 'DM': 8.96, 'CM': 8.59, 'AM': 6.50, 'W': 5.67, 'CF': 4.03}

PARAMS = dict(
    sigma2=1.0,                 # per-action residual variance (residuals are standardised)
    p_clip=(0.03, 0.97), z_clip=4.0,
    crowd_s=2.5,                # crowding kernel width (m)
    gamma_S=0.5, S_min=0.15,    # stakes compression / floor
    goals_per_team=1.345,       # WC2022: 172 goals / 64 games / 2
    L_max=3.0,                  # leverage cap
    pen_conversion=0.76,        # shootout Markov chain
    ell=18.0,                   # consequence length scale (m)
    mc_sims=30000,              # group-qualification Monte Carlo
    # §4 prior from earlier matches
    tau_theta=0.20,             # spread of players' levels around the position average (fitted value overrides)
    nu=0.10,                    # match-to-match form variation
    half_life_days=10.0,        # recency weighting of earlier matches
    a1=0.5, a2=0.6, a3=0.8,     # experience index
    mu_beta=0.0, tau_beta=0.15, rho_E=0.10, rho_sub=0.0,   # pressure-sensitivity prior (DML values override)
    # §5 in-match filter
    sigma2_cold=0.01,           # extra uncertainty for a substitute
    q_a=0.0008, q_beta=1e-5,    # drift per minute of form / pressure sensitivity
    huber_c=3.0,
    # §6 trust
    delta=0.08,                 # choke threshold (SD below the position average); calibrated so the median player-moment is ~70
    rec_window=10.0,            # recovery count window (on-pitch minutes)
)
