'use strict'

const { computeScore, computeRecovery, IMP_W } = require('../core/scoring')

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAN_START_STR = '2026-09-14'
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
      'SELECT id, discipline, duration, date, avg_hr FROM logged_sessions WHERE date>=? AND date<=?'
    ).all(startStr, endStr)

    const wellnessRows = db.prepare(
      'SELECT * FROM daily_wellness WHERE date>=? AND date<=? ORDER BY date ASC'
    ).all(startStr, endStr)

    const scoreResult = computeScore(plannedRows, loggedRows, endStr)

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

    completedWeeks.push({
      wk, startStr, endStr,
      score: scoreResult?.score ?? null,
      grade: scoreResult?.grade ?? '—',
      cap: scoreResult?.cap ?? '—',
      earnedPts: scoreResult?.earnedPts ?? null,
      totalWeight: scoreResult?.totalWeight ?? null,
      matchDetails: scoreResult?.matchDetails ?? [],
      plannedH, actualH,
      swimA, swimP, bikeA, bikeP, runA, runP,
      strDone, strPlanned,
      keyDone, keyTotal,
      recovery,
    })
  }

  const weeklyHeader = '| Wk | Dates | Score | Grade | Cap | Planned h | Actual h | Swim A/P | Bike A/P | Run A/P | Str done/pl | KEYs done | Recovery |\n' +
                       '|---|---|---|---|---|---|---|---|---|---|---|---|---|'
  const weeklyRows = completedWeeks.map(w =>
    `| ${w.wk} | ${w.startStr}–${w.endStr} | ${w.score ?? '—'} | ${w.grade} | ${w.cap} | ${w.plannedH} | ${w.actualH} | ${w.swimA}/${w.swimP} | ${w.bikeA}/${w.bikeP} | ${w.runA}/${w.runP} | ${w.strDone}/${w.strPlanned} | ${w.keyDone}/${w.keyTotal} | ${w.recovery.status} |`
  ).join('\n')

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
      const wt = IMP_W[d.plan.importance] || 1
      const ratio = d.pct != null ? Math.round(d.pct * 100) + '%' : '—'
      const creditPct = Math.round(d.credit * 100) + '%'
      const pts = (wt * d.credit).toFixed(1)
      const flags = d.flags.length > 0 ? d.flags.join(', ') : '—'
      const actualMin = d.log ? fmtInt(d.log.duration) : '—'
      bLines.push(`| ${d.plan.date} | ${d.plan.discipline} | ${d.plan.importance} | ${wt} | ${d.plan.target_duration} | ${actualMin} | ${ratio} | ${creditPct} | ${pts} | ${flags} |`)
    }
    bLines.push(`**Total: ${(w.earnedPts ?? 0).toFixed(1)} ÷ ${w.totalWeight} = ${w.score}**`)
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
    SELECT * FROM logged_sessions WHERE date>=? AND date<=? ORDER BY date, discipline
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

  // Build session lines
  const sessionLines = []

  // Matched and unmatched planned sessions
  for (const p of planned14) {
    const m = matchMap14.get(p.id)
    if (m) {
      const { log } = m
      const pct = p.target_duration > 0 ? (log.duration || 0) / p.target_duration : null
      const dayDiff = days14(log.date, p.date)
      let status = '✓ matched'
      if (dayDiff > 0) status = `✓ matched (${log.date < p.date ? '-' : '+'}${Math.round(dayDiff)}d)`
      if (pct != null && pct < 0.85) status = status.replace('✓', '⚠')
      sessionLines.push({
        date: p.date, disc: p.discipline, tier: p.importance,
        planMin: p.target_duration, actualMin: fmtInt(log.duration),
        dist: log.distance != null ? fmt2(log.distance) : '—',
        pace: calcPace(p.discipline, log.duration, log.distance),
        avgHr: dash(log.avg_hr), powerPace: dash(log.avg_power),
        rpe: dash(log.rpe), status,
        note: (log.notes||'').slice(0, 40) || '—',
      })
    } else if (p.date < today) {
      sessionLines.push({ date: p.date, disc: p.discipline, tier: p.importance, planMin: p.target_duration, actualMin: '—', dist: '—', pace: '—', avgHr: '—', powerPace: '—', rpe: '—', status: '✗ missed', note: '—' })
    } else if (p.date === today) {
      sessionLines.push({ date: p.date, disc: p.discipline, tier: p.importance, planMin: p.target_duration, actualMin: '—', dist: '—', pace: '—', avgHr: '—', powerPace: '—', rpe: '—', status: '⏳ pending', note: '—' })
    }
    // future dates: skip
  }

  // Unmatched logged sessions (unplanned)
  for (const l of logged14) {
    if (!usedIds14.has(l.id)) {
      sessionLines.push({ date: l.date, disc: l.discipline, tier: '—', planMin: '—', actualMin: fmtInt(l.duration), dist: l.distance != null ? fmt2(l.distance) : '—', pace: calcPace(l.discipline, l.duration, l.distance), avgHr: dash(l.avg_hr), powerPace: dash(l.avg_power), rpe: dash(l.rpe), status: '+ unplanned', note: (l.notes||'').slice(0,40)||'—' })
    }
  }

  sessionLines.sort((a, b) => b.date.localeCompare(a.date))

  const sessionHeader = '| Date | Disc | Tier | Plan min | Actual min | Dist mi | Pace | Avg HR bpm | Power W | RPE | Status | Note |\n' +
                        '|---|---|---|---|---|---|---|---|---|---|---|---|'
  const sessionRows = sessionLines.map(s =>
    `| ${s.date} | ${s.disc} | ${s.tier} | ${s.planMin} | ${s.actualMin} | ${s.dist} | ${s.pace} | ${s.avgHr} | ${s.powerPace} | ${s.rpe} | ${s.status} | ${s.note} |`
  ).join('\n')

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

  // 7-day rolling average
  const weightByDate = {}
  for (const r of bodyComp30) {
    if (r.weight_lb != null) weightByDate[r.date] = r.weight_lb
  }

  const sortedDates = Object.keys(weightByDate).sort()
  const bcRows = bodyComp30.map(r => {
    // Find dates within 6 days before this date for rolling avg
    const idx = sortedDates.indexOf(r.date)
    let rollingVals = []
    for (let i = Math.max(0, idx - 6); i <= idx; i++) {
      const v = weightByDate[sortedDates[i]]
      if (v != null) rollingVals.push(v)
    }
    const rollingAvg = rollingVals.length > 0
      ? (rollingVals.reduce((a, b) => a + b, 0) / rollingVals.length).toFixed(1)
      : '—'
    return `| ${r.date} | ${dash(r.weight_lb != null ? fmt1(r.weight_lb) : null)} | ${rollingAvg} |`
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

  const benchHeader = '| Metric | Value | Unit | Date | Method |\n|---|---|---|---|---|'
  const benchRows = Object.values(latestBenchmarks).map(b =>
    `| ${b.metric} | ${fmt1(b.value)} | ${b.unit || '—'} | ${b.date} | ${b.method} |`
  ).join('\n')

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
  const gates = db.prepare(
    'SELECT * FROM readiness_gates WHERE plan_id=? ORDER BY week_num ASC, discipline ASC'
  ).all(planId)

  const gateHeader = '| Gate | Week | Status | Evidence |\n|---|---|---|---|'
  const gateRows = gates.map(g =>
    `| ${g.discipline} ${g.metric} | ${g.week_num} | ${g.status} | ${dash(g.actual_value)} |`
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

  // ─── Assemble markdown ────────────────────────────────────────────────────
  const lines = [
    '# IM_LP2027 Progress Snapshot',
    `Generated: ${formatGeneratedAt()} | Plan ID ${planId} v${activePlan?.version ?? '?'} | DB: ${db.name} | Spec: v1.0 | Spec changed: 2026-10-04 | Wk ${wkNum} of ${TOTAL_PLAN_WEEKS} — ${phaseName}`,
    `Next gate: ${nextGateStr}`,
    '',
    `## Weekly Scores — Last 4 Completed Weeks`,
    weeklyHeader,
    weeklyRows || '| — | No completed weeks yet | — | — | — | — | — | — | — | — | — | — | — |',
    'Intensity check: inactive (zones not set)',
    '',
    '## Recovery',
    recoveryHeader,
    recoveryTableRows.join('\n'),
    '',
    '## Score Breakdown',
    breakdownSections.join('\n\n') || '— No completed weeks yet',
    '',
    `## Session Log — Last 14 Days`,
    sessionHeader,
    sessionRows || '| — | — | — | — | — | — | — | — | — | — | No sessions | — |',
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
    '',
    `## Benchmarks & Zones`,
    benchHeader,
    benchRows || '| — | — | — | — | — |',
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
