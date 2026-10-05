'use strict'

function generateBuildSpec() {
  return `# IM_LP2027 Plan Build Spec

**Version:** 1.0
**Last changed:** 2026-10-04
**Source:** \`src/core/plan-generator/\` — do not edit Drive copy by hand

---

## A. Session Generation

**Type:** Rule-based, deterministic. \`generatePlan()\` in \`src/core/plan-generator/index.js\` runs once and writes all sessions to \`planned_sessions\`. The plan is **not adaptive** — it does not automatically adjust to missed sessions, HRV, Body Battery, compliance scores, or any other signal.

**Triggers that create a new plan version:**
- Developer calls \`plan:regenerate\` IPC (via UI button or direct invocation)
- Plan generator code changes (developer action)
- Coach issues a Coaching_Notes file with a structural change; developer implements it

**Weekly layout — Wks 1–14 (Mon = day 0):**

| Day | Session(s) |
|---|---|
| Mon | REST |
| Tue | Swim (supporting) |
| Wed | Bike (supporting) + Strength (optional) |
| Thu | Long run (KEY) + Swim × 1 (supporting; **Wks 1–4 no Thursday swim**) |
| Fri | Swim (supporting) + Strength (optional) |
| Sat | Long bike (KEY) |
| Sun | Easy recovery run (optional) |

**Weekly layout — Wks 15–28 (Mon = day 0):**

| Day | Session(s) |
|---|---|
| Mon | REST |
| Tue | Swim (supporting) + Easy run 30 min Z2 (supporting) |
| Wed | Bike (supporting) + Strength 35 min (optional) |
| Thu | Long run (KEY) + Swim (supporting) |
| Fri | Swim (supporting) + Strength 35 min (optional) |
| Sat | Long bike (KEY) [+ Brick run 20–30 min KEY on Wks 21, 23, 25, 27] |
| Sun | Easy recovery run (optional) |

**A/B alternating weekends — Wks 29–38:**

| Type | Thu | Sat | Sun | Weeks |
|---|---|---|---|---|
| A | Medium run 65 min (supporting) | Long ride (KEY) | Long run (KEY) | 29, 31, 33, 35, 37 |
| B | Long run (KEY) | Long ride (KEY) + Brick 30–45 min (KEY) | Easy 30 min (optional) | 30, 34 |
| Cutback | Easy run (supporting) | Long ride at 63% (KEY) | Easy (optional) | 32, 36 |
| DR | Easy 30 min (optional) | Swim 100→Bike 300→Run 90 back-to-back (all KEY) | REST | 38 |

Tue/Wed/Thu swim + Fri OW swim maintained in all A/B weeks. Fri swim = open-water type from Wk 33.

**Step-back weeks:**
- Wks 1–13: every 4th week × 0.70
- Wks 14–45: every 4th week × 0.63 (60–65% load rule)

**Special weeks:**
- **Week 5** (2026-10-12): Test week. Wed = FTP bike test 60 min (KEY). Thu = swim TT 40 min (supporting) + run TT 60 min (KEY). Sat = Z2 ride (unchanged).
- **Week 18** (Sun 2027-01-17): Sprint/Olympic tune-up race (Saturday). Short swim Monday, shake-out run Friday.
- **Week 28** (Sat 2027-03-27): Half-Ironman tune-up race (Saturday). Short swim Tuesday, easy run Wednesday, race Saturday. Race target: 450 min.
- **Week 38** (Sat 2027-06-05): Dress Rehearsal. Swim 100 min → T1 → Bike 300 min → T2 → Run 90 min back-to-back. Full race nutrition and gear.
- **Race day** (Sun 2027-07-25): IRONMAN Lake Placid. Target finish: 930 min (≈15:30).

**Load rules (Wks 14–45):**
- Total weekly volume ≤ 14 h (races excluded)
- Week-over-week progression (non-cutback) ≤ 10%
- Cutback weeks: 50–65% of preceding build week (A/B block cutback weeks structurally reach ~54%; non-A/B weeks reach ~63%)
- Long run ceiling: 165 min / 16 mi
- Long ride peak range: 300–315 min (Wks 34, 37)

---

## B. History — Are Past Planned Minutes Frozen?

**Yes.** \`planned_sessions\` rows are written at plan generation and never updated retroactively. If the plan is regenerated mid-season (new plan_id), compliance scores for past weeks are recalculated against the new plan's sessions for those weeks, because the snapshot and calendar always join on the current active \`plan_id\`. Coaching changes that affect past weeks should be implemented as notes in the athlete record, not as plan edits.

---

## C. Gates

Defined in \`src/core/plan-generator/index.js → buildReadinessGates()\`. Inserted into \`readiness_gates\` at plan generation. One row per gate.

| Wk | Discipline | Metric ID | Target |
|---|---|---|---|
| 5 | multi | baselines_w5 | GREEN: FTP, 400m swim TT, 30-min run TT all recorded; zones set before Wk 6 |
| 8 | multi | trajectory_review_w8 | GREEN: Swim pace/100m ≤ Wk 5; all KEY Wks 5–7 ≥85%; no joint pain >3 days |
| 12 | swim | continuous_1000m | GREEN: 1,000 m non-stop, any pace |
| 16 | bike | ftp_retest_w16 | GREEN: FTP ≥ Wk 5 FTP |
| 20 | swim | continuous_1500m | GREEN: 1,500 m non-stop, any pace |
| 24 | run | run_tt_retest_w24 | GREEN: 30-min TT distance ≥ Wk 5 |
| 26 | multi | half_readiness_w26 | GREEN: 2,000 m swim + 3.5-h ride + 100-min run, same week, different days |
| 28 | race | him_tune_up_race | GREEN: Finished within cutoffs, even pacing, no GI issues |
| 34 | swim | ow_continuous_3000m | GREEN: 3,000 m continuous, wetsuit, sighting |
| 36 | multi | im_readiness_w36 | GREEN: 3,800 m swim + 5-h ride with 30-min brick + 150-min run, Wks 34–36 |
| 38 | race | dress_rehearsal | GREEN: Swim 100 min → bike 300 min → run 90 min with race nutrition, no GI issues |

**Failure actions are advisory only.** The app does not automatically modify the plan. The coach issues a Coaching_Notes file; the developer implements it.

---

## D. Matching and Scoring (Scoring v2)

**Single implementation:** \`src/core/scoring/index.js\` — used by both \`electron/main.js\` and \`src/exporter/snapshot-generator.js\`.

**optional sessions excluded** from both numerator and denominator. Skipping an optional session never lowers the score; completing one never raises it.

**3-pass greedy matching:**

| Pass | Scope | Eligible sessions | Day window |
|---|---|---|---|
| 1 | Same-day, importance-first | All non-optional | 0 days |
| 2 | Cross-day, KEY only | KEY importance only | ±2 days |
| 3 | Cross-day, supporting | supporting only | ±2 days |

**hasEarlierPlan guard:** A logged session on day D is excluded from Pass 1 if: (a) there is a same-discipline plan on D−1, AND (b) there is **no** same-discipline plan on D.

**Session credit tiers** (actual ÷ planned duration):

| Actual/Planned | Credit |
|---|---|
| > 125% (bike/run only) | 80% (overshoot penalty; flag: "overshoot") |
| ≥ 85% | 100% |
| 70–84% | 60% |
| 50–69% | 25% |
| < 50% | 0% |

Swim has no overshoot penalty — extra swim time is welcome on the limiter.

**Session weight by importance:** KEY = 10 pts, supporting = 4 pts.

**Score = sum(weight × credit) ÷ sum(weight) × 100**, rounded half-up to integer.

**Grade cutoffs:**

| Grade | Score |
|---|---|
| A | ≥ 90 |
| B | 70–89 |
| C | 50–69 |
| D | < 50 |

**Grade caps** (applied to grade only, never to the numeric score):
- Swim coverage < 75% (swim actual min ÷ swim planned min) → grade ≤ C (cap: "swim<75%")
- Any KEY session with 0% credit (missed or < 50% of plan) → grade ≤ B (cap: "KEY missed")
- If both apply, the lower cap wins ("swim<75%" → C).

**Intensity check (Z2 sessions):** For KEY and supporting bike/run sessions with target zone Z2: if avg HR > (Z2 ceiling HR + 5 bpm), credit = credit × 0.6, flag = "too hard". Inactive until Z2 ceiling HR exists in Benchmarks (set after Week 5 tests). Snapshot shows: "Intensity check: inactive (zones not set)".

**Recovery score (separate from training score):** good night = bedtime ≤ 23:30 AND sleep ≥ 6.5 h. Recovery = good nights ÷ nights with data. Green ≥ 70% | Yellow 40–69% | Red < 40%. Nights with no bedtime data excluded.

---

## E. Units

| Field | Unit | Notes |
|---|---|---|
| Duration (all) | **min** | Never write "m" — collides with metres |
| Run distance | miles | Garmin \`distanceUnit: 'mi'\` |
| Bike distance | miles | Same |
| Swim distance | miles | Stored in miles; displayed in metres in snapshot (× 1,609.34) |
| Run pace | min:ss / mi | duration_min ÷ distance_miles, formatted MM:SS |
| Swim pace | min:ss / 100 m | convert miles → metres (× 1,609.34), then per 100 m |
| Bike speed | mph | distance_miles ÷ (duration_min ÷ 60) |
| Power | W (watts) | |
| Heart rate | bpm | |
| Body weight | lb | |
| Body fat | % | Scale = directional only; DEXA is ground truth |
| HRV | ms | Garmin "Avg Overnight HRV" |
| Body Battery | 0–100 | Garmin proprietary score |

---

## F. Changelog

| Date | Summary |
|---|---|
| 2026-09-09 | Plan ID 1 generated — v1 scheduler (2× swim/wk all weeks), v1 gates (Wks 8, 16, 24, 28, 32, 36) |
| 2026-10-04 | Plan ID 7 (v6) — Thu swim added from Wk 5 only; v2 gates (Wks 5, 8, 12, 16, 20, 24, 26, 28, 34, 36, 38); \`sessionCredit\` B-tier changed 70–84% → 60% (was 0%); \`hasEarlierPlan\` guard added to prevent double-penalising back-to-back same-discipline days |
| 2026-10-04 | **Plan ID 8 (DRAFT v7)** — Wk 5 test week (FTP+TT); Wk 15+ Tue easy run + Fri strength optional; Wks 21,23,25,27 Sat brick; A/B alternating weekends Wks 29–38; Wk 38 Dress Rehearsal; HIM→450 min, IM→930 min; Fri OW swim Wk 33+; run ceiling 165 min; step-back 63% from Wk 14. Status: SUPERSEDED by Plan ID 9 |
| 2026-10-04 | **Plan ID 9 (DRAFT v7)** — Coach fixes on Plan ID 8: (1) 14h cap enforced (violations reported for Wk 34 +25min and Wk 37 +10min); (2) gates → 11 rows; (3) Wk 5 Fri swim restored; (4) all strength optional; (5) Wks 33–35 Tue swim endurance_continuous 100min; (6) OW pool note Wk 33+. Status: SUPERSEDED by Plan ID 10 |
| 2026-10-04 | **Plan ID 10 (DRAFT v8)** — Coach overrides on Plan ID 9: Wk 34 Thu long run 150→135min, Sat brick 40→30min; Wk 37 Sat long ride 315→300min. Cutback rule updated to 50–65%. All 5 validation rules PASS. Status: DRAFT — activated as live plan (supersedes Plan ID 7 v6) |
| 2026-10-04 | **CN-2** — Replaced readiness gates with 11 rows (baselines_w5…dress_rehearsal); fixed Week 18 race date to Sunday 2027-01-17 |
| 2026-10-04 | **CN-3** — Bedtime populated from Garmin Sleep CSV exports; DB path via resolve-path.js (no __dirname); phase h/wk computed from sessions (EXCLUDED_WEEKS set) |
| 2026-10-04 | **CN-4** — Scoring v2: optional sessions excluded; overshoot penalty (bike/run > 125% → 80%); grade caps (swim<75%→C, KEY missed→B); recovery table; intensity check stub; score breakdown section; build spec sections A/C/D/E updated |
`
}

module.exports = { generateBuildSpec }
