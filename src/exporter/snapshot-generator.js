'use strict'

const path = require('path')
const { computeScore, computeRecovery, computePainAlert, IMP_W } = require('../core/scoring')
const { deriveBikeZones, deriveRunZones, deriveSwimPace } = require('../core/scoring/zones')
const { classifyDayType, computeWeightedTrainMin, calorieStatus, isComplete, hitsProtein, isLowCarb, computeWeeklyFueling, computeWeightTrend, formatFreshness, sevenDayAvg, CALORIE_RANGES } = require('../core/fueling')

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAN_START_STR = '2026-09-14'
const EXCUSED_REASONS = new Set(['illness', 'pain', 'coach-adjusted'])
const PLAN_START = new Date(PLAN_START_STR + 'T00:00:00Z')
const TOTAL_PLAN_WEEKS = 45

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt1(n) { return n == null ? '—' : n.toFixed(1) }
function fmt2(n) { return n == null ? '—' : n.toFixed(2) }
function fmtInt(n) { return n == null ? '—' : Math.round(n).toString() }
function dash(v) { return (v == null || v === '' || v === undefined) ? '—' : v }

function dateAdd(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}

function currentWeekNum() {
  const today = new Date(todayStr() + 'T00:00:00Z')
  return Math.max(1, Math.floor((today - PLAN_START) / (7 * 24 * 60 * 60 * 1000)) + 1)
}

function weekStartFor(weekNum) {
  const d = new Date(PLAN_START)
  d.setUTCDate(d.getUTCDate() + (weekNum - 1) * 7)
  return d.toISOString().slice(0, 10)
}

function formatGeneratedAt() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const p = {}
  parts.forEach(({ type, value }) => { p[type] = value })
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ET`
}

// ─── Pace calculator ──────────────────────────────────────────────────────────
function calcPace(disc, durationMin, distanceMi) {
  if (distanceMi == null || distanceMi <= 0 || durationMin == null || durationMin <= 0) return '—'
  if (disc === 'run') {
    const paceDecMin = durationMin / distanceMi
    const mins = Math.floor(paceDecMin)
    const secs = Math.round((paceDecMin - mins) * 60)
    return `${mins}:${String(secs).padStart(2, '0')}/mi`
  }
  if (disc === 'swim') {
    const distM = distanceMi * 1609.34
    if (distM <= 0) return '—'
    const pacePer100 = durationMin / (distM / 100)
    const mins = Math.floor(pacePer100)
    const secs = Math.round((pacePer100 - mins) * 60)
    return `${mins}:${String(secs).padStart(2, '0')}/100m`
  }
  if (disc === 'bike') {
    const mph = distanceMi / (durationMin / 60)
    return `${mph.toFixed(1)} mph`
  }
  return '—'
}

// ─── Main export ──────────────────────────────────────────────────────────────
function generateSnapshot(db) {
  const today = todayStr()
  const wkNum = currentWeekNum()

  // Helper: aggregate per-day fueling data for a date range and compute weekly status
  function computeWeeklyFuelingForRange(dbRef, startStr, endStr) {
    const nutRows = dbRef.prepare(
      'SELECT date, SUM(calories) as kcal, SUM(protein_g) as pro, SUM(carbs_g) as carbs FROM nutrition_logs WHERE date>=? AND date<=? GROUP BY date'
    ).all(startStr, endStr)
    // CN-5 #3 B1: per-discipline minutes for weighted train-min calculation
    const discByDate = {}
    for (const l of dbRef.prepare(
      'SELECT date, discipline, SUM(duration) as dur FROM logged_sessions WHERE date>=? AND date<=? GROUP BY date, discipline'
    ).all(startStr, endStr)) {
      if (!discByDate[l.date]) discByDate[l.date] = {}
      discByDate[l.date][l.discipline] = (discByDate[l.date][l.discipline] || 0) + (l.dur || 0)
    }
    const days = nutRows.map(r => ({
      date: r.date,
      totalCal: r.kcal || 0,
      protein_g: r.pro || 0,
      carbs_g: r.carbs || 0,
      trainMin: computeWeightedTrainMin(discByDate[r.date] || {}),
    }))
    return computeWeeklyFueling(days)
  }

  // D2: absolute resolved DB path — fail fast if relative
  const dbAbsPath = path.resolve(db.name)
  if (!path.isAbsolute(dbAbsPath)) {
    throw new Error('DB path is not absolute after resolve: ' + dbAbsPath)
  }

  // B3: read z2Ceilings for intensity check activation
  const ceilingRows = db.prepare(
    "SELECT metric, value FROM athlete_benchmarks WHERE metric IN ('bike_ceiling_hr', 'run_ceiling_hr') ORDER BY date DESC"
  ).all()
  const z2Ceilings = {}
  for (const r of ceilingRows) {
    if (r.metric === 'bike_ceiling_hr' && z2Ceilings.bike == null) z2Ceilings.bike = r.value
    if (r.metric === 'run_ceiling_hr'  && z2Ceilings.run  == null) z2Ceilings.run  = r.value
  }
  const intensityCheckLine = (z2Ceilings.bike != null || z2Ceilings.run != null)
    ? `Intensity check: active (${[z2Ceilings.run != null ? `run ceiling ${z2Ceilings.run} bpm` : null, z2Ceilings.bike != null ? `bike ceiling ${z2Ceilings.bike} bpm` : null].filter(Boolean).join(', ')})`
    : 'Intensity check: inactive (zones not set)'

  // ── Active plan ──────────────────────────────────────────────────────────
  const activePlan = db.prepare(
    "SELECT * FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1"
  ).get()
  const planId = activePlan?.id || -1

  // ── Current phase ────────────────────────────────────────────────────────
  const currentBlock = planId > -1
    ? db.prepare(
        'SELECT phase, phase_name FROM plan_blocks WHERE plan_id=? AND start_date<=? AND end_date>=? LIMIT 1'
      ).get(planId, today, today)
    : null
  const phaseName = currentBlock ? (currentBlock.phase_name || currentBlock.phase) : 'Base'

  // ── Next readiness gate ───────────────────────────────────────────────────
  const nextGate = db.prepare(
    "SELECT metric, target_value, week_num, discipline FROM readiness_gates WHERE plan_id=? AND status='pending' ORDER BY week_num ASC LIMIT 1"
  ).get(planId)
  const nextGateStr = nextGate
    ? `Wk ${nextGate.week_num} — ${nextGate.discipline} ${nextGate.metric} ≥ ${nextGate.target_value}`
    : 'No pending gates'

  // ─── Section 1: Weekly Scores — Last 4 Completed Weeks ───────────────────
  const completedWeeks = []
  for (let wk = wkNum - 1; wk >= 1 && completedWeeks.length < 4; wk--) {
    const startStr = weekStartFor(wk)
    const endStr   = dateAdd(startStr, 6)
    if (endStr >= today) continue  // not yet completed

    const plannedRows = db.prepare(
      'SELECT id, discipline, type, target_duration, importance, date, target_intensity_zone FROM planned_sessions WHERE plan_id=? AND date>=? AND date<=?'
    ).all(planId, startStr, endStr)

    const loggedRows = db.prepare(
      'SELECT id, discipline, duration, date, avg_hr, reason FROM logged_sessions WHERE date>=? AND date<=?'
    ).all(startStr, endStr)

    const wellnessRows = db.prepare(
      'SELECT * FROM daily_wellness WHERE date>=? AND date<=? ORDER BY date ASC'
    ).all(startStr, endStr)

    const scoreResult = computeScore(plannedRows, loggedRows, endStr, { z2Ceilings, today })

    // Volume
    const plannedMin = plannedRows.reduce((s, r) => s + (r.target_duration || 0), 0)
    const actualMin  = loggedRows.reduce((s, r) => s + (r.duration || 0), 0)
    const plannedH   = (plannedMin / 60).toFixed(1)
    const actualH    = (actualMin / 60).toFixed(1)

    function discActual(disc) {
      return loggedRows.filter(r => r.discipline === disc).reduce((s, r) => s + (r.duration || 0), 0)
    }
    function discPlanned(disc) {
      return plannedRows.filter(r => r.discipline === disc).reduce((s, r) => s + (r.target_duration || 0), 0)
    }

    const swimA = discActual('swim'), swimP = discPlanned('swim')
    const bikeA = discActual('bike'), bikeP = discPlanned('bike')
    const runA  = discActual('run'),  runP  = discPlanned('run')

    // Strength done/planned
    const strPlannedRows = plannedRows.filter(r => r.discipline === 'strength')
    const strPlanned = strPlannedRows.length
    const strDone = strPlannedRows.filter(p =>
      loggedRows.some(l => l.discipline === 'strength' && l.date === p.date)
    ).length

    // KEY done/total from matchDetails
    const keyDetails = scoreResult?.matchDetails?.filter(d => d.plan.importance === 'key') || []
    const keyDone = keyDetails.filter(d => d.credit > 0).length
    const keyTotal = keyDetails.length

    const recovery = computeRecovery(wellnessRows)

    // Fueling for this week
    const fueling = computeWeeklyFuelingForRange(db, startStr, endStr)

    completedWeeks.push({
      wk, startStr, endStr,
      score: scoreResult?.score ?? null,
      grade: scoreResult?.grade ?? '—',
      cap: scoreResult?.cap ?? '—',
      earnedPts: scoreResult?.earnedPts ?? null,
      totalWeight: scoreResult?.totalWeight ?? null,
      matchDetails: scoreResult?.matchDetails ?? [],
      excusedCount: scoreResult?.excusedCount ?? 0,
      plannedH, actualH,
      swimA, swimP, bikeA, bikeP, runA, runP,
      strDone, strPlanned,
      keyDone, keyTotal,
      recovery, fueling,
    })
  }

  const weeklyHeader = '| Wk | Dates | Score | Grade | Cap | Planned h | Actual h | Swim A/P | Bike A/P | Run A/P | Str done/pl | KEYs done | Recovery | Fueling |\n' +
                       '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'
  const weeklyRows = completedWeeks.map(w => {
    const scoreStr = w.score != null
      ? (w.excusedCount > 0 ? `${w.score} (${w.excusedCount} excused)` : String(w.score))
      : '—'
    return `| ${w.wk} | ${w.startStr}–${w.endStr} | ${scoreStr} | ${w.grade} | ${w.cap} | ${w.plannedH} | ${w.actualH} | ${w.swimA}/${w.swimP} | ${w.bikeA}/${w.bikeP} | ${w.runA}/${w.runP} | ${w.strDone}/${w.strPlanned} | ${w.keyDone}/${w.keyTotal} | ${w.recovery.status} | ${w.fueling.status} |`
  }).join('\n')

  // ─── Recovery table ────────────────────────────────────────────────────────
  const recoveryHeader = '| Wk | Good nights | Nights with data | % | Status | Avg sleep h | Avg bedtime | Avg RHR | Avg Body Battery |\n' +
                         '|---|---|---|---|---|---|---|---|---|'
  const recoveryTableRows = []
  for (const w of [...completedWeeks].reverse()) {
    const r = w.recovery
    recoveryTableRows.push(
      `| ${w.wk} | ${r.goodNights} | ${r.nightsWithData} | ${r.pct ?? 'n/a'} | ${r.status} | ${r.avgSleepH} | ${r.avgBedtime} | ${r.avgRhr} | ${r.avgBb} |`
    )
  }
  const currWellnessRows = db.prepare(
    'SELECT * FROM daily_wellness WHERE date>=? AND date<=? ORDER BY date ASC'
  ).all(weekStartFor(wkNum), today)
  const currRecovery = computeRecovery(currWellnessRows)
  recoveryTableRows.push(
    `| ${wkNum} (in progress) | ${currRecovery.goodNights} | ${currRecovery.nightsWithData} | ${currRecovery.pct ?? 'n/a'} | ${currRecovery.status} | ${currRecovery.avgSleepH} | ${currRecovery.avgBedtime} | ${currRecovery.avgRhr} | ${currRecovery.avgBb} |`
  )

  // ─── Score Breakdown ────────────────────────────────────────────────────────
  const breakdownSections = []
  for (const w of [...completedWeeks].reverse()) {
    const bLines = [`### Week ${w.wk} (${w.startStr}–${w.endStr})`]
    bLines.push('| Date | Disc | Tier | Weight | Plan min | Actual min | Ratio % | Credit % | Points | Flags |')
    bLines.push('|---|---|---|---|---|---|---|---|---|---|')
    for (const d of w.matchDetails) {
      const isExcused = d.flags.includes('excused')
      const wt = isExcused ? '—' : IMP_W[d.plan.importance] || 1
      const ratio = d.pct != null ? Math.round(d.pct * 100) + '%' : '—'
      const creditPct = isExcused
        ? `excused (${d.log?.reason ?? 'excused'})`
        : Math.round(d.credit * 100) + '%'
      const pts = isExcused ? '—' : (IMP_W[d.plan.importance] * d.credit).toFixed(1)
      const flags = d.flags.filter(f => f !== 'excused').join(', ') || (isExcused ? '—' : '—')
      const actualMin = d.log ? fmtInt(d.log.duration) : '—'
      bLines.push(`| ${d.plan.date} | ${d.plan.discipline} | ${d.plan.importance} | ${wt} | ${d.plan.target_duration} | ${actualMin} | ${ratio} | ${creditPct} | ${pts} | ${flags} |`)
    }
    const excusedSuffix = w.excusedCount > 0 ? ` (${w.excusedCount} excused)` : ''
    bLines.push(`**Total: ${(w.earnedPts ?? 0).toFixed(1)} ÷ ${w.totalWeight} = ${w.score}${excusedSuffix}**`)
    breakdownSections.push(bLines.join('\n'))
  }

  // ─── Section 2: Session Log — Last 14 Days ────────────────────────────────
  const since14 = dateAdd(today, -13)

  const planned14 = db.prepare(`
    SELECT ps.*, pb.phase
    FROM planned_sessions ps
    JOIN plan_blocks pb ON ps.block_id = pb.id
    WHERE ps.plan_id=? AND ps.date>=? AND ps.date<=?
    ORDER BY ps.date, ps.discipline
  `).all(planId, since14, today)

  const logged14 = db.prepare(`
    SELECT *, reason FROM logged_sessions WHERE date>=? AND date<=? ORDER BY date, discipline
  `).all(since14, today)

  // ── 3-pass matching (mirrors computeScore logic) ──────────────────────────
  const impOrder = { key: 0, supporting: 1, optional: 2 }

  const hasEarlierPlan14 = new Set()
  for (const l of logged14) {
    const prev = dateAdd(l.date, -1)
    const hasPrevPlan = planned14.some(p => p.discipline === l.discipline && p.date === prev)
    const hasOwnPlan  = planned14.some(p => p.discipline === l.discipline && p.date === l.date)
    if (hasPrevPlan && !hasOwnPlan) hasEarlierPlan14.add(l.id)
  }

  function days14(a, b) {
    return Math.abs((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000)
  }
  function pickBest14(plan, candidates, crossDay = false) {
    return candidates.reduce((best, l) => {
      if (crossDay) {
        const dDist = days14(l.date, plan.date)
        const bDist = days14(best.date, plan.date)
        if (dDist !== bDist) return dDist < bDist ? l : best
        const ld = l.duration || 0, bd2 = best.duration || 0
        if (ld !== bd2) return ld > bd2 ? l : best
      } else {
        const dd = Math.abs((l.duration||0) - plan.target_duration)
        const bd2 = Math.abs((best.duration||0) - plan.target_duration)
        if (dd !== bd2) return dd < bd2 ? l : best
      }
      if (l.date !== best.date) return l.date < best.date ? l : best
      return (l.id <= best.id) ? l : best
    })
  }

  const usedIds14 = new Set()
  const matchMap14 = new Map()

  // Pass 1: same-day
  const sortedByImp14 = [...planned14].sort((a, b) => {
    const di = (impOrder[a.importance]??3) - (impOrder[b.importance]??3)
    if (di !== 0) return di
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return b.target_duration - a.target_duration
  })
  for (const p of sortedByImp14) {
    const cands = logged14.filter(l => l.discipline === p.discipline && !usedIds14.has(l.id) && l.date === p.date && !hasEarlierPlan14.has(l.id))
    if (cands.length > 0) { const best = pickBest14(p, cands); usedIds14.add(best.id); matchMap14.set(p.id, { plan: p, log: best }) }
  }
  // Pass 2: cross-day, KEY, ±2
  const keyP14 = planned14.filter(p => p.importance === 'key' && !matchMap14.has(p.id)).sort((a,b)=>a.date.localeCompare(b.date))
  for (const p of keyP14) {
    const cands = logged14.filter(l => l.discipline === p.discipline && !usedIds14.has(l.id) && days14(l.date, p.date) <= 2)
    if (cands.length > 0) { const best = pickBest14(p, cands, true); usedIds14.add(best.id); matchMap14.set(p.id, { plan: p, log: best }) }
  }
  // Pass 3: cross-day, non-KEY, ±2
  const nonKeyP14 = planned14.filter(p => p.importance !== 'key' && !matchMap14.has(p.id)).sort((a,b)=>{ if(a.date!==b.date) return a.date.localeCompare(b.date); return (impOrder[a.importance]??3)-(impOrder[b.importance]??3) })
  for (const p of nonKeyP14) {
    const cands = logged14.filter(l => l.discipline === p.discipline && !usedIds14.has(l.id) && days14(l.date, p.date) <= 2)
    if (cands.length > 0) { const best = pickBest14(p, cands, true); usedIds14.add(best.id); matchMap14.set(p.id, { plan: p, log: best }) }
  }

  // Build session lines (planned) and extra lines (unplanned)
  const sessionLines = []
  const extraLines = []

  // Matched and unmatched planned sessions
  for (const p of planned14) {
    const m = matchMap14.get(p.id)
    if (m) {
      const { log } = m
      const pct = p.target_duration > 0 ? (log.duration || 0) / p.target_duration : null
      const dayDiff = days14(log.date, p.date)
      const isExcused = log.reason && EXCUSED_REASONS.has(log.reason)
      let status = '✓ matched'
      if (isExcused) status = `excused (${log.reason})`
      else if (dayDiff > 0) status = `✓ matched (${log.date < p.date ? '-' : '+'}${Math.round(dayDiff)}d)`
      if (!isExcused && pct != null && pct < 0.85) status = status.replace('✓', '⚠')
      sessionLines.push({
        date: p.date, disc: p.discipline, tier: p.importance,
        planMin: p.target_duration, actualMin: fmtInt(log.duration),
        dist: log.distance != null ? fmt2(log.distance) : '—',
        pace: calcPace(p.discipline, log.duration, log.distance),
        avgHr: dash(log.avg_hr), powerPace: dash(log.avg_power),
        rpe: dash(log.rpe), status,
        reason: (log.reason && log.reason !== 'completed') ? log.reason : '—',
        note: (log.notes||'').slice(0, 40) || '—',
      })
    } else if (p.date < today) {
      sessionLines.push({ date: p.date, disc: p.discipline, tier: p.importance, planMin: p.target_duration, actualMin: '—', dist: '—', pace: '—', avgHr: '—', powerPace: '—', rpe: '—', status: '✗ missed', reason: '—', note: '—' })
    } else if (p.date === today) {
      sessionLines.push({ date: p.date, disc: p.discipline, tier: p.importance, planMin: p.target_duration, actualMin: '—', dist: '—', pace: '—', avgHr: '—', powerPace: '—', rpe: '—', status: '⏳ pending', reason: '—', note: '—' })
    }
    // future dates: skip
  }

  // Unmatched logged sessions → Extra sessions (D4)
  const currWkStart = weekStartFor(wkNum)
  let unplannedMinCurrWk = 0
  for (const l of logged14) {
    if (!usedIds14.has(l.id)) {
      if (l.date >= currWkStart && l.date <= today) {
        unplannedMinCurrWk += (l.duration || 0)
      }
      extraLines.push({ date: l.date, disc: l.discipline, dur: fmtInt(l.duration), dist: l.distance != null ? fmt2(l.distance) : '—', pace: calcPace(l.discipline, l.duration, l.distance), avgHr: dash(l.avg_hr), rpe: dash(l.rpe), note: (l.notes||'').slice(0,40)||'—' })
    }
  }

  sessionLines.sort((a, b) => b.date.localeCompare(a.date))
  extraLines.sort((a, b) => b.date.localeCompare(a.date))

  const sessionHeader = '| Date | Disc | Tier | Plan min | Actual min | Dist mi | Pace | Avg HR bpm | Power W | RPE | Status | Reason | Note |\n' +
                        '|---|---|---|---|---|---|---|---|---|---|---|---|---|'
  const sessionRows = sessionLines.map(s =>
    `| ${s.date} | ${s.disc} | ${s.tier} | ${s.planMin} | ${s.actualMin} | ${s.dist} | ${s.pace} | ${s.avgHr} | ${s.powerPace} | ${s.rpe} | ${s.status} | ${s.reason} | ${s.note} |`
  ).join('\n')

  const extraHeader = '| Date | Disc | Duration min | Dist mi | Pace | Avg HR bpm | RPE | Note |\n' +
                      '|---|---|---|---|---|---|---|---|'
  const extraRows = extraLines.map(e =>
    `| ${e.date} | ${e.disc} | ${e.dur} | ${e.dist} | ${e.pace} | ${e.avgHr} | ${e.rpe} | ${e.note} |`
  ).join('\n')

  // D5: unplanned >90 min in current week
  const unplannedNote = unplannedMinCurrWk > 90
    ? `Note: ${unplannedMinCurrWk} min of unplanned activity this week — coach visibility.`
    : null


  // ─── Section 3: Wellness — Last 14 Days ───────────────────────────────────
  const wellness14 = db.prepare(
    'SELECT * FROM daily_wellness WHERE date>=? AND date<=? ORDER BY date DESC'
  ).all(since14, today)

  function isLateBed(bedtime) {
    if (!bedtime || !/^\d{2}:\d{2}$/.test(bedtime)) return false
    const [h, m] = bedtime.split(':').map(Number)
    const mins = h * 60 + m
    return mins <= 300 || mins >= 1411  // 00:00–05:00 or 23:31–23:59
  }

  const wellnessHeader = '| Date | Bedtime | Sleep h | Sleep Score | RHR bpm | HRV ms | Body Battery | Soreness | Stress | Flag |\n' +
                         '|---|---|---|---|---|---|---|---|---|---|'
  const wellnessRows = wellness14.map(w => {
    const flagParts = []
    if (w.pain_flag) flagParts.push('⚠ PAIN')
    if (isLateBed(w.bedtime)) flagParts.push('late bed')
    const flag = flagParts.length > 0 ? flagParts.join(' / ') : '—'
    const bb = w.body_battery != null ? String(w.body_battery) : '—'
    return `| ${w.date} | ${dash(w.bedtime)} | ${dash(w.sleep_hours != null ? fmt1(w.sleep_hours) : null)} | ${dash(w.sleep_score)} | ${dash(w.resting_hr)} | ${dash(w.hrv)} | ${bb} | ${dash(w.soreness_1_5)} | ${dash(w.stress_1_5)} | ${flag} |`
  }).join('\n')

  const lateBedCount = wellness14.filter(w => isLateBed(w.bedtime)).length
  const bedtimeCount = wellness14.filter(w => w.bedtime && w.bedtime !== '—').length
  const lateBedLine = `Late-bed nights (last 14 days): ${lateBedCount} of ${bedtimeCount}`

  // ─── Section 4: Body Composition — Last 30 Days ───────────────────────────
  const since30 = dateAdd(today, -29)
  const bodyComp30 = db.prepare(`
    SELECT date, ROUND(AVG(weight_lb),1) as weight_lb, ROUND(AVG(body_fat_pct),1) as body_fat_pct,
           source
    FROM body_composition
    WHERE date>=? GROUP BY date ORDER BY date DESC
  `).all(since30)

  // All weight rows needed for W1 calendar-window 7-day avg (sevenDayAvg handles ≥3 guard)
  const weightRowsAll = db.prepare(
    'SELECT date, AVG(weight_lb) as weight_lb FROM body_composition WHERE weight_lb IS NOT NULL GROUP BY date ORDER BY date ASC'
  ).all()

  const bcRows = bodyComp30.map(r => {
    const avg = sevenDayAvg(r.date, weightRowsAll)
    const avgStr = avg != null ? avg.toFixed(1) : '—'
    return `| ${r.date} | ${dash(r.weight_lb != null ? fmt1(r.weight_lb) : null)} | ${avgStr} |`
  }).join('\n')

  const bcHeader = '| Date | Weight lb | 7-day avg lb |\n|---|---|---|'

  const latestBF = db.prepare(`
    SELECT date, body_fat_pct, source FROM body_composition
    WHERE body_fat_pct IS NOT NULL ORDER BY date DESC LIMIT 1
  `).get()
  const latestBFStr = latestBF
    ? `Latest body fat: ${fmt1(latestBF.body_fat_pct)}% (${latestBF.source}) as of ${latestBF.date}`
    : 'Latest body fat: — (no data)'

  // ─── Section 5: Benchmarks & Zones ────────────────────────────────────────
  // Latest per metric from athlete_benchmarks
  const allBenchmarks = db.prepare(
    'SELECT * FROM athlete_benchmarks ORDER BY metric ASC, date DESC'
  ).all()
  const latestBenchmarks = {}
  for (const b of allBenchmarks) {
    if (!latestBenchmarks[b.metric]) latestBenchmarks[b.metric] = b
  }

  function bm(metric) { return latestBenchmarks[metric]?.value ?? null }

  // B4: derive full zone bands if raw test values exist
  const benchSections = []

  const power20raw = bm('bike_power20_w')
  const hr20raw    = bm('bike_hr20_bpm')
  if (power20raw != null && hr20raw != null) {
    const bz = deriveBikeZones(power20raw, hr20raw)
    const bikeDate = latestBenchmarks['bike_power20_w']?.date ?? '—'
    const pZ = bz.powerZones
    const hZ = bz.bikeHrZones
    benchSections.push([
      `### Bike FTP Test (${bikeDate})`,
      `- 20-min avg power: ${power20raw} W | 20-min avg HR: ${hr20raw} bpm`,
      `- **FTP: ${bz.ftp} W** | **Bike LTHR: ${bz.bikeLthr} bpm** | **Z2 ceiling: ${bz.bikeCeiling} bpm**`,
      '',
      '| Zone | Power (W) | Bike HR (bpm) |',
      '|---|---|---|',
      `| Z1 | < ${pZ.z2[0]} | < ${hZ.z2[0]} |`,
      `| Z2 | ${pZ.z2[0]}–${pZ.z2[1]} | ${hZ.z2[0]}–${hZ.z2[1]} |`,
      `| Z3 | ${pZ.z3[0]}–${pZ.z3[1]} | ${hZ.z3[0]}–${hZ.z3[1]} |`,
      `| Z4 | ${pZ.z4[0]}–${pZ.z4[1]} | ${hZ.z4[0]}–${hZ.z4[1]} |`,
      `| Z5 | ≥ ${pZ.z5min} | ≥ ${hZ.z5min} |`,
    ].join('\n'))
  }

  const lastHr20raw = bm('run_lasthr20_bpm')
  if (lastHr20raw != null) {
    const rz = deriveRunZones(lastHr20raw)
    const runTTDate = latestBenchmarks['run_lasthr20_bpm']?.date ?? '—'
    const rZ = rz.runHrZones
    const runDist = bm('run_tt_distance_mi')
    benchSections.push([
      `### Run 30-min TT (${runTTDate})`,
      `- Last-20-min avg HR: ${lastHr20raw} bpm${runDist != null ? ` | Distance: ${runDist.toFixed(2)} mi` : ''}`,
      `- **Run LTHR: ${rz.runLthr} bpm** | **Z2 ceiling: ${rz.runCeiling} bpm**`,
      '',
      '| Zone | Run HR (bpm) |',
      '|---|---|',
      `| Z1 | < ${rZ.z2[0]} |`,
      `| Z2 | ${rZ.z2[0]}–${rZ.z2[1]} |`,
      `| Z3 | ${rZ.z3[0]}–${rZ.z3[1]} |`,
      `| Z4 | ${rZ.z4[0]}–${rZ.z4[1]} |`,
      `| Z5 | ≥ ${rZ.z5min} |`,
    ].join('\n'))
  }

  const swim400mMin = bm('swim_400m_min')
  if (swim400mMin != null) {
    const sw = deriveSwimPace(swim400mMin)
    const swimTTDate = latestBenchmarks['swim_400m_min']?.date ?? '—'
    benchSections.push([
      `### Swim 400m TT (${swimTTDate})`,
      `- Time: ${Math.floor(swim400mMin)}:${String(Math.round((swim400mMin % 1) * 60)).padStart(2,'0')} | **Pace per 100m: ${sw.paceFormatted}**`,
    ].join('\n'))
  }

  const benchContent = benchSections.length > 0
    ? benchSections.join('\n\n')
    : '— No test results recorded yet'

  // Activity records
  const longestSwim = db.prepare(
    "SELECT distance, duration, date FROM logged_sessions WHERE discipline='swim' AND distance IS NOT NULL ORDER BY distance DESC LIMIT 1"
  ).get()
  const longestBike = db.prepare(
    "SELECT duration, distance, date FROM logged_sessions WHERE discipline='bike' AND duration IS NOT NULL ORDER BY duration DESC LIMIT 1"
  ).get()
  const longestRun = db.prepare(
    "SELECT distance, duration, date FROM logged_sessions WHERE discipline='run' AND distance IS NOT NULL ORDER BY distance DESC LIMIT 1"
  ).get()

  const activityRecords = [
    `Longest swim: ${longestSwim?.distance != null ? Math.round(longestSwim.distance * 1609.34) + ' m' : '—'}${longestSwim?.duration != null ? ' (' + fmtInt(longestSwim.duration) + ' min)' : ''} on ${longestSwim?.date ?? '—'}`,
    `Longest ride: ${longestBike?.duration != null ? fmtInt(longestBike.duration) + ' min' : '—'}${longestBike?.distance != null ? ' (' + fmt1(longestBike.distance) + ' mi)' : ''} on ${longestBike?.date ?? '—'}`,
    `Longest run: ${longestRun?.distance != null ? fmt2(longestRun.distance) + ' mi' : '—'}${longestRun?.duration != null ? ' (' + fmtInt(longestRun.duration) + ' min)' : ''} on ${longestRun?.date ?? '—'}`,
  ].join('\n')

  // ─── Section 6: Readiness Gates ───────────────────────────────────────────
  // D1: compute evidence candidates dynamically; app never sets status (coach does)
  const gates = db.prepare(
    'SELECT * FROM readiness_gates WHERE plan_id=? ORDER BY week_num ASC, discipline ASC'
  ).all(planId)

  function gateEvidence(g) {
    if (g.discipline === 'swim') {
      // Longest single swim in gate week and prior week (m + min)
      const gateWeekStart = weekStartFor(g.week_num)
      const priorWeekStart = weekStartFor(Math.max(1, g.week_num - 1))
      const longest = db.prepare(
        "SELECT distance, duration, date FROM logged_sessions WHERE discipline='swim' AND distance IS NOT NULL AND date>=? AND date<=? ORDER BY distance DESC LIMIT 1"
      ).get(priorWeekStart, dateAdd(gateWeekStart, 6))
      if (longest) {
        const metres = longest.distance != null ? Math.round(longest.distance * 1609.34) : '—'
        return `${metres}m / ${fmtInt(longest.duration)}min on ${longest.date}`
      }
      return '—'
    }
    // multi / race: show relevant logged sessions in gate week range
    const gateWeekStart = weekStartFor(g.week_num)
    const gateWeekEnd = dateAdd(gateWeekStart, 6)
    const sessions = db.prepare(
      "SELECT discipline, duration, date FROM logged_sessions WHERE discipline IN ('swim','bike','run') AND date>=? AND date<=? ORDER BY date"
    ).all(gateWeekStart, gateWeekEnd)
    if (sessions.length === 0) return '—'
    return sessions.map(s => `${s.discipline} ${fmtInt(s.duration)}min on ${s.date}`).slice(0, 3).join('; ')
  }

  const gateHeader = '| Gate | Week | Status | Evidence |\n|---|---|---|---|'
  const gateRows = gates.map(g =>
    `| ${g.discipline} ${g.metric} | ${g.week_num} | ${g.status} | ${gateEvidence(g)} |`
  ).join('\n')

  // ─── Section 7: Next 7 Days ───────────────────────────────────────────────
  const next7End = dateAdd(today, 6)
  const next7 = db.prepare(`
    SELECT ps.*, pb.phase, pb.phase_name
    FROM planned_sessions ps
    JOIN plan_blocks pb ON ps.block_id = pb.id
    WHERE ps.plan_id=? AND ps.date>=? AND ps.date<=?
    ORDER BY ps.date, ps.discipline
  `).all(planId, today, next7End)

  const next7Header = '| Date | Disc | Type | Tier | Target min | Zone | Purpose |\n|---|---|---|---|---|---|---|'
  const next7Rows = next7.map(s =>
    `| ${s.date} | ${s.discipline} | ${s.type} | ${s.importance} | ${s.target_duration} | Z${s.target_intensity_zone} | ${(s.purpose || '').slice(0, 50)} |`
  ).join('\n')

  // ─── Section 8: Athlete Notes ─────────────────────────────────────────────
  const recentNotes = db.prepare(
    "SELECT date, notes FROM daily_wellness WHERE notes IS NOT NULL AND notes != '' ORDER BY date DESC LIMIT 3"
  ).all()
  const athleteNotes = recentNotes.length > 0
    ? recentNotes.map(n => `**${n.date}**: ${n.notes}`).join('\n\n')
    : '— No recent notes'

  // ─── Fueling section ─────────────────────────────────────────────────────
  // Weekly fueling table: last 4 completed weeks + current week
  const fuelingWeeklyHeader = '| Wk | Dates | Status | Logged days | Protein hits | Cal under | Cal in range | Cal over | Low-carb days | Avg kcal | Avg protein g | Avg carbs g |\n' +
                               '|---|---|---|---|---|---|---|---|---|---|---|---|'
  const fuelingWeeklyRows = completedWeeks.map(w => {
    const f = w.fueling
    if (f.loggedDays < 4) {
      return `| ${w.wk} | ${w.startStr}–${w.endStr} | ${f.status} | ${f.loggedDays} | — | — | — | — | — | — | — | — |`
    }
    return `| ${w.wk} | ${w.startStr}–${w.endStr} | ${f.status} | ${f.loggedDays} | ${f.proteinHits} | ${f.calUnder} | ${f.calInRange} | ${f.calOver} | ${f.lowCarbDays} | ${f.avgKcal} | ${f.avgProtein} | ${f.avgCarbs} |`
  })
  const currFueling = computeWeeklyFuelingForRange(db, weekStartFor(wkNum), today)
  const currFuelingRow = currFueling.loggedDays < 4
    ? `| ${wkNum} (in progress) | ${weekStartFor(wkNum)}–${today} | ${currFueling.status} | ${currFueling.loggedDays} | — | — | — | — | — | — | — | — |`
    : `| ${wkNum} (in progress) | ${weekStartFor(wkNum)}–${today} | ${currFueling.status} | ${currFueling.loggedDays} | ${currFueling.proteinHits} | ${currFueling.calUnder} | ${currFueling.calInRange} | ${currFueling.calOver} | ${currFueling.lowCarbDays} | ${currFueling.avgKcal} | ${currFueling.avgProtein} | ${currFueling.avgCarbs} |`
  fuelingWeeklyRows.push(currFuelingRow)

  // 14-day daily fueling table
  const nut14 = db.prepare(
    'SELECT date, SUM(calories) as kcal, SUM(protein_g) as pro, SUM(carbs_g) as carbs, SUM(fat_g) as fat FROM nutrition_logs WHERE date>=? AND date<=? GROUP BY date ORDER BY date DESC'
  ).all(since14, today)
  // CN-5 #3 B1: per-discipline minutes for weighted train-min
  const discByDate14 = {}
  for (const l of db.prepare(
    'SELECT date, discipline, SUM(duration) as dur FROM logged_sessions WHERE date>=? AND date<=? GROUP BY date, discipline'
  ).all(since14, today)) {
    if (!discByDate14[l.date]) discByDate14[l.date] = {}
    discByDate14[l.date][l.discipline] = (discByDate14[l.date][l.discipline] || 0) + (l.dur || 0)
  }

  const fuelingDailyHeader = '| Date | Day type | Train min | kcal | Target range | Protein g | Carbs g | Flags |\n' +
                              '|---|---|---|---|---|---|---|---|'
  const fuelingDailyRows = nut14.map(r => {
    const discMins = discByDate14[r.date] || {}
    const rawMin = Object.values(discMins).reduce((s, v) => s + v, 0)
    const weightedMin = computeWeightedTrainMin(discMins)
    const weightedDisplay = Math.floor(weightedMin + 0.5)  // round half-up
    const trainMinStr = rawMin > 0 ? `${weightedDisplay} (${rawMin})` : '0'
    const kcal = Math.round(r.kcal || 0)
    const dayType = classifyDayType(weightedMin)
    const range = CALORIE_RANGES[dayType]
    const rangeStr = range ? `${range[0]}–${range[1]}` : '—'
    const protein = Math.round(r.pro || 0)
    const carbs = Math.round(r.carbs || 0)
    const flags = []
    if (!isComplete(kcal)) {
      flags.push('incomplete')
    } else {
      const cs = calorieStatus(kcal, dayType)
      if (cs === 'under') flags.push('under')
      else if (cs === 'over') flags.push('over')
      if (!hitsProtein(protein)) flags.push('protein low')
      if (isLowCarb(dayType, carbs)) flags.push('low carb')
    }
    return `| ${r.date} | ${dayType} | ${trainMinStr} | ${kcal} | ${rangeStr} | ${protein} | ${carbs} | ${flags.length > 0 ? flags.join(', ') : '—'} |`
  })

  // CN-5 #4 W1-W3: calendar-window weight trend (weightRowsAll already queried above)
  const trendResult = computeWeightTrend(weightRowsAll)
  let weightTrendLine
  if (trendResult) {
    const rateStr = trendResult.lossPerWeek > 0
      ? `${trendResult.lossPerWeek} lb/wk loss`
      : `${Math.abs(trendResult.lossPerWeek)} lb/wk gain`
    weightTrendLine = `Weight trend: ${trendResult.avgPrior} → ${trendResult.avgRecent} lb, ${rateStr}, "${trendResult.label}"`
  } else {
    weightTrendLine = 'Weight trend: insufficient data (need ≥3 weigh-ins per 7 days)'
  }
  // CN-5 #4 W5: weigh-ins last 7 days
  const weighInsLast7 = db.prepare(
    'SELECT COUNT(DISTINCT date) as cnt FROM body_composition WHERE weight_lb IS NOT NULL AND date>=? AND date<=?'
  ).get(dateAdd(today, -6), today)
  const weighInsLine = `Weigh-ins last 7 days: ${weighInsLast7.cnt} (target ≥4)`

  // T6 context: MFP date range and logged/incomplete counts
  const mfpRange = db.prepare(
    "SELECT MIN(date) as minDate, MAX(date) as maxDate, COUNT(DISTINCT date) as totalDates FROM nutrition_logs WHERE source='csv_myfitnesspal'"
  ).get() || {}
  const mfpDaySums = db.prepare(
    "SELECT date, SUM(calories) as kcal FROM nutrition_logs WHERE source='csv_myfitnesspal' GROUP BY date"
  ).all()
  const mfpLogged = mfpDaySums.filter(r => isComplete(r.kcal)).length
  const mfpIncomplete = mfpDaySums.length - mfpLogged
  const mfpRangeLine = mfpDaySums.length > 0
    ? `MFP data: ${mfpRange.minDate} to ${mfpRange.maxDate} | ${mfpLogged} logged days, ${mfpIncomplete} incomplete`
    : 'MFP data: none imported'

  // CN-5 #3 Part A: Data Freshness block
  const freshActivities = db.prepare('SELECT MAX(date) as d FROM logged_sessions').get()?.d || null
  const freshSleep = db.prepare(
    'SELECT MAX(date) as d FROM daily_wellness WHERE sleep_score IS NOT NULL OR sleep_hours IS NOT NULL'
  ).get()?.d || null
  const freshWeight = db.prepare(
    'SELECT MAX(date) as d FROM body_composition WHERE weight_lb IS NOT NULL'
  ).get()?.d || null
  const freshNutrition = db.prepare(
    "SELECT MAX(date) as d FROM nutrition_logs WHERE source='csv_myfitnesspal'"
  ).get()?.d || null
  const freshBenchmarks = db.prepare('SELECT MAX(date) as d FROM athlete_benchmarks').get()?.d || null

  const freshnessLines = [
    formatFreshness('Activities', freshActivities, today, false),
    formatFreshness('Sleep/wellness', freshSleep, today, false),
    formatFreshness('Weight', freshWeight, today, false),
    formatFreshness('Nutrition', freshNutrition, today, false),
    formatFreshness('Benchmarks', freshBenchmarks, today, true),
  ]
  const isStaleActivities  = freshActivities && (new Date(today + 'T00:00:00Z') - new Date(freshActivities + 'T00:00:00Z')) / 86400000 > 2
  const isStaleSleep       = freshSleep && (new Date(today + 'T00:00:00Z') - new Date(freshSleep + 'T00:00:00Z')) / 86400000 > 2
  const isStaleNutrition   = freshNutrition && (new Date(today + 'T00:00:00Z') - new Date(freshNutrition + 'T00:00:00Z')) / 86400000 > 2
  const anyCoreStaleness   = isStaleActivities || isStaleSleep || isStaleNutrition
  const dataFreshnessBlock = [
    ...freshnessLines,
    ...(anyCoreStaleness ? ['⚠ Import pending — Recovery/Fueling for the current week may be understated.'] : []),
  ].join('\n')

  // C2: pain alert — rolling 14-day window across all recent logged sessions
  const logged14ForPain = db.prepare(
    'SELECT reason FROM logged_sessions WHERE date>=? AND date<=? AND reason IS NOT NULL'
  ).all(since14, today)
  const painCount = computePainAlert(logged14ForPain)
  const painAlertLine = painCount >= 2
    ? `⚠ Pain alert: ${painCount} pain-flagged sessions in 14 days — coach review required.`
    : null

  // C5: stop-loss hint
  let stopLossHint = null
  if (completedWeeks.length >= 2) {
    const lastWk  = completedWeeks[0]
    const prevWk  = completedWeeks[1]
    const recovRed = lastWk.recovery.status === 'Red'
    const weightLoss = trendResult && trendResult.lossPerWeek > 0
    const rhrRise = (lastWk.recovery.avgRhr !== '—' && prevWk.recovery.avgRhr !== '—')
      && (lastWk.recovery.avgRhr - prevWk.recovery.avgRhr >= 3)
    if (recovRed && weightLoss && rhrRise) {
      stopLossHint = 'Strategy stop-loss: multiple Yellow signals — consider +150–300 kcal/day'
    }
  }

  // ─── Assemble markdown ────────────────────────────────────────────────────
  const lines = [
    ...(painAlertLine ? [painAlertLine, ''] : []),
    ...(stopLossHint ? [`> ⚠ **${stopLossHint}**`, ''] : []),
    '# IM_LP2027 Progress Snapshot',
    `Generated: ${formatGeneratedAt()} | Plan ID ${planId} v${activePlan?.version ?? '?'} | DB: ${dbAbsPath} | Spec: v2.0 | Spec changed: 2026-10-05 | Wk ${wkNum} of ${TOTAL_PLAN_WEEKS} — ${phaseName}`,
    `Next gate: ${nextGateStr}`,
    '',
    '## Data Freshness',
    dataFreshnessBlock,
    '',
    `## Weekly Scores — Last 4 Completed Weeks`,
    weeklyHeader,
    weeklyRows || '| — | No completed weeks yet | — | — | — | — | — | — | — | — | — | — | — | — |',
    intensityCheckLine,
    '',
    '## Recovery',
    recoveryHeader,
    recoveryTableRows.join('\n'),
    '',
    '## Fueling',
    fuelingWeeklyHeader,
    fuelingWeeklyRows.join('\n') || '| — | No data |',
    '',
    fuelingDailyHeader,
    fuelingDailyRows.join('\n') || '| — | — | — | — | — | — | — | — |',
    '',
    weightTrendLine,
    mfpRangeLine,
    '',
    '## Score Breakdown',
    breakdownSections.join('\n\n') || '— No completed weeks yet',
    '',
    `## Session Log — Last 14 Days`,
    sessionHeader,
    sessionRows || '| — | — | — | — | — | — | — | — | — | — | No sessions | — | — |',
    '',
    '### Extra Sessions (unplanned)',
    extraHeader,
    extraRows || '| — | — | — | — | — | — | — | — |',
    ...(unplannedNote ? ['', unplannedNote] : []),
    '',
    `## Wellness — Last 14 Days`,
    wellnessHeader,
    wellnessRows || '| — | — | — | — | — | — | — | — | — | — |',
    lateBedLine,
    '',
    `## Body Composition — Last 30 Days`,
    '7-day rolling average weight trend:',
    bcHeader,
    bcRows || '| — | — | — |',
    latestBFStr,
    weighInsLine,
    '',
    `## Benchmarks & Zones`,
    benchContent,
    '',
    activityRecords,
    '',
    `## Readiness Gates`,
    gateHeader,
    gateRows || '| — | — | — | — |',
    '',
    `## Next 7 Days`,
    next7Header,
    next7Rows || '| — | — | — | — | — | — | No upcoming sessions |',
    '',
    `## Athlete Notes`,
    athleteNotes,
    '',
  ]

  return lines.join('\n')
}

module.exports = { generateSnapshot }
