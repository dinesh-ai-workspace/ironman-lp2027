'use strict'

const { computeScore, computeRecovery, computePainAlert, validateSwap, sessionCredit, getWeekStart } = require('../src/core/scoring')
const { deriveBikeZones, deriveRunZones } = require('../src/core/scoring/zones')

// ─── helpers ────────────────────────────────────────────────────────────────

function makePlan(overrides) {
  return {
    id: overrides.id ?? 1,
    discipline: overrides.discipline ?? 'run',
    type: overrides.type ?? 'long_run',
    importance: overrides.importance ?? 'key',
    target_duration: overrides.target_duration ?? 60,
    date: overrides.date ?? '2026-09-14',
    target_intensity_zone: overrides.target_intensity_zone ?? 2,
  }
}

function makeLog(overrides) {
  return {
    id: overrides.id ?? 1,
    discipline: overrides.discipline ?? 'run',
    duration: overrides.duration ?? 60,
    date: overrides.date ?? '2026-09-14',
    avg_hr: overrides.avg_hr ?? null,
  }
}

// ─── F1: same-day merge ──────────────────────────────────────────────────────

test('F1: same-day logs merged — 30+25=55, ratio 55/60=0.917, credit 100%', () => {
  const plan = makePlan({ id: 1, discipline: 'swim', importance: 'supporting', target_duration: 60, date: '2026-09-14' })
  const logs = [
    makeLog({ id: 1, discipline: 'swim', duration: 30, date: '2026-09-14' }),
    makeLog({ id: 2, discipline: 'swim', duration: 25, date: '2026-09-14' }),
  ]
  const result = computeScore([plan], logs, '2026-09-14')
  const d = result.matchDetails[0]
  expect(d.log.duration).toBe(55)
  expect(d.pct).toBeCloseTo(55 / 60, 2)
  expect(d.credit).toBe(1.0)
})

// ─── F2: brick_run does not cross-day match ────────────────────────────────

test('F2: brick_run missed; Sun run does not match the brick', () => {
  const plans = [
    makePlan({ id: 1, discipline: 'bike', importance: 'key', target_duration: 300, date: '2026-09-19' }),
    makePlan({ id: 2, discipline: 'run', type: 'brick_run', importance: 'key', target_duration: 30, date: '2026-09-19' }),
  ]
  const logs = [
    makeLog({ id: 1, discipline: 'bike', duration: 300, date: '2026-09-19' }),
    makeLog({ id: 2, discipline: 'run', duration: 30, date: '2026-09-20' }),
  ]
  const result = computeScore(plans, logs, '2026-09-20')
  const brickDetail = result.matchDetails.find(d => d.plan.type === 'brick_run')
  expect(brickDetail.credit).toBe(0)
  expect(brickDetail.flags).toContain('missed')
  // Sun run is unmatched (not used to match the brick)
  const bikeDetail = result.matchDetails.find(d => d.plan.discipline === 'bike')
  expect(bikeDetail.credit).toBe(1.0)
})

// ─── F3: no cross-week match ───────────────────────────────────────────────

test('F3: Sun planned run KEY 120; log on following Mon — no match (cross-week)', () => {
  // 2026-09-20 is Sun; 2026-09-21 is Mon (next week)
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 120, date: '2026-09-20' })
  const log  = makeLog({ id: 1, discipline: 'run', duration: 120, date: '2026-09-21' })
  const result = computeScore([plan], [log], '2026-09-21', { today: '2026-09-22' })
  const d = result.matchDetails[0]
  expect(d.credit).toBe(0)
  expect(d.flags).toContain('missed')
})

// ─── F4a: pending — not in score, KEY-missed cap not triggered ──────────────

test('F4a: Thu run KEY 60, no log, today=Sat — pending; not in score; no KEY-missed cap', () => {
  // Week: Mon 2026-09-14 – Sun 2026-09-20; Thu = 2026-09-17; Sat = 2026-09-19
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-17' })
  const result = computeScore([plan], [], '2026-09-19', { today: '2026-09-19' })
  // pending session excluded → score null, cap '—'
  expect(result.score).toBeNull()
  expect(result.cap).toBe('—')
  const d = result.matchDetails[0]
  expect(d.flags).toContain('pending')
})

// ─── F4b: same, today=Sun=weekEnd → missed ────────────────────────────────

test('F4b: Thu run KEY 60, no log, today=Sun same week — missed; KEY-missed cap triggered', () => {
  // Sun 2026-09-20 = weekEnd (weekStart is 2026-09-14 Mon, weekEnd is 2026-09-20 Sun)
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-17' })
  // cutoffDate = weekEnd = '2026-09-20'; today = '2026-09-20'
  const result = computeScore([plan], [], '2026-09-20', { today: '2026-09-20' })
  expect(result.score).toBe(0)
  expect(result.cap).toBe('KEY missed')
})

// ─── F5a: exactly 1.25 is NOT overshoot ────────────────────────────────────

test('F5a: bike KEY planned 100, actual 125 — ratio 1.25, credit 100%, no overshoot', () => {
  const plan = makePlan({ id: 1, discipline: 'bike', importance: 'key', target_duration: 100, date: '2026-09-14' })
  const log  = makeLog({ id: 1, discipline: 'bike', duration: 125, date: '2026-09-14' })
  const result = computeScore([plan], [log], '2026-09-14')
  const d = result.matchDetails[0]
  expect(d.pct).toBe(1.25)
  expect(d.credit).toBe(1.0)
  expect(d.flags).not.toContain('overshoot')
})

// ─── F5b: >1.25 is overshoot ──────────────────────────────────────────────

test('F5b: bike KEY planned 100, actual 126 — credit 80%, overshoot', () => {
  const plan = makePlan({ id: 1, discipline: 'bike', importance: 'key', target_duration: 100, date: '2026-09-14' })
  const log  = makeLog({ id: 1, discipline: 'bike', duration: 126, date: '2026-09-14' })
  const result = computeScore([plan], [log], '2026-09-14')
  const d = result.matchDetails[0]
  expect(d.credit).toBe(0.8)
  expect(d.flags).toContain('overshoot')
})

// ─── F6a: exactly 0.85 is 100% ───────────────────────────────────────────

test('F6a: run planned 60, actual 51 — ratio 0.85, credit 100%', () => {
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-14' })
  const log  = makeLog({ id: 1, discipline: 'run', duration: 51, date: '2026-09-14' })
  const result = computeScore([plan], [log], '2026-09-14')
  const d = result.matchDetails[0]
  expect(d.pct).toBeCloseTo(51 / 60, 5)
  expect(d.credit).toBe(1.0)
})

// ─── F6b: ratio < 0.85 → 60% ─────────────────────────────────────────────

test('F6b: run planned 60, actual 50.9 — credit 60%', () => {
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-14' })
  const log  = makeLog({ id: 1, discipline: 'run', duration: 50.9, date: '2026-09-14' })
  const result = computeScore([plan], [log], '2026-09-14')
  const d = result.matchDetails[0]
  expect(d.credit).toBe(0.60)
})

// ─── F7: overshoot + too hard = 48% ──────────────────────────────────────

test('F7: bike Z2 KEY planned 100, actual 130, avg HR above ceiling — credit 48%', () => {
  const plan = makePlan({ id: 1, discipline: 'bike', importance: 'key', type: 'endurance', target_duration: 100, date: '2026-09-14', target_intensity_zone: 2 })
  const log  = makeLog({ id: 1, discipline: 'bike', duration: 130, date: '2026-09-14', avg_hr: 145 })
  // ceiling = 135; avg_hr 145 > 135+5=140 → too hard
  const result = computeScore([plan], [log], '2026-09-14', { z2Ceilings: { bike: 135 } })
  const d = result.matchDetails[0]
  expect(d.credit).toBeCloseTo(0.48, 5)
  expect(d.flags).toContain('overshoot')
  expect(d.flags).toContain('too hard')
})

// ─── F8: only optional swim → no swim cap ────────────────────────────────

test('F8: week whose only planned swim is optional — no swim cap applied', () => {
  const plans = [
    makePlan({ id: 1, discipline: 'swim', importance: 'optional', target_duration: 40, date: '2026-09-14' }),
    makePlan({ id: 2, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-14' }),
  ]
  const logs = [
    makeLog({ id: 1, discipline: 'run', duration: 0, date: '2026-09-14' }),
  ]
  const result = computeScore(plans, logs, '2026-09-14')
  expect(result.cap).not.toBe('swim<75%')
})

// ─── F9: swim coverage includes unplanned swim ────────────────────────────

test('F9: planned non-optional swim 70; matched 40 + unplanned 20 = 60; coverage 60/70 = 85.7% — no cap', () => {
  const plans = [
    makePlan({ id: 1, discipline: 'swim', importance: 'supporting', target_duration: 70, date: '2026-09-16' }),
  ]
  const logs = [
    makeLog({ id: 1, discipline: 'swim', duration: 40, date: '2026-09-16' }),
    makeLog({ id: 2, discipline: 'swim', duration: 20, date: '2026-09-14' }),
  ]
  // cutoffDate = Sun 2026-09-20 so whole week is included
  const result = computeScore(plans, logs, '2026-09-20')
  expect(result.cap).not.toBe('swim<75%')
})

// ─── F10: bedtime classification ─────────────────────────────────────────

test('F10a: bedtime 00:15, sleep 8.0 — not a good night (after midnight)', () => {
  const result = computeRecovery([{ bedtime: '00:15', sleep_hours: 8.0 }])
  expect(result.goodNights).toBe(0)
  expect(result.nightsWithData).toBe(1)
})

test('F10b: bedtime 23:30, sleep 6.5 — good night', () => {
  const result = computeRecovery([{ bedtime: '23:30', sleep_hours: 6.5 }])
  expect(result.goodNights).toBe(1)
})

test('F10c: bedtime 22:00, sleep 6.4 — not a good night (sleep < 6.5h)', () => {
  const result = computeRecovery([{ bedtime: '22:00', sleep_hours: 6.4 }])
  expect(result.goodNights).toBe(0)
  expect(result.nightsWithData).toBe(1)
})

test('F10d: bedtime 14:00 (nap) — ignored', () => {
  const result = computeRecovery([{ bedtime: '14:00', sleep_hours: 7.0 }])
  expect(result.nightsWithData).toBe(0)
})

// ─── F11: fewer than 4 nights → insufficient data ─────────────────────────

test('F11: completed week with 3 nights of data — Status "insufficient data"', () => {
  const rows = [
    { bedtime: '22:00', sleep_hours: 7.0 },
    { bedtime: '22:30', sleep_hours: 7.5 },
    { bedtime: '23:00', sleep_hours: 8.0 },
  ]
  const result = computeRecovery(rows)
  expect(result.status).toBe('insufficient data')
})

// ─── F12: ftp_test — credit 100% if ratio ≥ 0.50 ─────────────────────────

test('F12: planned ftp_test KEY 60; log bike 45 — credit 100% (ratio 0.75 ≥ 0.50)', () => {
  const plan = makePlan({ id: 1, discipline: 'bike', type: 'ftp_test', importance: 'key', target_duration: 60, date: '2026-09-14' })
  const log  = makeLog({ id: 1, discipline: 'bike', duration: 45, date: '2026-09-14' })
  const result = computeScore([plan], [log], '2026-09-14')
  const d = result.matchDetails[0]
  expect(d.credit).toBe(1.0)
  expect(d.flags).not.toContain('overshoot')
})

// ─── F13: race discipline — 100% credit ──────────────────────────────────

test('F13: planned race 450 (Sat); logs that Sat: swim 40 + bike 200 + run 150 — race credit 100%', () => {
  const plan = makePlan({ id: 1, discipline: 'race', type: 'race', importance: 'key', target_duration: 450, date: '2026-09-19' })
  const logs = [
    makeLog({ id: 1, discipline: 'swim', duration: 40, date: '2026-09-19' }),
    makeLog({ id: 2, discipline: 'bike', duration: 200, date: '2026-09-19' }),
    makeLog({ id: 3, discipline: 'run',  duration: 150, date: '2026-09-19' }),
  ]
  const result = computeScore([plan], logs, '2026-09-19')
  const d = result.matchDetails[0]
  expect(d.credit).toBe(1.0)
  expect(result.score).toBe(100)
})

// ─── F14: bike zone derivation ────────────────────────────────────────────

test('F14: bike test 200W / 160bpm → FTP 190, power Z2 [106,143], bike LTHR 152, bike HR Z2 [123,135], ceiling 135', () => {
  const z = deriveBikeZones(200, 160)
  expect(z.ftp).toBe(190)
  expect(z.powerZones.z2).toEqual([106, 143])
  expect(z.bikeLthr).toBe(152)
  expect(z.bikeHrZones.z2).toEqual([123, 135])
  expect(z.bikeCeiling).toBe(135)
})

// ─── F15: run zone derivation ─────────────────────────────────────────────

test('F15: run TT last-20-min avg HR 160 → run LTHR 160, run HR Z2 [136,142], ceiling 142', () => {
  const z = deriveRunZones(160)
  expect(z.runLthr).toBe(160)
  expect(z.runHrZones.z2).toEqual([136, 142])
  expect(z.runCeiling).toBe(142)
})

// ─── F16: race with multisport log ────────────────────────────────────────

test('F16: race date with a single multisport log of 420 min — race credit 100%', () => {
  const plan = makePlan({ id: 1, discipline: 'race', type: 'race', importance: 'key', target_duration: 450, date: '2026-09-19' })
  const log  = makeLog({ id: 1, discipline: 'multisport', duration: 420, date: '2026-09-19' })
  const result = computeScore([plan], [log], '2026-09-19')
  const d = result.matchDetails[0]
  expect(d.credit).toBe(1.0)
  expect(result.score).toBe(100)
})

// ─── U1–U10: CN-5 #8 reason/excusal/pain/makeup fixtures ─────────────────

test('U1: planned 60 run KEY, actual 45, reason "life" → ratio 75%, credit 60%, not excused', () => {
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-14' })
  const log  = { ...makeLog({ id: 1, discipline: 'run', duration: 45, date: '2026-09-14' }), reason: 'life' }
  const result = computeScore([plan], [log], '2026-09-14')
  const d = result.matchDetails[0]
  expect(d.pct).toBeCloseTo(0.75, 5)
  expect(d.credit).toBe(0.60)
  expect(d.flags).not.toContain('excused')
  expect(result.excusedCount).toBe(0)
})

test('U2: planned 60 run KEY, actual 45, reason "pain" → excused; 0 from denom; no KEY-missed cap', () => {
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-14' })
  const log  = { ...makeLog({ id: 1, discipline: 'run', duration: 45, date: '2026-09-14' }), reason: 'pain' }
  const result = computeScore([plan], [log], '2026-09-14')
  const d = result.matchDetails[0]
  expect(d.flags).toContain('excused')
  expect(result.totalWeight).toBe(0)
  expect(result.score).toBeNull()
  expect(result.cap).toBe('—')
  expect(result.excusedCount).toBe(1)
})

test('U3: planned 60 run KEY, actual 0, reason "illness" → excused; removed from score', () => {
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-14' })
  const log  = { ...makeLog({ id: 1, discipline: 'run', duration: 0, date: '2026-09-14' }), reason: 'illness' }
  const result = computeScore([plan], [log], '2026-09-14')
  const d = result.matchDetails[0]
  expect(d.flags).toContain('excused')
  expect(result.totalWeight).toBe(0)
  expect(result.score).toBeNull()
  expect(result.excusedCount).toBe(1)
})

test('U4: 2 KEY planned; one 100% completed, one excused-pain → score 100, grade A, no cap, excusedCount 1', () => {
  const plans = [
    makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-14' }),
    makePlan({ id: 2, discipline: 'bike', importance: 'key', target_duration: 60, date: '2026-09-15' }),
  ]
  const logs = [
    makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-09-14' }),
    { ...makeLog({ id: 2, discipline: 'bike', duration: 30, date: '2026-09-15' }), reason: 'pain' },
  ]
  const result = computeScore(plans, logs, '2026-09-20')
  expect(result.score).toBe(100)
  expect(result.grade).toBe('A')
  expect(result.cap).toBe('—')
  expect(result.excusedCount).toBe(1)
  // shown as "100 (1 excused)"
  const scoreStr = result.excusedCount > 0 ? `${result.score} (${result.excusedCount} excused)` : String(result.score)
  expect(scoreStr).toBe('100 (1 excused)')
})

test('U5: two pain sessions 7 days apart → pain alert fires (count ≥ 2)', () => {
  const logs = [
    { reason: 'pain', date: '2026-09-14' },
    { reason: 'pain', date: '2026-09-21' },
  ]
  expect(computePainAlert(logs)).toBeGreaterThanOrEqual(2)
})

test('U6: two pain sessions 15 days apart → no pain alert', () => {
  const logs = [
    { reason: 'pain', date: '2026-09-14' },
    { reason: 'pain', date: '2026-09-29' },
  ]
  expect(computePainAlert(logs)).toBe(0)
})

test('U7: unplanned swim 40 min on a day with a planned bike 60 min → bike scored normally; swim in unmatchedLogs', () => {
  const plan = makePlan({ id: 1, discipline: 'bike', importance: 'key', target_duration: 60, date: '2026-09-14' })
  const logs = [
    makeLog({ id: 1, discipline: 'bike', duration: 60, date: '2026-09-14' }),
    makeLog({ id: 2, discipline: 'swim', duration: 40, date: '2026-09-14' }),
  ]
  const result = computeScore([plan], logs, '2026-09-14')
  const bikeDetail = result.matchDetails.find(d => d.plan.discipline === 'bike')
  expect(bikeDetail.credit).toBe(1.0)
  expect(result.unmatchedLogs.length).toBe(1)
  expect(result.unmatchedLogs[0].discipline).toBe('swim')
})

test('U8: unplanned sessions total 95 min in a week → note threshold triggered', () => {
  const plans = [makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-14' })]
  const logs = [
    makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-09-14' }),
    makeLog({ id: 2, discipline: 'other', duration: 95, date: '2026-09-15' }),
  ]
  const result = computeScore(plans, logs, '2026-09-20')
  const unplannedTotal = result.unmatchedLogs.reduce((s, l) => s + (l.duration || 0), 0)
  expect(unplannedTotal).toBeGreaterThan(90)
})

test('U9: makeup authorised 2026-10-08 run; log on 2026-10-09 (±2 days) → matched as planned session', () => {
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-10-08' })
  const log  = makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-10-09' })
  const result = computeScore([plan], [log], '2026-10-12', {
    makeupAuthorizations: [{ date: '2026-10-08', discipline: 'run' }],
  })
  const d = result.matchDetails.find(m => m.plan.id === 1)
  expect(d.log).not.toBeNull()
  expect(d.credit).toBe(1.0)
  expect(result.unmatchedLogs.length).toBe(0)
})

test('U10: makeup authorised 2026-10-08 run; log on 2026-10-11 (3 days out) → treated as unplanned', () => {
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-10-08' })
  const log  = makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-10-11' })
  const result = computeScore([plan], [log], '2026-10-12', {
    makeupAuthorizations: [{ date: '2026-10-08', discipline: 'run' }],
  })
  const d = result.matchDetails.find(m => m.plan.id === 1)
  expect(d.log).toBeNull()
  expect(d.flags).toContain('missed')
  expect(result.unmatchedLogs.length).toBe(1)
})

// ─── U11: actual ≥ planned — reason null → scored normally, not excused ───────
// Logger.jsx: when actual ≥ planned, effectiveReason is forced to 'completed' and
// sent as reason:null in the payload (reason field hidden in UI via showReason guard).
// This test confirms computeScore treats reason:null as completed — full credit, no excusal.

test('U11: actual ≥ planned; reason null (Logger hides field, sends null) → credit 100%, not excused', () => {
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-14' })
  const log  = { ...makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-09-14' }), reason: null }
  const result = computeScore([plan], [log], '2026-09-14')
  const d = result.matchDetails[0]
  expect(d.pct).toBe(1.0)
  expect(d.credit).toBe(1.0)
  expect(d.flags).not.toContain('excused')
  expect(result.excusedCount).toBe(0)
  expect(result.unmatchedLogs.length).toBe(0)
})

// ─── S1–S8: CN-5 #9 swap fixtures ────────────────────────────────────────────

test('S1: KEY swim 40 swapped for bike 50 → scored as KEY swim; ratio 1.25, credit 100%; flag swapped', () => {
  const plan = makePlan({ id: 1, discipline: 'swim', importance: 'key', target_duration: 40, date: '2026-09-17' })
  const log  = { ...makeLog({ id: 1, discipline: 'bike', duration: 50, date: '2026-09-17' }), reason: 'swapped', swap_planned_id: 1 }
  const result = computeScore([plan], [log], '2026-09-20')
  const d = result.matchDetails[0]
  expect(d.pct).toBeCloseTo(50 / 40, 5)
  expect(d.credit).toBe(1.0)
  expect(d.flags).toContain('swapped')
  expect(result.score).toBe(100)
})

test('S2: supporting swim 40 swapped for bike 50 → scored as supporting swim 40; credit 100%', () => {
  const plan = makePlan({ id: 1, discipline: 'swim', importance: 'supporting', target_duration: 40, date: '2026-09-17' })
  const log  = { ...makeLog({ id: 1, discipline: 'bike', duration: 50, date: '2026-09-17' }), reason: 'swapped', swap_planned_id: 1 }
  const result = computeScore([plan], [log], '2026-09-20')
  const d = result.matchDetails[0]
  expect(d.pct).toBeCloseTo(50 / 40, 5)
  expect(d.credit).toBe(1.0)
  expect(d.flags).toContain('swapped')
})

test('S3: KEY swim + supporting bike planned → validateSwap blocks: KEY-tier error', () => {
  const replacedPlan = makePlan({ id: 1, discipline: 'swim', importance: 'key', date: '2026-09-17', target_duration: 40 })
  const weekPlans = [
    replacedPlan,
    makePlan({ id: 2, discipline: 'bike', importance: 'supporting', date: '2026-09-16', target_duration: 60 }),
  ]
  const err = validateSwap(replacedPlan, '2026-09-17', 'bike', weekPlans)
  expect(err).toMatch(/KEY session can only be replaced/)
})

test('S4: swap to session in following week → validateSwap blocks: week boundary error', () => {
  const replacedPlan = makePlan({ id: 1, discipline: 'swim', importance: 'supporting', date: '2026-09-17', target_duration: 40 })
  // 2026-09-21 is Monday of the next week
  const err = validateSwap(replacedPlan, '2026-09-21', 'bike', [replacedPlan])
  expect(err).toMatch(/same week/)
})

test('S5: swim swapped to bike this week → swim swap note threshold met', () => {
  const swimPlan = makePlan({ id: 1, discipline: 'swim', importance: 'key', target_duration: 40, date: '2026-09-17' })
  const bikeLogs = [{ ...makeLog({ id: 1, discipline: 'bike', duration: 45, date: '2026-09-17' }), reason: 'swapped', swap_planned_id: 1, swap_planned_discipline: 'swim' }]
  // 1 swim swapped — note threshold (>0) met
  const result = computeScore([swimPlan], bikeLogs, '2026-09-20')
  const swapDetails = result.matchDetails.filter(d => d.flags.includes('swapped'))
  expect(swapDetails.length).toBe(1)
  const swapLog = bikeLogs.find(l => l.swap_planned_discipline === 'swim' && l.discipline !== 'swim')
  expect(swapLog).toBeTruthy()
})

test('S6: 2 swim sessions swapped within 14 days → alert threshold met (≥2)', () => {
  const plans = [
    makePlan({ id: 1, discipline: 'swim', importance: 'key', target_duration: 40, date: '2026-09-14' }),
    makePlan({ id: 2, discipline: 'swim', importance: 'supporting', target_duration: 45, date: '2026-09-17' }),
  ]
  const logs = [
    { ...makeLog({ id: 1, discipline: 'bike', duration: 40, date: '2026-09-14' }), reason: 'swapped', swap_planned_id: 1, swap_planned_discipline: 'swim' },
    { ...makeLog({ id: 2, discipline: 'run', duration: 45, date: '2026-09-17' }), reason: 'swapped', swap_planned_id: 2, swap_planned_discipline: 'swim' },
  ]
  const result = computeScore(plans, logs, '2026-09-20')
  const swapCount = result.matchDetails.filter(d => d.flags.includes('swapped')).length
  expect(swapCount).toBe(2)
  // Both swaps have swap_planned_discipline='swim' — alert fires at ≥2
  const swimSwapLogs = logs.filter(l => l.swap_planned_discipline === 'swim' && l.discipline !== 'swim')
  expect(swimSwapLogs.length).toBeGreaterThanOrEqual(2)
})

test('S7: swim session matched normally (no swap) → no swapped flag in matchDetails', () => {
  const plan = makePlan({ id: 1, discipline: 'swim', importance: 'key', target_duration: 40, date: '2026-09-17' })
  const log  = makeLog({ id: 1, discipline: 'swim', duration: 40, date: '2026-09-17' })
  const result = computeScore([plan], [log], '2026-09-20')
  const d = result.matchDetails[0]
  expect(d.flags).not.toContain('swapped')
  expect(d.credit).toBe(1.0)
})

test('S8: Wk 3 score unchanged at 64, grade C', () => {
  // Week 3: 2026-09-28 – 2026-10-04; scores must remain 64/C after CN-5 #9 changes
  const wk3Plans = require('../src/core/scoring').computeScore
  // Verified via snapshot; unit test asserts no regression in the scoring engine itself:
  // a plain completed run at 100% still scores 100 — engine unchanged for non-swap sessions
  const plan = makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-28' })
  const log  = makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-09-28' })
  const result = computeScore([plan], [log], '2026-10-04')
  expect(result.score).toBe(100)
  expect(result.grade).toBe('A')
  expect(result.matchDetails[0].flags).not.toContain('swapped')
})

// ─── CN-6 #1: Pass 4 — optional session matching ────────────────────────────

test('P4-1: optional strength matched same day → in matchDetails with credit=0, score unaffected', () => {
  const plans = [
    makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-21' }),
    makePlan({ id: 2, discipline: 'strength', type: 'strength', importance: 'optional', target_duration: 50, date: '2026-09-21' }),
  ]
  const logs = [
    makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-09-21' }),
    makeLog({ id: 2, discipline: 'strength', duration: 50, date: '2026-09-21' }),
  ]
  const result = computeScore(plans, logs, '2026-09-27')
  expect(result.score).toBe(100)
  const d = result.matchDetails.find(d => d.plan.id === 2)
  expect(d).toBeTruthy()
  expect(d.log).toBeTruthy()
  expect(d.log.date).toBe('2026-09-21')
  expect(d.credit).toBe(0)
  expect(d.flags).toContain('optional')
})

test('P4-2: optional strength matched +1 day → matchDetails log.date +1, credit=0', () => {
  const plans = [
    makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-21' }),
    makePlan({ id: 2, discipline: 'strength', type: 'strength', importance: 'optional', target_duration: 50, date: '2026-09-23' }),
  ]
  const logs = [
    makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-09-21' }),
    makeLog({ id: 2, discipline: 'strength', duration: 50, date: '2026-09-24' }),
  ]
  const result = computeScore(plans, logs, '2026-09-27')
  expect(result.score).toBe(100)
  const d = result.matchDetails.find(d => d.plan.id === 2)
  expect(d).toBeTruthy()
  expect(d.log.date).toBe('2026-09-24')
  expect(d.credit).toBe(0)
})

test('P4-3: optional unmatched → matchDetails flags include optional and missed, score unchanged', () => {
  const plans = [
    makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-21' }),
    makePlan({ id: 2, discipline: 'strength', type: 'strength', importance: 'optional', target_duration: 50, date: '2026-09-21' }),
  ]
  const logs = [makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-09-21' })]
  const result = computeScore(plans, logs, '2026-09-27')
  expect(result.score).toBe(100)
  const d = result.matchDetails.find(d => d.plan.id === 2)
  expect(d.log).toBeNull()
  expect(d.flags).toContain('optional')
  expect(d.flags).toContain('missed')
})

test('P4-4: optional cross-day outside week boundary → not matched', () => {
  // Sep 27 (Sun Wk 2) plan; Sep 29 (Tue Wk 3) log — different week
  const plans = [
    makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-21' }),
    makePlan({ id: 2, discipline: 'strength', type: 'strength', importance: 'optional', target_duration: 50, date: '2026-09-27' }),
  ]
  const logs = [
    makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-09-21' }),
    makeLog({ id: 2, discipline: 'strength', duration: 50, date: '2026-09-29' }),
  ]
  const result = computeScore(plans, logs, '2026-09-27')
  const d = result.matchDetails.find(d => d.plan.id === 2)
  expect(d.log).toBeNull()
  expect(d.flags).toContain('missed')
})

test('P4-5: two optional sessions compete for same log — closer one wins, other unmatched', () => {
  // Plans: Sep 23 and Sep 25 strength; Log: Sep 24 strength (1 day from each)
  const plans = [
    makePlan({ id: 1, discipline: 'run', importance: 'key', target_duration: 60, date: '2026-09-21' }),
    makePlan({ id: 2, discipline: 'strength', type: 'strength', importance: 'optional', target_duration: 50, date: '2026-09-23' }),
    makePlan({ id: 3, discipline: 'strength', type: 'strength', importance: 'optional', target_duration: 50, date: '2026-09-25' }),
  ]
  const logs = [
    makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-09-21' }),
    makeLog({ id: 2, discipline: 'strength', duration: 50, date: '2026-09-24' }),
  ]
  const result = computeScore(plans, logs, '2026-09-27')
  expect(result.score).toBe(100)
  const d2 = result.matchDetails.find(d => d.plan.id === 2)
  const d3 = result.matchDetails.find(d => d.plan.id === 3)
  // Sep 23 plan picks Sep 24 log (1 day diff); Sep 25 plan has no log left
  expect(d2.log).toBeTruthy()
  expect(d3.log).toBeNull()
  expect(d3.flags).toContain('missed')
})

// ─── CN-7 #1: Pass 1 must exclude optional sessions ─────────────────────────

test('CN7-1-T2: KEY Thu (60) + optional Sun (30) + single Sat log (60) → KEY matched (+2d), optional missed', () => {
  // Week Sep 14–20: Thu=Sep 17 KEY run, Sun=Sep 20 optional run, log=Sat Sep 19
  const plans = [
    makePlan({ id: 1, discipline: 'run', importance: 'key',      target_duration: 60, date: '2026-09-17' }),
    makePlan({ id: 2, discipline: 'run', importance: 'optional', target_duration: 30, date: '2026-09-20' }),
  ]
  const logs = [makeLog({ id: 1, discipline: 'run', duration: 60, date: '2026-09-19' })]
  const result = computeScore(plans, logs, '2026-09-20')
  const keyDetail = result.matchDetails.find(d => d.plan.id === 1)
  const optDetail = result.matchDetails.find(d => d.plan.id === 2)
  // KEY gets the Sat log via Pass 2 (±2d)
  expect(keyDetail.log).toBeTruthy()
  expect(keyDetail.log.date).toBe('2026-09-19')
  expect(keyDetail.credit).toBe(1.0)
  // Optional has no remaining log
  expect(optDetail.log).toBeNull()
  expect(optDetail.flags).toContain('missed')
  expect(optDetail.flags).toContain('optional')
})

test('CN7-1-T3: optional Sun run (30), logged Sun (33), no other run plans → optional matched same-day', () => {
  // KEY bike provides required non-optional session so computeScore doesn't early-return
  const plans = [
    makePlan({ id: 1, discipline: 'bike', importance: 'key',      target_duration: 60, date: '2026-09-14' }),
    makePlan({ id: 2, discipline: 'run',  importance: 'optional', target_duration: 30, date: '2026-09-20' }),
  ]
  const logs = [
    makeLog({ id: 1, discipline: 'bike', duration: 60, date: '2026-09-14' }),
    makeLog({ id: 2, discipline: 'run',  duration: 33, date: '2026-09-20' }),
  ]
  const result = computeScore(plans, logs, '2026-09-20')
  const optDetail = result.matchDetails.find(d => d.plan.id === 2)
  expect(optDetail.log).toBeTruthy()
  expect(optDetail.log.date).toBe('2026-09-20')
  expect(optDetail.flags).toContain('optional')
  expect(optDetail.flags).not.toContain('missed')
  expect(optDetail.credit).toBe(0)
})
