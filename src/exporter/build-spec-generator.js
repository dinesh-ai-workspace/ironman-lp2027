'use strict'

function generateBuildSpec() {
  return `# IM_LP2027 Plan Build Spec

**Version:** 2.0
**Last changed:** 2026-10-05
**Source:** \`src/core/plan-generator/\` — do not edit Drive copy by hand

---

## A. Session Generation

**Type:** Rule-based, deterministic. \`generatePlan()\` in \`src/core/plan-generator/index.js\` runs once and writes all sessions to \`planned_sessions\`. The plan is **not adaptive** — it does not automatically adjust to missed sessions, HRV, Body Battery, compliance scores, or any other signal.

**Triggers that create a new plan version:**
- Developer calls \`plan:regenerate\` IPC (via UI button or direct invocation)
- Plan generator code changes (developer action)
- Coach issues a Coaching_Notes file with a structural change; developer implements it

**KEY swim = longest non-optional swim of the week (rule K1). Tie → later day. Exception Wk 5: Thu swim TT is KEY.**

**Weekly layout — Wks 1–14 (Mon = day 0):**

| Day | Session(s) |
|---|---|
| Mon | REST |
| Tue | Swim (supporting) [+ Easy run 25 min Z2 (supporting) in Wks 6–14; 20 min in cutback Wks 8, 12] |
| Wed | Bike (supporting) + Strength (optional) |
| Thu | Long run (KEY) + Swim × 1 (supporting; **Wks 1–4 no Thursday swim**) |
| Fri | Swim (KEY — longest of week) + Strength (optional) |
| Sat | Long bike (KEY) |
| Sun | Easy recovery run (optional Wks 1–5, supporting Wks 6–14) |

**Gate tests (KEY, scheduled on Thu/Tue as shown):** Wk 8 Thu swim 40 min time_trial (400m TT); Wk 12 Thu swim 50 min continuous_test (1,000m); Wk 16 Wed bike 60 min ftp_test; Wk 20 Thu swim 70 min continuous_test (1,500m); Wk 24 Thu run 60 min time_trial (30-min TT); Wk 26 Tue swim 80 min continuous_test (2,000m); Wk 34 Tue swim 100 min continuous_test (3,000m); Wk 35 Tue swim 110 min (3,800m attempt).

**Weekly layout — Wks 15–28 (Mon = day 0):**

| Day | Session(s) |
|---|---|
| Mon | REST |
| Tue | Swim (supporting) + Easy run 30 min Z2 (supporting) |
| Wed | Bike (supporting) + Strength 35 min (optional) |
| Thu | Long run (KEY) + Swim (supporting) |
| Fri | Swim (KEY — longest of week) + Strength 35 min (optional) |
| Sat | Long bike (KEY) [+ Brick run 20–30 min KEY on Wks 21, 23, 25, 27] |
| Sun | Easy recovery run (supporting) |

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
- **Week 5** (2026-10-12): Test week. Wed = FTP bike test 60 min (KEY). Thu = swim TT 40 min (KEY — K1 exception) + run TT 60 min (KEY). Sat = Z2 ride (unchanged).
- **Week 18** (Sun 2027-01-17): Sprint/Olympic tune-up race. Short swim Monday, shake-out run Friday.
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

**Gate ownership:** The app NEVER sets a gate to GREEN, YELLOW or RED. Only the coach does, via Coaching_Notes. The app fills an Evidence column with candidates (for swim gates: longest single swim in the gate week and prior week; for multi/race gates: relevant logged sessions). Status stays "pending" until the coach sets it.

**Failure actions are advisory only.** The app does not automatically modify the plan. The coach issues a Coaching_Notes file; the developer implements it.

---

## D. Matching and Scoring (Scoring v2, rules A1–A11 and C1–C4)

**Single implementation:** \`src/core/scoring/index.js\` — used by both \`electron/main.js\` and \`src/exporter/snapshot-generator.js\`.

**A1. One-to-one:** each logged session is matched to at most one planned session, and each planned session receives at most one (combined) logged entry.

**A2. Same-day merge:** before matching, combine logged sessions with the same discipline on the same date into one entry (sum the minutes, keep the higher avg HR).

**A3. Week boundary:** matching never crosses Mon–Sun week boundaries. A ±2-day window is clipped to the week.

**A4. Same-day-only types:** brick_run, race_simulation and race sessions match only on their planned date (no Pass 2 or Pass 3).

**A5. Pending vs missed:** a planned non-optional session is "pending" (excluded from the score and from the caps) until today > its date + 2 days, or the week has ended, whichever comes first. After that it is "missed". This applies to the current week only; past weeks are final.

**A6. Exact boundaries:** ratio = actual ÷ planned. Credit 100% if ratio ≥ 0.85; 60% if 0.70 ≤ ratio < 0.85; 25% if 0.50 ≤ ratio < 0.70; 0% if < 0.50. Overshoot (bike/run only) when ratio > 1.25 (exactly 1.25 is NOT overshoot).

**A7. Modifiers multiply:** overshoot (×0.8 replaces the 100% tier) and too hard (×0.6) combine — e.g. overshoot and too hard = 0.8 × 0.6 = 48%.

**A8. Test sessions** (type ftp_test, time_trial, continuous_test): credit 100% if a matching log exists with ratio ≥ 0.50; otherwise 0%. No overshoot or intensity modifiers apply.

**A9. Race sessions** (discipline race): credit 100% if a multisport/triathlon activity, or any swim/bike/run logs, exist on the race date. No duration tiers, no overshoot.

**A10. Swim coverage** (for the cap) = ALL logged swim minutes in the week ÷ planned NON-OPTIONAL swim minutes. If planned non-optional swim minutes = 0, the swim cap does not apply.

**A11. KEY-missed cap** uses only sessions that are "missed" under A5. Pending sessions never trigger it.

**optional sessions excluded** from both numerator and denominator. Skipping an optional session never lowers the score; completing one never raises it.

**3-pass greedy matching:**

| Pass | Scope | Eligible sessions | Day window |
|---|---|---|---|
| 1 | Same-day, importance-first | All non-optional | 0 days |
| 2 | Cross-day, KEY only | KEY importance only (not same-day-only types) | ±2 days, same week |
| 3 | Cross-day, supporting | supporting only (not same-day-only types) | ±2 days, same week |

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
- Swim coverage < 75% per A10 (all logged swim min ÷ planned non-optional swim min) → grade ≤ C (cap: "swim<75%")
- Any KEY session with 0% credit (missed or < 50% of plan) → grade ≤ B (cap: "KEY missed")
- **K2:** If both caps apply, the Cap column shows "swim<75%; KEY missed" and the lower cap (C) wins.

**K1 — KEY swim selection:** In every week with ≥1 non-optional swim, the longest non-optional swim is KEY; all others are supporting. Tie → later day in the week is KEY. Exceptions: Wk 5 Thu swim TT is KEY; race weeks 18, 28, 45 and Dress Rehearsal week 38 are unchanged.

**Intensity check (Z2 sessions):** For KEY and supporting bike/run sessions with target zone Z2: if avg HR > (Z2 ceiling HR + 5 bpm), credit = credit × 0.6, flag = "too hard". Activated per discipline as soon as its Z2 ceiling HR exists (set after Week 5 tests). Snapshot shows: "Intensity check: active (run ceiling X bpm, bike ceiling Y bpm)" or "Intensity check: inactive (zones not set)".

**Recovery rules (C1–C4):**

**C1. Night window:** bedtime 18:00–23:59 = evening; 00:00–05:59 = after midnight (counts as later than 23:30). Bedtimes 06:00–17:59 are naps; ignored for recovery.

**C2. Good night** = bedtime between 18:00 and 23:30 (inclusive) AND sleep ≥ 6.5 h.

**C3. Week membership** is by wake date, Mon–Sun.

**C4. Minimum data:** if a completed week has fewer than 4 nights with data, Status = "insufficient data". The in-progress week shows a colour only once it has ≥ 4 nights.

---

## E. Snapshot — Data Freshness Block (CN-5 #3 Part A)

Placed directly under the snapshot header (after Generated and Next gate lines).

A1. One line per source: Activities (Garmin), Sleep/wellness (Garmin), Weight, Nutrition (MyFitnessPal), Benchmarks.
Format: "\`Label: YYYY-MM-DD (N d ago)\`"

A2. Age = snapshot date (ET) minus the latest date in the DB for that source, in whole days. If age > 2, append " ⚠ stale". Benchmarks are exempt from the stale flag.

A3. If any of Activities, Sleep/wellness, or Nutrition is stale, add a sixth line:
"⚠ Import pending — Recovery/Fueling for the current week may be understated."

## F. Units

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

## G. Changelog

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
| 2026-10-05 | **CN-5 #1** — Scoring rules made explicit (A1–A11): same-day merge, week-boundary clip, same-day-only types, pending vs missed, exact ratio boundaries, modifier multiply, test/race session credit; recovery rules explicit (C1–C4): night window, good night definition, minimum data; Benchmarks entry form (B1) + zone derivation (B2): bike FTP/LTHR/zones, run LTHR/zones, swim pace; Z2 ceilings activate intensity check per discipline (B3); snapshot Benchmarks & Zones shows full zone bands (B4); gate Evidence column auto-populated (D1); snapshot DB path absolute-resolved (D2); build spec v2.0 (D3) |
| 2026-10-05 | **CN-5 #2** — Fueling module (\`src/core/fueling/index.js\`): MFP data → per-day classification (Rest/Easy/Moderate/Hard/Long), calorie status (under/in range/over), protein and carb checks, weekly status (Insufficient data / Red / Green / Yellow); snapshot Fueling section (weekly table, 14-day daily table, weight trend, MFP range); Weekly Scores table gains Fueling column; stop-loss hint (C5); build spec section H |
| 2026-10-05 | **CN-5 #3** — Data freshness block (5 sources, stale flag >2 d, import-pending warning); fueling day-type uses weighted training minutes (swim/bike/run 100%, strength/other 50%), daily table shows "weighted (raw)"; logged threshold raised 800→1,200 kcal; build spec H B1/C1 updated |
| 2026-10-05 | **CN-5 #4** — Weight trend uses calendar-day 7-day windows (≥3 readings required); trend = (prior 7-day avg − recent 7-day avg) ÷ 2 lb/wk; labels: below target / on target / above target / losing too fast / gaining (Foundation target 0.5–0.75 lb/wk); "Weigh-ins last 7 days: N (target ≥4)" added under Body Composition table; build spec H C3/W1–W5 updated |
| 2026-10-05 | **CN-5 #5** — KEY swim per week (rule K1): longest non-optional swim = KEY; tie → later day; Wk 5 exception (Thu TT); race/DR weeks unchanged; all 41 eligible weeks (1–44 excl. 18, 28, 38) updated in Plan ID 10 in place. K2: both caps display as "swim<75%; KEY missed"; lower cap C wins. Build spec A layout + D K1–K2 updated |
| 2026-10-05 | **CN-5 #6** — Gate tests scheduled: Wk 8 swim time_trial 40 min; Wk 12/20/26 swim continuous_test 50/70/80 min; Wk 16 bike ftp_test 60 min; Wk 24 run time_trial 60 min; Wk 34 purpose update; Wk 35 swim 100→110 min. Run frequency: Tue easy run added Wks 6–14 (25 min, 20 min cutback). Sunday recovery run → supporting Wks 6–28. Wk 38 DR and Wk 45 race zone → Z2. A8 adds continuous_test. Build spec A layout/notes + A8 + changelog updated |

---

## H. Benchmarks & Zones

**Implementation:** \`src/core/scoring/zones.js\`

**Rounding:** all derived values use half-up: \`halfUp(n) = Math.floor(n + 0.5)\`

### Bike FTP Test

Input: 20-min avg power (W) = P, 20-min avg HR (bpm) = H

| Derived | Formula |
|---|---|
| FTP | halfUp(P × 0.95) |
| Bike LTHR | halfUp(H × 0.95) |
| Bike Z2 ceiling HR | top of bike HR Z2 band |

**Bike power zones (% FTP):**

| Zone | % FTP | Notes |
|---|---|---|
| Z1 | < 56% | |
| Z2 | 56–75% | ceiling used for intensity check |
| Z3 | 76–90% | |
| Z4 | 91–105% | |
| Z5 | > 105% | |

**Bike HR zones (% bike LTHR):**

| Zone | % bike LTHR |
|---|---|
| Z1 | < 81% |
| Z2 | 81–89% |
| Z3 | 90–93% |
| Z4 | 94–99% |
| Z5 | ≥ 100% |

### Run 30-min TT

Input: avg HR of the last 20 min (bpm) = R

| Derived | Formula |
|---|---|
| Run LTHR | R (no × 0.95) |
| Run Z2 ceiling HR | top of run HR Z2 band |

**Run HR zones (% run LTHR):**

| Zone | % run LTHR |
|---|---|
| Z1 | < 85% |
| Z2 | 85–89% |
| Z3 | 90–94% |
| Z4 | 95–99% |
| Z5 | ≥ 100% |

### Swim 400m TT

Input: time in mm:ss = T (converted to decimal minutes)

**Pace per 100m** = T ÷ 4. Record only; no swim zones.

---

## I. Fueling

**Implementation:** \`src/core/fueling/index.js\`

**Reference body mass:** 68.5 kg (carb thresholds; recalibrate if weight changes significantly).

### A. Import

A1. Parse MyFitnessPal CSV, summing all meals per date: calories, protein (g), carbohydrates (g), fat (g).
A2. Re-importing an overlapping date range replaces those dates (DELETE + INSERT per date+meal+source); never duplicates.
A3. A date counts as "logged" only if total calories ≥ 1,200. Lower totals are treated as incomplete: excluded from averages and listed as "incomplete" in the snapshot. (Raised from 800 per CN-5 #3 C1.)

### B. Day type and targets

B1. For fueling purposes only, classify by **weighted** training minutes: swim, bike, and run count at 100%; strength and all other activities (hike, walk, etc.) count at 50%. The daily table shows the weighted value with the raw total in brackets, e.g. "124 (179)". Execution scoring and weekly actual hours are not affected.

| Day type | Weighted training min |
|---|---|
| Rest | 0 |
| Easy | 1–75 |
| Moderate | 76–120 |
| Hard | 121–180 |
| Long | > 180 |

B2. Calorie target range by day type:

| Day type | Range (kcal) |
|---|---|
| Rest | 1,750–2,000 |
| Easy | 2,000–2,300 |
| Moderate | 2,300–2,600 |
| Hard | 2,550–3,150 |
| Long | 3,000–3,800 |

B3. Protein target: 155 g/day. A day "hits protein" if protein ≥ 140 g.

B4. Carbohydrate check (68.5 kg reference):

| Day type | Min carbs (g) | Basis |
|---|---|---|
| Rest / Easy | ≥ 206 | 3 g/kg |
| Moderate | ≥ 343 | 5 g/kg |
| Hard / Long | ≥ 411 | 6 g/kg |

Flag "low carb" on Moderate, Hard and Long days below the threshold. Rest and Easy are not flagged.

B5. Calorie status: "in range" = within tier range; "under" = below range; "over" = above range.

### C. Weekly status and snapshot

C1. Per Mon–Sun week, logged days only: protein hits, calorie under/in range/over, low-carb days (Moderate/Hard/Long only), avg kcal / protein / carbs.

C2. Status:
- **Insufficient data:** fewer than 4 logged days.
- **Red:** protein hit on fewer than 3 logged days, OR "under" on 3 or more Hard/Long days, OR any training day (≥ 1 min) below 1,600 kcal.
- **Green:** protein hit on ≥ 70% of logged days AND no Hard/Long day "under" AND low-carb days ≤ 1.
- **Yellow:** everything else.

C3. Weight trend (updated CN-5 #4, W1–W5):

W1. 7-day avg for date D = mean of all weight readings dated D−6 through D (calendar days). Requires ≥ 3 readings in the window; shows "—" if fewer.

W2. Trend = (7-day avg at the most recent date with ≥ 3 readings) minus (7-day avg 14 days earlier, also requiring ≥ 3 readings), divided by 2, expressed in lb/wk (positive = loss). If either window is insufficient: "Weight trend: insufficient data (need ≥3 weigh-ins per 7 days)".

W3. Labels vs Foundation/Aerobic Base target (0.5–0.75 lb/wk): "below target" (< 0.5), "on target" (0.5–0.75), "above target" (> 0.75–1.0), "losing too fast" (> 1.0), "gaining" (≤ 0).

W4. The Fueling weight-trend line and the stop-loss rule (C5) both use W1–W2.

W5. Under the Body Composition table: "Weigh-ins last 7 days: N (target ≥4)" where N = distinct weigh-in days in the last 7 calendar days.

C4. Snapshot Fueling section: weekly table (last 4 completed + current in progress), 14-day daily table (Date | Day type | Train min | kcal | Target range | Protein g | Carbs g | Flags), weight-trend line, MFP date range.

C5. Stop-loss hint: if the most recent completed week has Recovery Red AND weight trend loss AND RHR rose ≥ 3 bpm vs prior week average, prepend "Strategy stop-loss: multiple Yellow signals — consider +150–300 kcal/day" to the snapshot. Coach decides; app only flags.
`
}

module.exports = { generateBuildSpec }
