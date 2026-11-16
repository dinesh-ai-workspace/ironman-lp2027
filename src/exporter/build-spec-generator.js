'use strict'

// Derived from latest changelog row — update this when adding changelog rows
const SPEC_CHANGED_DATE = '2026-11-15'

function generateBuildSpec() {
  return `# IM_LP2027 Plan Build Spec

**Version:** 2.0
**Last changed:** ${SPEC_CHANGED_DATE}
**Source:** \`src/core/plan-generator/\` — do not edit Drive copy by hand

---

## A. Session Generation

**Type:** Rule-based, deterministic. \`generatePlan()\` in \`src/core/plan-generator/index.js\` runs once and writes all sessions to \`planned_sessions\`. The plan is **not adaptive** — it does not automatically adjust to missed sessions, HRV, Body Battery, compliance scores, or any other signal.

**Triggers that create a new plan version:**
- Developer calls \`plan:regenerate\` IPC (via UI button or direct invocation)
- Plan generator code changes (developer action)
- Coach issues a Coaching_Notes file with a structural change; developer implements it

**KEY swim = longest non-optional swim of the week (rule K1). Tie → later day. Exception Wk 5: Fri swim TT is KEY.**

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

**Gate tests (KEY, scheduled on Thu/Tue as shown):** Wk 9 Thu swim 40 min time_trial (400 yd TT — moved from Wk 8 per CN-12 #1); Wk 12 Thu swim 50 min endurance_continuous (300m progress check, CN-30 #3; gate moved to Wk 16); Wk 16 Tue swim 55 min continuous_test (1,000m, CN-30 #4); Wk 16 Wed bike 60 min ftp_test; Wk 20 Thu swim 70 min endurance_continuous (1,200m progress, CN-30 #4); Wk 22 Thu swim 70 min continuous_test (1,500m, CN-30 #4); Wk 24 Thu run 60 min time_trial (30-min TT); Wk 26 Tue swim 80 min continuous_test (2,000m); Wk 34 Tue swim 100 min continuous_test (3,000m); Wk 35 Tue swim 110 min (3,800m attempt).

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

**Recovery week — Wk 29:**

All sessions Z1–Z2, no hills, no brick. Tue+Thu: swim aerobic 45 + easy run; Wed: bike endurance_z2 60; Fri: swim aerobic 50 (KEY via K1); Sat: long_ride 180 (KEY); Sun: long_run 75 (KEY). Total 515 min.

**A/B alternating weekends — Wks 30–38:**

| Type | Thu | Sat | Sun | Weeks |
|---|---|---|---|---|
| A | Medium run 65 min (supporting) | Long ride (KEY) | Long run (KEY) | 31, 33, 35, 37 |
| B | Long run (KEY) | Long ride (KEY) + Brick 30–45 min (KEY) | Easy 30 min (optional) | 30, 34 |
| Cutback | Easy run (supporting) | Long ride at 63% (KEY) | Easy (optional) | 32, 36 |
| DR | Easy 30 min (optional) | Swim 100→Bike 300→Run 90 back-to-back (all KEY) | REST | 38 |

Tue/Wed/Thu swim + Fri OW swim maintained in all A/B weeks. Fri swim = open-water type from Wk 33.

**Taper layout — Wks 41–44:**

| Wk | Key features |
|---|---|
| 41 | Sat long_ride 240 (KEY); Thu long_run 150 (KEY) |
| 42 | Wed bike race_pace 75 S; Thu run race_pace 60 S; Sat long_ride 180 (KEY) + brick_run 20 (KEY); Sun long_run 90 (KEY) |
| 43 | Wed bike race_pace 60 S; Thu run race_pace 45 S; Sat long_ride 120 (KEY) + brick_run 15 (KEY); Sun long_run 60 (KEY) |
| 44 | Wed bike race_pace 60 S; Thu run easy 40 S; Sat bike endurance_z2 90 (KEY); Sun run easy 45 (KEY) |

**Step-back weeks:**
- Wks 1–13: every 4th week × 0.70
- Wks 14–45: every 4th week × 0.63 (60–65% load rule)

**Special weeks:**
- **Week 5** (2026-10-12): Test week. Wed = Z2 indoor bike 60 min (supporting; FTP moved per CN-11 #1). Fri = swim TT 40 min (KEY — K1 exception; moved from Thu per CN-13 #1). Sat = run TT 60 min (KEY); Sun = FTP test 100 min (KEY).
- **Weeks 6–7** (2026-10-22 → 2026-11-01): Athlete travel. Swims/bikes optional; Wk 6 long run Sat 60 min. Wk 8 Thu swim TT moved to Wk 9 Thu (CN-12 #1).
- **Week 8** (2026-11-02): gate RED (CN-25 #1); Sun 2026-11-08 run TT moved to 2026-11-15 (CN-25 #2); Sun 2026-11-08 now easy recovery run 30 min (supporting).
- **Week 9** (2026-11-09): Sun 2026-11-15 run TT retest 60 min (KEY, CN-25 #2) — MISSED; retest moved to 2026-11-17 (CN-28 #2). Thu 2026-11-12 400 yd swim TT; reduced volume per CN-25 #3.
- **Weeks 10–11** (2026-11-16 → 2026-11-29): long run and long ride reduced for post-travel re-ramp (CN-26 #1–#2). Tue 2026-11-17 run TT retest 60 min (KEY, CN-28 #2).
- **Week 18** (Sun 2027-01-17): Sprint/Olympic tune-up race. Short swim Monday, shake-out run Friday.
- **Week 28** (Sat 2027-03-27): Half-Ironman tune-up race (Saturday). Short swim Tuesday, easy run Wednesday, race Saturday. Race target: 450 min.
- **Week 38** (Sat 2027-06-05): Dress Rehearsal. Swim 100 min → T1 → Bike 300 min → T2 → Run 90 min back-to-back. Full race nutrition and gear.
- **Race day** (Sun 2027-07-25): IRONMAN Lake Placid. Target finish: 930 min (≈15:30).

**Load rules (Wks 14–45):**
- Swim + bike + run weekly volume ≤ 14 h (strength tracked but excluded; races excluded)
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
| 5 | multi | baselines_w5 | GREEN: FTP, 400 yd swim TT, 30-min run TT all recorded; zones set before Wk 6 |
| 8 | multi | trajectory_review_w8 | GREEN: Swim pace/100m ≤ Wk 5; all KEY Wks 5–7 ≥85%; no joint pain >3 days |
| 16 | swim | continuous_1000m | GREEN: 1,000 m non-stop, any pace |
| 16 | bike | ftp_retest_w16 | GREEN: FTP ≥ Wk 5 FTP |
| 22 | swim | continuous_1500m | GREEN: 1,500 m non-stop, any pace |
| 24 | run | run_tt_retest_w24 | GREEN: 30-min TT distance ≥ Wk 9 retest (2026-11-15) |
| 26 | multi | half_readiness_w26 | GREEN: 2,000 m swim + 3.5-h ride + 100-min run, same week, different days |
| 28 | race | him_tune_up_race | GREEN: Finished within cutoffs, even pacing, no GI issues |
| 34 | swim | ow_continuous_3000m | GREEN: 3,000 m continuous, wetsuit, sighting |
| 36 | multi | im_readiness_w36 | GREEN: 3,800 m swim + 5-h ride with 30-min brick + 150-min run, Wks 34–36 |
| 38 | race | dress_rehearsal | GREEN: Swim 100 min → bike 300 min → run 90 min with race nutrition, no GI issues |

**Gate ownership:** The app NEVER sets a gate to GREEN, YELLOW or RED. Only the coach does, via Coaching_Notes. Status stays "pending" until the coach sets it.

**Evidence column rules (CN-10 #6):**

- **Test gates** (baselines_w5, continuous_1000m, ftp_retest_w16, continuous_1500m, run_tt_retest_w24): Evidence lists only logged sessions matched to planned sessions of type \`ftp_test\`, \`time_trial\`, or \`continuous_test\` in the gate week, plus Benchmarks entries for that week. No unplanned or non-test sessions appear.
  - baselines_w5 format exactly: \`FTP: <recorded N W | not recorded>; 400 yd swim TT: <recorded mm:ss (pace/100m) | not recorded>; 30-min run TT: <recorded X.XX mi | not recorded>\`
- **Swim gates** (ow_continuous_3000m): longest single swim in gate week and prior week (m + min).
- **Multi / race gates** (trajectory_review_w8, half_readiness_w26, him_tune_up_race, im_readiness_w36, dress_rehearsal): relevant logged sessions in gate week range (swim/bike/run, up to 3).

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

**A11. KEY-missed cap** uses only sessions that are "missed" under A5. Pending and excused sessions never trigger it.

**optional sessions excluded** from both numerator and denominator. Skipping an optional session never lowers the score; completing one never raises it.

**Session reason field (A1–A3):**

A1. An optional Reason field is stored on each logged session. Values: completed (default when actual ≥ planned), life, equipment, illness, pain, coach-adjusted, other. The UI shows the field only when actual duration < planned, or when logging a missed session (actual = 0 or field is empty).

A2. When actual ≥ planned, reason is always "completed" and the field is hidden.

A3. Reason is shown in the session log Status column, e.g. "excused (pain)" or in the score breakdown as "excused (illness)".

**Excused sessions (B1–B4):**

B1. Excused reasons: illness, pain, coach-adjusted.

B2. An excused session is removed from both numerator AND denominator of the week's score. It does not count as a missed KEY session for the grade cap.

B3. The score breakdown total line shows "(N excused)" when N > 0, e.g. "Total: 10.0 ÷ 10 = 100 (1 excused)".

B4. Excused sessions still appear in the session log with "excused (reason)" in the Status column.

**Pain alert (C1–C3):**

C1. Rolling 14-day window of sessions flagged reason = "pain".

C2. If 2 or more pain-flagged sessions fall within any 14-day window (any two dates ≤ 13 days apart), add this line at the TOP of the snapshot (above Data Freshness): "⚠ Pain alert: N pain-flagged sessions in 14 days — coach review required."

C3. Alert clears automatically when the 14-day window drops below 2 pain sessions.

**Extra (unplanned) sessions (D1–D5):**

D1. A logged session with no matching planned session is tagged "unplanned".

D2. Unplanned sessions never raise the score; excluded from numerator and denominator.

D3. Exception — coach-authorised makeup: if a Coaching Notes file contains "makeup authorised: \<date\> \<discipline\>", a session logged within ±2 days (same week) is matched to the original planned session and scored normally.

D4. Unplanned sessions appear in a separate "Extra Sessions (unplanned)" subsection at the bottom of the session log, not mixed into the planned session rows.

D5. If unplanned sessions exceed 90 min in the current week, the snapshot adds: "Note: N min of unplanned activity this week — coach visibility."

**4-pass greedy matching:**

| Pass | Scope | Eligible sessions | Day window |
|---|---|---|---|
| 1 | Same-day, importance-first | All non-optional | 0 days |
| 2 | Cross-day, KEY only | KEY importance only (not same-day-only types) | ±2 days, same week |
| 3 | Cross-day, supporting | supporting only (not same-day-only types) | ±2 days, same week |
| 4 | Optional — same day first, then cross-day | optional only | same day first; then ±2 days, same week |

Optional sessions (Pass 4) are excluded from both score numerator and denominator. "Str done/pl" in the weekly table reads from the same match result as the session log.

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

**K1 — KEY swim selection:** In every week with ≥1 non-optional swim, the longest non-optional swim is KEY; all others are supporting. Tie → later day in the week is KEY. Exceptions: Wk 5 Fri swim TT is KEY; race weeks 18, 28, 45 and Dress Rehearsal week 38 are unchanged.

**Intensity check (Z2 sessions):** For KEY and supporting bike/run sessions with target zone Z2: if avg HR > (Z2 ceiling HR + 5 bpm), credit = credit × 0.6, flag = "too hard". Activated per discipline as soon as its Z2 ceiling HR exists (set after Week 5 tests). Snapshot shows: "Intensity check: active (run ceiling X bpm, bike ceiling Y bpm)" or "Intensity check: inactive (zones not set)". Applies only to sessions on/after the date the discipline's zones were set; earlier sessions are flagged \`HR>ceiling (pre-zones)\` without credit change (CN-19 #1).

**Recovery rules (C1–C4):**

**C1. Night window:** bedtime 18:00–23:59 = evening; 00:00–05:59 = after midnight (counts as later than 23:30). Bedtimes 06:00–17:59 are naps; ignored for recovery.

**C2. Good night** = bedtime between 18:00 and 23:30 (inclusive) AND sleep ≥ 6.5 h.

**C3. Week membership** is by wake date, Mon–Sun.

**C4. Minimum data:** if a completed week has fewer than 4 nights with data, Status = "insufficient data". The in-progress week shows a colour only once it has ≥ 4 nights.

**Swap reason and matching (A1–A5):**

A1. "swapped" is an additional session reason. When selected in the Logger UI, two extra fields appear: "Replaced planned session" (dropdown of non-optional planned sessions in the current week) and an optional free-text Note.

A2. A swapped session is matched to the planned session the athlete selected, regardless of discipline. Scoring uses the planned session's duration, tier, and weight.

A3. Swap constraints (enforced in the UI; if violated, show an error and do not save):
- The replaced planned session must be in the same Mon–Sun week as the logged session.
- If a non-optional planned session for the logged discipline exists on the same day, its tier must be lower than the replaced session's tier.
- If the replaced planned session is KEY, no non-optional planned session for the logged discipline may exist in the same week.

A4. The session log Status column shows "swapped (swim → bike)" or similar for the logged row; the replaced planned session row shows "covered by swap".

A5. The matched planned session is considered covered (not pending or missed).

**Swim swap alert (B1–B2):**

B1. If any swim session (KEY or supporting) is replaced by a non-swim session via a swap in the current week, add a line in the session log section: "Note: N swim session(s) swapped to other discipline this week."

B2. If 2 or more swim sessions are swapped to a non-swim discipline within any 14-day window, add a line at the top of the snapshot (below any pain alert): "⚠ Swim swap pattern: N swim sessions replaced in 14 days — coach review."

**Snapshot session log (C1–C3):**

C1. The planned session row that was replaced shows "covered by swap" in the Status column.

C2. The logged session row shows "swapped (from→to)" in the Status column with the discipline it replaced.

C3. Swapped sessions are NOT shown in the Extra sessions subsection. They are shown inline with the planned sessions they replaced (two consecutive rows per swap).

**Duration source (CN-10 #1, rules 1–5):**

1. Import and store all three Garmin time fields on \`logged_sessions\`: \`moving_min\`, \`timer_min\` (Garmin "Time"), \`elapsed_min\`. Backfill every existing logged session from the raw source.
2. \`duration_min\` (used for scoring, the weekly actual hours, fueling day-type, longest-session stats and gate evidence) is selected by type:
   - bike and run (outdoor and indoor) → \`moving_min\`
   - swim (pool and open water) → \`timer_min\`
   - strength / other → \`timer_min\`
   - planned types brick_run, race_simulation, race, and any multisport/triathlon activity → \`elapsed_min\`
3. Fallback: if the selected field is null or 0, use \`timer_min\`, then \`elapsed_min\`. Add the flag \`dur-fallback\` to the Session Log Note column.
4. Pace and speed always use the same minutes as \`duration_min\`.
5. Past weeks are rescored automatically under the new durations. This is expected. Do not freeze the old scores.

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
| Swim distance | miles | Stored in miles; displayed in metres in snapshot (× 1,609.34); pool_length_m stored per session; 25 yd = 22.86 m |
| Run pace | min:ss / mi | duration_min ÷ distance_miles, formatted MM:SS |
| Swim pace | min:ss / 100 m | convert miles → metres (× 1,609.34), then per 100 m |
| Bike speed | mph | distance_miles ÷ (duration_min ÷ 60) |
| Power | W (watts) | |
| Heart rate | bpm | |
| Body weight | lb | |
| Body fat | % | Scale = directional only; DEXA is ground truth |
| HRV | ms | Garmin "Avg Overnight HRV" |
| Body Battery | 0–100 | Garmin proprietary score |
| Duration source | moving (bike/run), timer (swim/strength), elapsed (race/race_sim/brick) | Fallback with \`dur-fallback\` flag per CN-10 #1 rule 3 |
| Power source | Keiser M3 TCX (bike, indoor) | merged onto Garmin session; never a separate logged_session row |

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
| 2026-10-05 | **CN-5 #7** — Recovery Wk 29 (515 min, all Z1–Z2). Wk 39: Thu long_run→easy 50, Sun long_run 150 KEY. Wk 41: Sat 240 KEY, Thu long_run 150 KEY. Wks 42–44 taper replaced with race-pace structure (525/385/305 min). 14 h cap now applies to swim+bike+run only (strength excluded). Masters strength 30 min Wed optional added Wks 30–41 (excl. cutback Wks 32/36/40 and DR Wk 38). Build spec load rule, A/B layout, taper section updated |
| 2026-10-05 | **CN-5 #8** — Session reason field (A1–A3): completed/life/equipment/illness/pain/coach-adjusted/other; stored in logged_sessions.reason. Excused sessions (B1–B4): illness/pain/coach-adjusted removed from numerator+denominator, no KEY-missed cap. Pain alert (C1–C3): ≥2 pain sessions in any 14-day window → alert at top of snapshot. Extra sessions (D1–D5): unplanned sessions in separate subsection; makeup-auth mechanism; D5 note if >90 min unplanned/week. Build spec D A1–D5 added; changelog updated |
| 2026-10-05 | **CN-5 #9** — Swap reason: "swapped" added to session reason field; cross-discipline matching via swap_planned_id/swap_planned_discipline columns on logged_sessions. Swap constraints A3 enforced in Logger UI. Snapshot session log shows "covered by swap" (planned row) and "swapped (from→to)" (logged row). Swim swap note if any swim swapped this week; swim swap alert (≥2 in 14 days) at top of snapshot. Raw Garmin lines (RHR/HRV/Body Battery/Sleep Score) stripped from Athlete Notes section (already in Wellness table). Build spec D swap rules A1–C3 added; changelog updated |
| 2026-10-05 | **CN-5 #10** — Swim continuity progression: target_distance_m column added to planned_sessions. Thu swims Wks 6–11 type→endurance_continuous with targets 200/300/400/450/600/750m; Wk 8 stays time_trial (400m TT); Wk 12 stays continuous_test (1,000m gate). Tue swims Wk 6+ note updated to bilateral breathing drill focus. Session log Note column shows "Target: Xm non-stop" for endurance_continuous swims. Snapshot Benchmarks gains "Swim continuity" line (best 30-day unbroken, Week 12 gate, On track Y/N). Build spec changelog updated |
| 2026-10-06 | **CN-6 #1** — Pass 4 (optional sessions) added to 4-pass greedy matching: runs after Passes 1–3, uses unconsumed logs, same day first then ±2 days same Mon–Sun week, same discipline. Optional matches excluded from score numerator/denominator. "Str done/pl" weekly column and session log now read from same match result. Build spec section D renamed to 4-pass; Pass 4 row added |
| 2026-10-06 | **CN-6 #2** — Plan version in snapshot header read from plans table (was previously showing stale v7; plans table updated to v8 for Plan ID 10) |
| 2026-10-06 | **CN-6 #3** — Swim continuity fallback: when no qualifying swim exists in 30-day window, line reads exactly "Swim continuity: no unbroken swim recorded in last 30 days \| Week 12 gate: 1,000m \| On track: UNKNOWN" |
| 2026-10-06 | **CN-7 #1** — Pass 1 eligibility changed to non-optional only. Optional sessions match only in Pass 4 (after Passes 1–3, on unconsumed logs). Build Spec D Pass 1 row updated to "All non-optional". Snapshot-generator.js Pass 1 (14-day matching) aligned to exclude optional. |
| 2026-10-06 | **CN-7 #2** — Score Breakdown optional rows: Weight, Credit%, and Points columns show "—" instead of 1 / 0% / 0.0. Ratio still shown. Flags keep "optional" (and "missed" where applicable). Totals unchanged. |
| 2026-10-06 | **CN-7 #3** — Build Spec "Last changed:" and snapshot header "Spec changed:" now derived from SPEC_CHANGED_DATE constant (latest changelog row date) in build-spec-generator.js; snapshot-generator.js imports and uses it. |
| 2026-10-06 | **CN-8 #1** — Removed duplicate 4-pass matching logic from snapshot-generator.js (Pass 1–4, swap pre-pass, hasEarlierPlan guard, days14/pickBest14/wsFor14 helpers). Session Log, Score Breakdown, Weekly Scores and Str done/pl all now consume the match result from computeScore (src/core/scoring/index.js). No behaviour change. |
| 2026-10-07 | **CN-9 #1** — Session Log full-week matching fix: per-week computeScore calls now query the DB directly for the full Mon–Sun range instead of filtering the pre-clipped 14-day array. Fixes wrong matches when since14 falls mid-week (e.g., Sep 24 mid-week caused logs Sep 21–23 to be excluded from matching). Extra Sessions = logs within window left unmatched by full-week matching. No scoring changes. |
| 2026-10-12 | **CN-10 #1** — Duration source: three Garmin time fields (moving_min, timer_min, elapsed_min) added to logged_sessions and backfilled. duration_min selected by type: bike/run → moving, swim/strength/other → timer, race types → elapsed. Fallback to timer/elapsed with dur-fallback flag in Note. 5 run sessions rescored (shorter moving times). 5 indoor-cycling sessions flagged dur-fallback. Build spec D Duration source subsection + F Units row added. |
| 2026-10-12 | **CN-10 #2** — km→mi history check: fixed bike and other-discipline (Golf/Walking/Hiking) distances that were inflated ×1.60934; swim distances were wrongly stored as raw_m/1000 (km) and are fixed under CN-10 #3. Permanent importer check added: distanceUnit must be km, m, or mi. |
| 2026-10-12 | **CN-10 #3** — Swim distances corrected: was raw_m/1000 (km, inflated ×1.609 when displayed). Converted all 11 swim rows from raw metres (raw_m × 0.000621371). Pipeline updated to store swim distance in miles. Longest swim and Swim continuity lines now show correct metres. AT1 invariant: snapshot metres = raw metres ±0 m for all 11 swims. |
| 2026-10-12 | **CN-10 #4** — AT harness bug: CN-10 #1 AT3/AT7 were run against plan_id=1 (superseded) instead of plan_id=10 (active). Corrected AT3: plan=70 actual=87 124% credit=100% no overshoot. Corrected AT7 new: 35 D / 68 C / 69 C / 68 C; old: 35 D / 68 C / 64 C / 68 C. All future AT queries read plan_id from plans table. |
| 2026-10-12 | **CN-10 #5** — Swim continuity: was using session total distance as proxy for "unbroken freestyle." Changed to use Garmin length-level data from \`swim_lengths\` table only. If no length data exists for last 30 days, line reads "UNKNOWN (no length data, last 30 days)" and On track = UNKNOWN. On-track targets by week added to Build Spec H (Wks 1–6=200m, Wk7=300, Wk8=400, Wk9=450, Wk10=600, Wk11=750, Wk12+=1000). Old fallback "no unbroken swim recorded" removed. |
| 2026-10-12 | **CN-10 #6** — Gate evidence: test-based gates (baselines_w5, continuous_1000m, ftp_retest_w16, continuous_1500m, run_tt_retest_w24) now show only sessions matched to ftp_test/time_trial/continuous_test planned sessions in gate week + Benchmarks, not all sessions. baselines_w5 special format: FTP/swim TT/run TT each "recorded N / not recorded". Build Spec C gate evidence rules updated. |
| 2026-10-12 | **CN-10 #7** — Swim length import (feature-freeze exception): \`swim_lengths\` table created (logged_session_id, length_index, length_type, stroke, distance_m, duration_s). \`fit-file-parser\` added; \`src/importer/fit-swim.js\` parses Garmin FIT length messages. Athlete-reported fallback: notes containing "unbroken: Xm" used when no FIT data. Session Log Note appends unbroken value. Swim continuity uses max of FIT and athlete-reported over last 30 days. All 11 current swims have no FIT file; athlete must download from Garmin Connect. Build Spec H updated. |
| 2026-10-14 | **CN-11 #1** — Wk 5 FTP test moved Wed→Sat: Wed 2026-10-14 bike ftp_test KEY→technique_indoor supporting Z2 aerobic_base (CN-11 note). Sat 2026-10-17 bike endurance_z2 KEY→ftp_test KEY Z4 testing (15 min warm-up, 20 min all-out, Z2 cool-down to 100 min). Plan ID 10 edited in place; no version bump (direct DB edit). Build Spec A Special weeks Wk 5 updated. |
| 2026-10-15 | **CN-13 #1** — Wk 5 swim TT moved Thu→Fri: Thu 2026-10-15 swim time_trial KEY→optional technique Z1 (note CN-13). Fri 2026-10-16 swim technique supporting→time_trial key Z2 testing 400m. K1 exception updated: Thu→Fri. Build Spec A/D K1 exception text updated. |
| 2026-10-15 | **CN-14 #1** — Wk 5 run TT moved Thu→Sun: Thu 2026-10-15 run time_trial KEY→moved to Sun 2026-10-18 (zone Z4, same type/tier/duration). Wk 5 now: Wed Z2 bike (S), Fri swim TT KEY, Sat FTP test KEY, Sun run TT KEY. Build Spec A Special weeks Wk 5 updated (final). |
| 2026-10-14 | **CN-12 #1** — India travel Oct 22–Nov 2: Wk 6 Thu long run moved to Sat (60 min); Wk 6 Thu swim, Fri swim, Sat bike → optional; K1 re-derived: Tue 2026-10-20 swim → KEY. Wk 7 all swims + bikes → optional; runs unchanged. Wk 8 Thu swim time_trial→technique Z2 (target_distance_m cleared); K1 confirms KEY. Wk 9 Thu swim endurance_continuous→time_trial 40 min Z3 target 400m supporting (K1: Tue+Fri 50 min win). Build Spec A gate tests Wk 8 TT→Wk 9; Special weeks Wks 6–7 added. |
| 2026-10-16 | **CN-15 #1** — Wk 5 400m swim TT recorded 14:48 (3:42/100m), 2 wall stops; continuity 200m. Data entry only. |
| 2026-10-16 | **CN-15 #2** — Wk 5 swim TT effort context: controlled/continuity-first (avg HR 115, max 139). Wk 9 Thu swim TT note updated: same protocol, record time/stops/unbroken. |
| 2026-10-16 | **CN-15 #3** — FIT length data imported for 2026-10-16 swim; continuity now measured. |
| 2026-10-17 | **CN-16 #1** — Wk 5 baselines rescheduled: FTP to 2026-10-18, run TT to 2026-10-20 (replaces easy run). **VOID (CN-18 #1)** |
| 2026-10-18 | **CN-18 #1** — Wk 5 tests swapped: run TT done 2026-10-17 (3.58 mi, LTHR 150), FTP 2026-10-18. CN-16 #1 void. |
| 2026-10-18 | **CN-17 #1** — Keiser M3 TCX import + Garmin HR merge; FTP auto-extracted from 20-min window (lap first, else best rolling). |
| 2026-10-18 | **CN-19 #1** — Intensity check forward-only: "too hard" applies only on/after the date zones were set; earlier sessions flagged \`HR>ceiling (pre-zones)\` with no credit change. |
| 2026-10-18 | **CN-19 #2** — Zone bands contiguous: lower = previous upper + 1, Z5 min = Z4 upper + 1 (applies to run HR, bike HR, bike power). |
| 2026-10-18 | **CN-20 #1** — FTP from Keiser power alone: for ftp_test sessions always compute P (best 20-min rolling window); write FTP benchmark source \`auto: keiser\`. Bike LTHR and HR zones set only when HR stream ≥ 90% covers window; until then flag \`HR incomplete\`. When FIT arrives later, recompute H and upgrade source to \`auto: keiser+garmin\`. Snapshot block shows \`20-min window: start +MM:SS, P = N W\`. |
| 2026-10-18 | **CN-20 #2** — Idempotency per source file: \`import_files\` table (sha256, path, source, logged_session_id, imported_at); skip file only if sha256 present. New file on existing session merges by \`t_utc\` (Keiser fills power/cadence; Garmin fills HR). UNIQUE constraint on \`(logged_session_id, t_utc)\` in \`bike_streams\`. |
| 2026-10-18 | **CN-20 #3** — Session Log Note cleanup: empty brackets \`[]\` stripped from notes at import time and at display time. |
| 2026-10-18 | **CN-21 #1** — Revert unrequested Z2-lower change; define zone boundary rules: Z2 lower = halfUp(Z2 lower % × threshold); Z1 = \`< Z2 lower\`; Z3/Z4 lower = previous upper + 1; Z5 = \`≥ Z4 upper + 1\`. Process rule: unrequested behaviour changes must be listed in the report and must not ship until approved. |
| 2026-10-18 | **CN-22 #1** — baselines_w5 set GREEN (FTP 162 W, swim 14:48, run 3.58 mi); Wk 16 FTP retest protocol pinned. |
| 2026-10-18 | **CN-23 #1** — Run LTHR 150 marked provisional; 2026-11-08 run TT retest added (Wk 8, KEY, 60 min); run_tt_retest_w24 gate updated to compare against Wk 8 retest. |
| 2026-10-19 | **CN-24 #1** — Pool 25 yd (22.86 m): all historical pool swim distances × 0.9144; pool_length_m=22.86 set on all swim sessions ≤ 2026-10-19; swim_lengths.distance_m set to 22.86; athlete-reported unbroken tokens on pool swims ≤ 2026-10-19 corrected × 0.9144 (halfUp). Swim TT renamed to 400 yd TT; pace = T ÷ 3.6576 (16 × 25 yd = 365.76 m); Wk 5 benchmark 14:48 → 4:03/100m. Wk 9 TT target 400→366 m. Importer: distanceUnit 'yd' supported; pool_length_unit 'yd' converted to m; missing pool length flagged pool-length-unknown. Build Spec F/H updated. |
| 2026-11-03 | **CN-25 #1** — Gate trajectory_review_w8 set RED: two criteria missed (Wk 6–7 KEY compliance + elbow pain >3 days). Status updated in readiness_gates; target text unchanged. |
| 2026-11-03 | **CN-25 #2** — Run TT retest moved Wk 8 → Wk 9: Sun 2026-11-08 downgraded to easy recovery 30 min supporting Z1; Sun 2026-11-15 upgraded to time_trial KEY 60 min Z4. Gate run_tt_retest_w24 target updated to "Wk 9 retest (2026-11-15)". Benchmark run_lasthr20_bpm note updated to "provisional — retest 2026-11-15". |
| 2026-11-03 | **CN-25 #3** — Wk 9 reduced to 430 min swim/bike/run (coach-tightened RED action): Tue swim 50→40, Wed bike 75→60, Thu run 95→70, Fri swim 50→40, Sat bike 130→95. Wk 10+ unchanged. |
| 2026-11-03 | **CN-25 #4** — Elbow protocol: strength rows Wks 9–11 (optional) appended "CN-25 #4: lower body + core only; no gripping/pulling loads (elbow)." No paddles; no scoring changes. |
| 2026-11-09 | **CN-26 #1** — Wk 10 re-ramp (post-travel): Thu 2026-11-19 long run 100→85 min; Sat 2026-11-21 long ride 135→120 min. Swim unchanged (limiter). |
| 2026-11-09 | **CN-26 #2** — Wk 11 re-ramp (post-travel): Thu 2026-11-26 long run 100→95 min; Sat 2026-11-28 long ride 145→130 min. All other Wk 11 rows unchanged. |
| 2026-11-09 | **CN-26 #3** — VOID (CN-26 #4) — CN-25 Build Spec items already present. |
| 2026-11-09 | **CN-26 #4** — Replaces CN-26 #3: added Weeks 10–11 special-week line to section A; CN-26 changelog rows added. CN-25 Build Spec already up-to-date per 12:33 UTC export. |
| 2026-11-13 | **CN-27 #1** — Bug fix: Session Log "pending vs missed" now uses A5 result from computeScore (spec D rule A5). Root cause: Session Log renderer was checking p.date < today → missed instead of consulting computeScore pending flags; sessions within the ±2-day grace window on the current week were incorrectly shown as missed. Fix: pendingSet14 populated from computeScore matchDetails flags; renderer checks pendingSet14 before date comparison. |
| 2026-11-13 | **CN-27 #2** — Bug fix: Weight trend (spec I C3 W1–W2) now restricted to last 30 days of weight readings. Root cause: computeWeightTrend was called with all historical rows (47 rows back to 2026-06-18), finding D_new=2026-10-13 and D_old=2026-09-23 outside the 30-day display window and reporting a stale trend. Fix: weightRowsAll filtered to date >= since30 before passing to computeWeightTrend; with only 4 rows in range, no 7-day window has ≥3 readings → insufficient data. Stop-loss C5 unchanged (already handles null trendResult). |
| 2026-11-15 | **CN-28 #1** — Bug fix: Heat map week score now reads from computeScore (spec D) via IPC stats:heatmap. Root cause: Calendar.jsx computeWeekCompliance() was a parallel renderer-side scoring engine missing A8 test-session credit (100% when ratio ≥ 0.50), K2 grade caps (swim<75% → C, KEY missed → B), and B1–B4 excused sessions. Fix: main.js stats:heatmap handler already called computeScore correctly; Calendar.jsx week detail badge now uses IPC heatmap data (grade, score, cap). Cache invalidated on import, rescore, and plan edit via heatmap:invalidated IPC event. Colour bands unchanged (3-band: green ≥90, amber ≥70, red <70); spec defines 4 grade letters (A/B/C/D) — no behaviour change to colours. |
| 2026-11-15 | **CN-28 #2** — Run TT retest moved Wk 9 → Wk 10: Sun 2026-11-15 run TT scored as missed (unchanged in DB). Tue 2026-11-17 downgraded from easy run 25 min Z2 supporting → time_trial KEY 60 min Z4 testing, note "CN-28 #2: run TT retest (moved from 2026-11-15)". Gate run_tt_retest_w24 target updated to "Wk 10 retest (2026-11-17)". Benchmark run_lasthr20_bpm notes updated to "provisional — retest 2026-11-17". Section A Wk 9 special-week line updated; Wks 10–11 line updated. |
| 2026-11-15 | **CN-28 #3** — Report only: Swim sessions 2026-10-16→2026-11-15: 4 sessions found (id 55: 2026-10-16, 32 lengths × 22.86m pool; id 65: 2026-10-30; id 71: 2026-11-06; id 74: 2026-11-12). Session 55 is day 31 prior to today, outside the 30-day window. FIT import is manual only (no auto-sync from Garmin). No bug; no code change. |
| 2026-11-15 | **CN-29 #3** — CN-28 unrequested changes approved (7 items): (1) zones.js Z3 lower = Z2 upper + 1 (CN-19 #2 / CN-21 #1); (2) scoring/index.js zonesDates from options, CN-19 #1 forward-only check; (3) snapshot-generator.js zonesDates passed, pendingSet14 (CN-27 #1), power-only zones when HR incomplete (CN-20 #1), 400 yd label (CN-24), gate status uppercase, weight 30-day (CN-27 #2); (4) keiser-tcx.js sha256 idempotency (CN-20 #2), cleanNotes (CN-20 #3), FTP HR recompute (CN-20 #1), FIT+TCX backfill; (5) fit-swim.js pool length null when absent; yd conversion (condition: null pool length → pool-length-unknown flag in Session Log Note, CN-24 #1); (6) pipeline.js distanceUnit 'yd'; float pool length; (7) plan-doc-generator.js gate status uppercase; notes truncation 50→120. |
| 2026-11-15 | **CN-29 #1** — Bug fix: swim distance now computed as active_lengths × pool_length_m (halfUp) for all swims with FIT length data. Root cause: Garmin CSV exports use 25 m/length for 25 yd pools; CSV importer stored as-is; CN-24 corrected historical sessions but FIT imports did not recompute distance. Fix: on each FIT swim import and on existing swims with length data, distance = halfUp(active_lengths × pool_length_m) × 0.000621371 mi. Applied to all 3 pool swims in DB: id 65 (2026-10-20) 17 active → 389 m; id 71 (2026-11-09) 25 active → 572 m; id 74 (2026-11-15) 28 active → 640 m. Pace recomputed from corrected distance. Build Spec F/H note added. |
| 2026-11-15 | **CN-29 #2** — Bug fix: swim continuity break detection updated. Root cause: TCX import only inserted active-lap records (no idle records); rule (a) idle-length break could never fire, so the whole session counted as one unbroken run. Break rules clarified (now definitive): (a) idle/rest length record; (b) non-freestyle length; (c) lap boundary (FIT lap message) between two lengths — implemented via idle record inserted between laps; (d) time gap ≥ 10 s between end of one length and start of next. Session Log Note format: \`unbroken: Xm; breaks: N\` (measured) or \`unbroken: Xm (athlete-reported)\` (fallback). Build Spec H Swim Continuity updated. |
| 2026-11-15 | **CN-29 #4** — Process rule: acceptance tests in Coaching Notes files are run exactly as numbered and worded. No substitution, renumbering, or addition in their place. Tests unreachable from exports reported as NOT RUN (not PASS). Extra checks listed separately under "Additional checks". |
| 2026-11-15 | **CN-30 #1** — Revert: "Longest swim" restored to all-time max (removed 30-day filter added in CN-29 unrequested change). CN-29 AT1 expectation was coach error; correct all-time max is 663 m (43 min) on 2026-09-08. |
| 2026-11-15 | **CN-30 #2** — Swim continuity on-track targets updated (CN-30 #2 table): Wks 1–9 unchanged; Wks 10–15 reset to 150/225/300/450/600/800 m; Wks 16–21 → 1,000 m; Wk 22+ → 1,500 m. Snapshot gate label "Week N gate: 1,000m" now reads gate week from \`readiness_gates\` (not hard-coded). Build Spec H updated. |
| 2026-11-15 | **CN-30 #3** — Plan ID 10 in place: Thu swims Wks 10–15 updated. Wk 10 (2026-11-19) target_distance_m 600→150 (7 lengths). Wk 11 (2026-11-26) 750→225 (10 lengths). Wk 12 (2026-12-03) continuous_test→endurance_continuous, target 1000→300 (14 lengths), still KEY; note adds "Wk 12 progress check (gate moved to Wk 16, CN-30 #4)". Wk 13 (2026-12-10) aerobic_intervals 25→endurance_continuous 30, target 450 (20 lengths), supporting. Wk 14 (2026-12-17) aerobic_intervals 30→endurance_continuous 35, target 600 (27 lengths), supporting. Wk 15 (2026-12-24) aerobic_intervals 30→endurance_continuous 40, target 800 (35 lengths), supporting. K1 unchanged for Wks 10–11 (Fri stays KEY). Wk 12 stays Thu KEY. Wks 13–15 Thu stays supporting (Fri 50 min > Thu). |
| 2026-11-15 | **CN-30 #4** — Swim gate moves. 1,000m gate: Wk 12→16 in readiness_gates; Wk 16 Tue 2026-12-29 aerobic_intervals 30 supporting → continuous_test 55 min KEY target 1,000m; Wk 16 Fri 2027-01-01 KEY→supporting (K1). 1,500m gate: Wk 20→22 in readiness_gates; Wk 20 Thu 2027-01-28 continuous_test→endurance_continuous target 1,200m (stays KEY); Wk 22 Thu 2027-02-11 aerobic_intervals 35 supporting → continuous_test 70 min KEY target 1,500m; Wk 22 Fri 2027-02-12 KEY→supporting (K1). Validation: Wk 22 total 715 min = 11.9 h ≤ 14 h ✓; Wk 22 vs Wk 21 (690 min): +3.6% ≤ 10% ✓. Build Spec A gate-tests and C gates table updated. |
| 2026-11-15 | **CN-30 #5** — Record only: CN-29 AT1 expectation was coach error (ignored 2026-09-08 swim); corrected by CN-30 #1. CN-29 AT8 expected 200m was wrong; 183m (8 × 22.86m) is correct (athlete-reported 200m was pre-CN-24 value, ×0.9144 → 183m); CN-29 AT8 treated as PASS. |

---

## H. Benchmarks & Zones

**Implementation:** \`src/core/scoring/zones.js\`

**Rounding:** all derived values use half-up: \`halfUp(n) = Math.floor(n + 0.5)\`

**Zone band rules (CN-19 #2, clarified CN-21 #1):**
1. Z2 lower = \`halfUp(Z2_lower_% × threshold)\`.
2. Z1 = \`< Z2 lower\` (unbounded below).
3. Z2, Z3, Z4 upper = \`halfUp(upper_% × threshold)\`. Z3 lower = Z2 upper + 1; Z4 lower = Z3 upper + 1.
4. Z5 = \`≥ Z4 upper + 1\`.
5. Applies to run HR, bike HR, and bike power zones.

### Bike FTP Test

FTP from Keiser power alone; LTHR added when HR stream arrives (CN-20 #1).

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

### Swim 400 yd TT

Input: time in mm:ss = T (converted to decimal minutes)

**Pace per 100m** = T ÷ (TT distance m ÷ 100); standard TT = 16 × 25 yd = 365.76 m. Record only; no swim zones.

### Swim Continuity (CN-10 #5 / CN-10 #7)

**Definition.** Best unbroken freestyle = the longest run of consecutive active freestyle lengths without a break, taken from the Garmin length/lap records (\`swim_lengths\` table: logged_session_id, length_index, length_type, stroke, distance_m, duration_s, start_time). Use the pool length from \`logged_sessions.pool_length_m\`.

**Break rules (CN-29 #2, effective 2026-11-15):** A run of consecutive active freestyle lengths is broken by ANY of:
- (a) an idle/rest length record (\`length_type = 'idle'\`);
- (b) a non-freestyle length (\`stroke\` not null and not containing 'free');
- (c) a lap boundary (FIT lap message between two lengths) — recorded as an idle record between laps;
- (d) a time gap ≥ 10 s between the end of one length (\`start_time + duration_s\`) and the start of the next.

**Data sources (CN-10 #7):**
1. **Measured (FIT):** \`swim_lengths\` rows imported via \`src/importer/fit-swim.js\` from Garmin FIT files. Takes priority over athlete-reported.
2. **Athlete-reported (fallback):** if a swim session has no \`swim_lengths\` rows but its \`logged_sessions.notes\` contains the token \`unbroken: Xm\` (case-insensitive, integer metres), that value is used. Display appends \` (athlete-reported)\` to the source description.
3. **Session Log Note** appends \`unbroken: Xm; breaks: N\` (measured) or \`unbroken: Xm (athlete-reported)\` (fallback) for swim sessions that have a value. Swims with no data get no appended token.
4. **Swims with no FIT file:** listed by date in the CN-10 #7 report so the athlete can download originals from Garmin Connect.

**Last changed:** 2026-11-15

**Display rules (snapshot Benchmarks line):**

1. If the best unbroken metres over the last 30 days is available (FIT or athlete-reported): \`Swim continuity: Xm (best unbroken freestyle [source], last 30 days) | Week N gate: 1,000m | On track: YES/NO\` (gate week N read from \`readiness_gates\` metric \`continuous_1000m\`, CN-30 #2)
2. If no source exists for any swim in the last 30 days: \`Swim continuity: UNKNOWN (no length data, last 30 days) | Week N gate: 1,000m | On track: UNKNOWN\`
3. On track = YES if best unbroken metres ≥ the continuity target for the current plan week, otherwise NO.

**On-track targets by week (CN-30 #2):**

| Weeks | Target (m) |
|---|---|
| 1–6 | 200 |
| 7 | 300 |
| 8 | 400 |
| 9 | 450 |
| 10 | 150 |
| 11 | 225 |
| 12 | 300 |
| 13 | 450 |
| 14 | 600 |
| 15 | 800 |
| 16–21 | 1,000 |
| 22+ | 1,500 |

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

module.exports = { generateBuildSpec, SPEC_CHANGED_DATE }
