'use strict'

const IMP_W = { key: 10, supporting: 4, optional: 1 }

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dateAdd(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = d.getUTCDay()          // 0=Sun, 1=Mon … 6=Sat
  const daysBack = (dow + 6) % 7    // days back to Monday
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

function getWeekEnd(dateStr) {
  return dateAdd(getWeekStart(dateStr), 6)  // Sunday
}

function daysDiff(a, b) {
  return Math.abs((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000)
}

// ─── A2: Same-day merge ────────────────────────────────────────────────────────

function mergeLogsByDayDisc(loggedRows) {
  const map = new Map()
  for (const l of loggedRows) {
    const key = l.date + '|' + l.discipline
    if (!map.has(key)) {
      map.set(key, { ...l, _ids: [l.id] })
    } else {
      const m = map.get(key)
      m.duration = (m.duration || 0) + (l.duration || 0)
      if (l.avg_hr != null) {
        m.avg_hr = m.avg_hr != null ? Math.max(m.avg_hr, l.avg_hr) : l.avg_hr
      }
      m._ids.push(l.id)
    }
  }
  return [...map.values()]
}

// ─── Credit ───────────────────────────────────────────────────────────────────

function sessionCredit(pct, discipline) {
  if ((discipline === 'bike' || discipline === 'run') && pct > 1.25) return 0.8
  if (pct >= 0.85) return 1.0
  if (pct >= 0.70) return 0.60
  if (pct >= 0.50) return 0.25
  return 0
}

// ─── Grade ────────────────────────────────────────────────────────────────────

function gradeFromScore(score) {
  if (score == null) return '—'
  if (score >= 90) return 'A'
  if (score >= 70) return 'B'
  if (score >= 50) return 'C'
  return 'D'
}

function applyGradeCap(grade, cap) {
  const order = { A: 4, B: 3, C: 2, D: 1 }
  const maxGrade = cap === 'swim<75%' ? 'C' : cap === 'KEY missed' ? 'B' : null
  if (!maxGrade) return grade
  if ((order[grade] || 0) > (order[maxGrade] || 0)) return maxGrade
  return grade
}

// ─── Scoring (v2, rules A1–A11) ───────────────────────────────────────────────

// A4: types that only match on their planned date (no cross-day)
const SAME_DAY_ONLY_TYPES = new Set(['brick_run', 'race_simulation', 'race'])
// A8: test sessions get flat credit (100% if ratio ≥ 0.50)
const TEST_TYPES = new Set(['ftp_test', 'time_trial'])

/**
 * 3-pass greedy matching + score computation (Scoring v2 with A1–A11).
 *
 * @param {Array}  plannedRows  {id, discipline, type, importance, target_duration, date, target_intensity_zone}
 * @param {Array}  loggedRows   {id, discipline, duration, date, avg_hr}
 * @param {string} cutoffDate   YYYY-MM-DD upper bound (weekEnd for past weeks, today for current)
 * @param {Object} options
 * @param {Object} options.z2Ceilings  {bike: number|null, run: number|null}
 * @param {string} options.today       actual current date (ET); defaults to cutoffDate
 */
function computeScore(plannedRows, loggedRows, cutoffDate, options = {}) {
  const { z2Ceilings = {}, today = cutoffDate } = options

  // Exclude optional sessions
  const included = plannedRows.filter(p => p.importance !== 'optional' && p.date <= cutoffDate)
  if (included.length === 0) return null

  const impOrder = { key: 0, supporting: 1, optional: 2 }

  // A2: merge same-day same-discipline logs before matching
  const mergedLogs = mergeLogsByDayDisc(loggedRows)

  // hasEarlierPlan guard — computed on original rows, then mapped onto merged
  const hasEarlierPlanOrigIds = new Set()
  for (const l of loggedRows) {
    const prev = dateAdd(l.date, -1)
    const hasPrevPlan = included.some(p => p.discipline === l.discipline && p.date === prev)
    const hasOwnPlan  = included.some(p => p.discipline === l.discipline && p.date === l.date)
    if (hasPrevPlan && !hasOwnPlan) hasEarlierPlanOrigIds.add(l.id)
  }
  const hasEarlierPlanMergedIds = new Set()
  for (const m of mergedLogs) {
    if ((m._ids || [m.id]).some(id => hasEarlierPlanOrigIds.has(id))) {
      hasEarlierPlanMergedIds.add(m.id)
    }
  }

  // A5: a session is pending (excluded from score+caps) until the cross-day window closes
  // Applies only to the current week (cutoffDate < weekEnd); past weeks are always final.
  function isPending(p) {
    const weekEnd = getWeekEnd(p.date)
    if (cutoffDate >= weekEnd) return false  // past week: finalized
    return today <= dateAdd(p.date, 2)       // still within ±2-day window
  }

  // Merged-log bookkeeping
  const usedIds = new Set()
  function useLog(l)  { for (const id of (l._ids || [l.id])) usedIds.add(id) }
  function isUsed(l)  { return (l._ids || [l.id]).some(id => usedIds.has(id)) }

  function pickBest(plan, candidates, crossDay = false) {
    return candidates.reduce((best, l) => {
      if (crossDay) {
        const dDist = daysDiff(l.date, plan.date)
        const bDist = daysDiff(best.date, plan.date)
        if (dDist !== bDist) return dDist < bDist ? l : best
        const ld = l.duration || 0, bd2 = best.duration || 0
        if (ld !== bd2) return ld > bd2 ? l : best
      } else {
        const dd = Math.abs((l.duration || 0) - plan.target_duration)
        const bd2 = Math.abs((best.duration || 0) - plan.target_duration)
        if (dd !== bd2) return dd < bd2 ? l : best
      }
      if (l.date !== best.date) return l.date < best.date ? l : best
      return l.id <= best.id ? l : best
    })
  }

  const matchMap = new Map()

  // Pre-pass: A9 Race sessions — 100% if multisport/triathlon activity OR any swim/bike/run logs on race date
  for (const p of included.filter(p => p.discipline === 'race')) {
    const raceLogs = mergedLogs.filter(l =>
      !isUsed(l) && l.date === p.date &&
      ['swim', 'bike', 'run', 'race', 'multisport', 'triathlon'].includes(l.discipline)
    )
    if (raceLogs.length > 0) {
      const totalDur = raceLogs.reduce((s, l) => s + (l.duration || 0), 0)
      const synthetic = {
        id: p.date + '_race', date: p.date, discipline: 'race',
        duration: totalDur, avg_hr: null,
        _ids: raceLogs.flatMap(l => l._ids || [l.id]),
      }
      for (const l of raceLogs) useLog(l)
      matchMap.set(p, synthetic)
    }
  }

  // Pass 1: same-day, importance-first (skip race — already handled above)
  const sortedByImp = [...included]
    .filter(p => p.discipline !== 'race')
    .sort((a, b) => {
      const di = (impOrder[a.importance] ?? 3) - (impOrder[b.importance] ?? 3)
      if (di !== 0) return di
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return b.target_duration - a.target_duration
    })
  for (const p of sortedByImp) {
    const cands = mergedLogs.filter(l =>
      l.discipline === p.discipline && !isUsed(l)
        && l.date === p.date && !hasEarlierPlanMergedIds.has(l.id)
    )
    if (cands.length > 0) {
      const best = pickBest(p, cands)
      useLog(best); matchMap.set(p, best)
    }
  }

  // Pass 2: cross-day, KEY only, ±2 days, same week (A3), skip same-day-only types (A4)
  const keyPlans = included
    .filter(p => p.importance === 'key' && !matchMap.has(p) &&
      !SAME_DAY_ONLY_TYPES.has(p.type) && p.discipline !== 'race')
    .sort((a, b) => a.date.localeCompare(b.date))
  for (const p of keyPlans) {
    const cands = mergedLogs.filter(l =>
      l.discipline === p.discipline && !isUsed(l)
        && daysDiff(l.date, p.date) <= 2
        && getWeekStart(l.date) === getWeekStart(p.date)  // A3: clip to week
    )
    if (cands.length > 0) {
      const best = pickBest(p, cands, true)
      useLog(best); matchMap.set(p, best)
    }
  }

  // Pass 3: cross-day, supporting, ±2 days, same week (A3), skip same-day-only types (A4)
  const nonKeyPlans = included
    .filter(p => p.importance !== 'key' && !matchMap.has(p) &&
      !SAME_DAY_ONLY_TYPES.has(p.type) && p.discipline !== 'race')
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      const di = (impOrder[a.importance] ?? 3) - (impOrder[b.importance] ?? 3)
      return di !== 0 ? di : b.target_duration - a.target_duration
    })
  for (const p of nonKeyPlans) {
    const cands = mergedLogs.filter(l =>
      l.discipline === p.discipline && !isUsed(l)
        && daysDiff(l.date, p.date) <= 2
        && getWeekStart(l.date) === getWeekStart(p.date)  // A3: clip to week
    )
    if (cands.length > 0) {
      const best = pickBest(p, cands, true)
      useLog(best); matchMap.set(p, best)
    }
  }

  // Build match details and compute score
  let earned = 0
  let totalWeight = 0
  const matchDetails = []

  for (const p of included) {
    const matched = matchMap.get(p)

    // A5: pending — exclude from score and caps
    if (!matched && isPending(p)) {
      matchDetails.push({ plan: p, log: null, pct: null, credit: null, flags: ['pending'] })
      continue
    }

    const w = IMP_W[p.importance] || 1
    totalWeight += w

    let pct = null
    let credit = 0
    const flags = []

    if (matched) {
      pct = (matched.duration || 0) / p.target_duration

      if (p.discipline === 'race') {
        // A9: race always 100% if matched
        credit = 1.0
      } else if (TEST_TYPES.has(p.type)) {
        // A8: test session — 100% if ratio ≥ 0.50, no overshoot or intensity modifiers
        credit = pct >= 0.50 ? 1.0 : 0.0
      } else {
        // A6: standard credit tiers (pct > 1.25 is overshoot; exactly 1.25 is not)
        credit = sessionCredit(pct, p.discipline)

        if ((p.discipline === 'bike' || p.discipline === 'run') && pct > 1.25) {
          flags.push('overshoot')
        }

        // A7: intensity check multiplies credit (overshoot × too hard = 0.8 × 0.6 = 0.48)
        const ceiling = z2Ceilings[p.discipline]
        if (
          ceiling != null && matched.avg_hr != null &&
          (p.importance === 'key' || p.importance === 'supporting') &&
          p.target_intensity_zone === 2 &&
          matched.avg_hr > ceiling + 5
        ) {
          credit = credit * 0.6
          flags.push('too hard')
        }
      }
    } else {
      flags.push('missed')
    }

    earned += w * credit
    matchDetails.push({ plan: p, log: matched || null, pct, credit, flags })
  }

  // Score: half-up rounding
  const rawScore = totalWeight > 0 ? earned / totalWeight * 100 : null
  const score = rawScore != null ? Math.floor(rawScore + 0.5) : null

  const baseGrade = gradeFromScore(score)

  // A10: swim coverage = ALL logged swim / planned NON-OPTIONAL swim
  const swimP = included.filter(p => p.discipline === 'swim').reduce((s, p) => s + p.target_duration, 0)
  const swimA = loggedRows.filter(l => l.discipline === 'swim').reduce((s, l) => s + (l.duration || 0), 0)

  let cap = '—'
  if (swimP > 0 && swimA / swimP < 0.75) cap = 'swim<75%'

  // A11: KEY-missed cap only for sessions flagged 'missed' (not 'pending')
  const keyMissed = matchDetails.some(d =>
    d.plan.importance === 'key' && d.flags.includes('missed')
  )
  if (keyMissed && cap !== 'swim<75%') cap = 'KEY missed'

  const grade = applyGradeCap(baseGrade, cap)

  return {
    score,
    grade,
    cap,
    earnedPts: Math.round(earned * 10) / 10,
    totalWeight,
    matchDetails,
  }
}

// ─── Recovery (rules C1–C4) ───────────────────────────────────────────────────

function computeRecovery(wellnessRows) {
  function getBedtimeMins(bedtime) {
    if (!bedtime || !/^\d{2}:\d{2}$/.test(bedtime)) return null
    const [h, m] = bedtime.split(':').map(Number)
    return h * 60 + m
  }

  // C1: 18:00–23:59 = evening; 00:00–05:59 = after midnight; 06:00–17:59 = nap (ignore)
  function isValidBedtime(mins) {
    return (mins >= 1080 && mins <= 1439) || (mins >= 0 && mins <= 359)
  }

  // C2: good night = bedtime 18:00–23:30 (inclusive) AND sleep ≥ 6.5 h
  function isGoodBedtime(mins) {
    return mins >= 1080 && mins <= 1410
  }

  const rowsWithData = wellnessRows.filter(w => {
    const mins = getBedtimeMins(w.bedtime)
    return mins !== null && isValidBedtime(mins)
  })
  const nightsWithData = rowsWithData.length

  const goodNights = rowsWithData.filter(w => {
    const mins = getBedtimeMins(w.bedtime)
    return isGoodBedtime(mins) && (w.sleep_hours || 0) >= 6.5
  }).length

  const pct = nightsWithData > 0 ? Math.round(goodNights / nightsWithData * 100) : null

  // C4: fewer than 4 nights with data → "insufficient data"
  let status = '—'
  if (nightsWithData > 0 && nightsWithData < 4) {
    status = 'insufficient data'
  } else if (pct != null) {
    if (pct >= 70) status = 'Green'
    else if (pct >= 40) status = 'Yellow'
    else status = 'Red'
  }

  // Average sleep hours (all rows)
  const sleepVals = wellnessRows.filter(w => w.sleep_hours != null).map(w => w.sleep_hours)
  const avgSleepH = sleepVals.length > 0
    ? (sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length).toFixed(1)
    : '—'

  // Circular mean of bedtime (valid bedtimes only — C1)
  let avgBedtime = '—'
  if (rowsWithData.length > 0) {
    let sinSum = 0, cosSum = 0
    for (const w of rowsWithData) {
      const mins = getBedtimeMins(w.bedtime)
      const theta = 2 * Math.PI * mins / 1440
      sinSum += Math.sin(theta)
      cosSum += Math.cos(theta)
    }
    const meanAngle = Math.atan2(sinSum, cosSum)
    const meanMins = Math.round(((meanAngle * 1440 / (2 * Math.PI)) + 1440) % 1440)
    const hh = Math.floor(meanMins / 60)
    const mm = meanMins % 60
    avgBedtime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  // Average RHR
  const rhrVals = wellnessRows.filter(w => w.resting_hr != null).map(w => w.resting_hr)
  const avgRhr = rhrVals.length > 0
    ? Math.round(rhrVals.reduce((a, b) => a + b, 0) / rhrVals.length)
    : '—'

  // Average Body Battery
  const bbVals = wellnessRows.filter(w => w.body_battery != null).map(w => w.body_battery)
  const avgBb = bbVals.length > 0
    ? Math.round(bbVals.reduce((a, b) => a + b, 0) / bbVals.length)
    : '—'

  return { goodNights, nightsWithData, pct, status, avgSleepH, avgBedtime, avgRhr, avgBb }
}

module.exports = { IMP_W, sessionCredit, gradeFromScore, computeScore, computeRecovery, dateAdd, getWeekStart, getWeekEnd }
