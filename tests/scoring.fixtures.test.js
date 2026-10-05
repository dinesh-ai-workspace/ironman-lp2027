'use strict'

const { computeScore, computeRecovery, computePainAlert, sessionCredit, getWeekStart } = require('../src/core/scoring')
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
