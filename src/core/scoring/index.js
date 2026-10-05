'use strict'

const IMP_W = { key: 10, supporting: 4, optional: 1 }

// ─── Credit ───────────────────────────────────────────────────────────────────

/**
 * Session credit, including overshoot rule for bike/run.
 * Swim never incurs an overshoot penalty.
 */
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

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * 3-pass greedy matching + score computation (Scoring v2).
 *
 * Changes from v1:
 *  - Optional sessions excluded from numerator AND denominator.
 *  - Bike/run sessions with actual > 125% of plan get credit = 80% (overshoot).
 *  - Swim has no overshoot penalty.
 *  - Grade caps: swim<75% coverage → max C; any KEY with 0% credit → max B.
 *  - Score rounded half-up to integer.
 *  - Intensity check (Z2 cap): applied when Z2 ceiling HR is in Benchmarks.
 *
 * @param {Array} plannedRows  - {id, discipline, type, importance, target_duration, date, target_intensity_zone}
 * @param {Array} loggedRows   - {id, discipline, duration, date, avg_hr}
 * @param {string} cutoffDate  - YYYY-MM-DD inclusive upper bound for planned sessions
 * @param {Object} options
 * @param {Object} options.z2Ceilings  - { bike: number|null, run: number|null } HR ceilings
 * @returns {Object|null}
 */
function computeScore(plannedRows, loggedRows, cutoffDate, options = {}) {
  const { z2Ceilings = {} } = options

  // Exclude optional sessions from scoring
  const included = plannedRows.filter(p => p.importance !== 'optional' && p.date <= cutoffDate)
  if (included.length === 0) return null

  const impOrder = { key: 0, supporting: 1, optional: 2 }

  // hasEarlierPlan guard
  const hasEarlierPlan = new Set()
  for (const l of loggedRows) {
    const prev = new Date(l.date + 'T00:00:00Z')
    prev.setUTCDate(prev.getUTCDate() - 1)
    const prevStr = prev.toISOString().slice(0, 10)
    const hasPrevPlan = included.some(p => p.discipline === l.discipline && p.date === prevStr)
    const hasOwnPlan  = included.some(p => p.discipline === l.discipline && p.date === l.date)
    if (hasPrevPlan && !hasOwnPlan) hasEarlierPlan.add(l.id)
  }

  function daysDiff(a, b) {
    return Math.abs((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000)
  }

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

  const usedIds = new Set()
  const matchMap = new Map()

  // Pass 1: same-day, importance-first
  const sortedByImp = [...included].sort((a, b) => {
    const di = (impOrder[a.importance] ?? 3) - (impOrder[b.importance] ?? 3)
    if (di !== 0) return di
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return b.target_duration - a.target_duration
  })
  for (const p of sortedByImp) {
    const candidates = loggedRows.filter(l =>
      l.discipline === p.discipline && !usedIds.has(l.id)
        && l.date === p.date && !hasEarlierPlan.has(l.id)
    )
    if (candidates.length > 0) {
      const best = pickBest(p, candidates)
      usedIds.add(best.id)
      matchMap.set(p, best)
    }
  }

  // Pass 2: cross-day, KEY only, ±2 days
  const keyPlans = included
    .filter(p => p.importance === 'key' && !matchMap.has(p))
    .sort((a, b) => a.date.localeCompare(b.date))
  for (const p of keyPlans) {
    const candidates = loggedRows.filter(l =>
      l.discipline === p.discipline && !usedIds.has(l.id)
        && daysDiff(l.date, p.date) <= 2
    )
    if (candidates.length > 0) {
      const best = pickBest(p, candidates, true)
      usedIds.add(best.id)
      matchMap.set(p, best)
    }
  }

  // Pass 3: cross-day, supporting, ±2 days
  const nonKeyPlans = included
    .filter(p => p.importance !== 'key' && !matchMap.has(p))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      const di = (impOrder[a.importance] ?? 3) - (impOrder[b.importance] ?? 3)
      return di !== 0 ? di : b.target_duration - a.target_duration
    })
  for (const p of nonKeyPlans) {
    const candidates = loggedRows.filter(l =>
      l.discipline === p.discipline && !usedIds.has(l.id)
        && daysDiff(l.date, p.date) <= 2
    )
    if (candidates.length > 0) {
      const best = pickBest(p, candidates, true)
      usedIds.add(best.id)
      matchMap.set(p, best)
    }
  }

  // Build match details and compute score
  let earned = 0
  let totalWeight = 0
  const matchDetails = []

  for (const p of included) {
    const w = IMP_W[p.importance] || 1
    totalWeight += w
    const matched = matchMap.get(p)

    let pct = null
    let credit = 0
    const flags = []

    if (matched) {
      pct = (matched.duration || 0) / p.target_duration
      credit = sessionCredit(pct, p.discipline)

      // Overshoot flag (bike/run > 125%)
      if ((p.discipline === 'bike' || p.discipline === 'run') && pct > 1.25) {
        flags.push('overshoot')
      }

      // Change 5: intensity check (Z2 sessions, inactive until zones set)
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

  // Grade cap: swim coverage
  const swimPlanned = loggedRows  // use ALL logged swim vs ALL planned swim for coverage
  const swimP = included.filter(p => p.discipline === 'swim').reduce((s, p) => s + p.target_duration, 0)
  const swimA = loggedRows.filter(l => l.discipline === 'swim').reduce((s, l) => s + (l.duration || 0), 0)

  let cap = '—'
  if (swimP > 0 && swimA / swimP < 0.75) cap = 'swim<75%'

  // Grade cap: KEY with 0% credit
  const keyZero = matchDetails.some(d => d.plan.importance === 'key' && d.credit === 0)
  if (keyZero) {
    if (cap !== 'swim<75%') cap = 'KEY missed'  // swim<75% (→C) is lower, wins if both
  }

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

// ─── Recovery ─────────────────────────────────────────────────────────────────

/**
 * Compute recovery stats for a set of wellness rows.
 * "Good night" = bedtime ≤ 23:30 AND sleep ≥ 6.5 h.
 * Bedtime "≤ 23:30" means: HH:MM falls between 05:01 and 23:30 (not after midnight).
 */
function computeRecovery(wellnessRows) {
  function isBedtimeOnTime(bedtime) {
    if (!bedtime || !/^\d{2}:\d{2}$/.test(bedtime)) return false
    const [h, m] = bedtime.split(':').map(Number)
    const mins = h * 60 + m
    return mins > 300 && mins <= 1410  // 05:01–23:30
  }

  const rowsWithBedtime = wellnessRows.filter(w => w.bedtime && /^\d{2}:\d{2}$/.test(w.bedtime))
  const nightsWithData = rowsWithBedtime.length
  const goodNights = wellnessRows.filter(w =>
    isBedtimeOnTime(w.bedtime) && (w.sleep_hours || 0) >= 6.5
  ).length

  const pct = nightsWithData > 0 ? Math.round(goodNights / nightsWithData * 100) : null
  let status = '—'
  if (pct != null) {
    if (pct >= 70) status = 'Green'
    else if (pct >= 40) status = 'Yellow'
    else status = 'Red'
  }

  // Average sleep hours
  const sleepVals = wellnessRows.filter(w => w.sleep_hours != null).map(w => w.sleep_hours)
  const avgSleepH = sleepVals.length > 0
    ? (sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length).toFixed(1)
    : '—'

  // Circular mean of bedtime (handles wrap around midnight)
  let avgBedtime = '—'
  if (rowsWithBedtime.length > 0) {
    let sinSum = 0, cosSum = 0
    for (const w of rowsWithBedtime) {
      const [h, m] = w.bedtime.split(':').map(Number)
      const theta = 2 * Math.PI * (h * 60 + m) / 1440
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

module.exports = { IMP_W, sessionCredit, gradeFromScore, computeScore, computeRecovery }
