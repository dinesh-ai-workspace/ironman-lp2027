'use strict'

// Reference body mass (kg) for carb thresholds per CN-5 #2 B4
const BODY_MASS_KG = 68.5

// B2: calorie target ranges by day type
const CALORIE_RANGES = {
  Rest:     [1750, 2000],
  Easy:     [2000, 2300],
  Moderate: [2300, 2600],
  Hard:     [2550, 3150],
  Long:     [3000, 3800],
}

// B4: minimum carb thresholds (g) by day type
const CARB_THRESHOLDS = {
  Rest:     Math.ceil(3 * BODY_MASS_KG),   // 206
  Easy:     Math.ceil(3 * BODY_MASS_KG),   // 206
  Moderate: Math.ceil(5 * BODY_MASS_KG),   // 343
  Hard:     Math.ceil(6 * BODY_MASS_KG),   // 411
  Long:     Math.ceil(6 * BODY_MASS_KG),   // 411
}

// B1: classify by weighted training minutes (CN-5 #3)
function classifyDayType(trainMin) {
  if (trainMin <= 0)   return 'Rest'
  if (trainMin <= 75)  return 'Easy'
  if (trainMin <= 120) return 'Moderate'
  if (trainMin <= 180) return 'Hard'
  return 'Long'
}

// CN-5 #3 B1: weighted training minutes — swim/bike/run at 100%, everything else at 50%
function computeWeightedTrainMin(disciplineMinutes) {
  const FULL = new Set(['swim', 'bike', 'run'])
  let full = 0, half = 0
  for (const [disc, min] of Object.entries(disciplineMinutes)) {
    if (FULL.has(disc)) full += (min || 0)
    else half += (min || 0)
  }
  return full + half * 0.5
}

// CN-5 #3 C1: day is "logged" only if total calories ≥ 1,200
function isComplete(totalCalories) {
  return totalCalories >= 1200
}

// B3: protein hit if ≥ 140 g
function hitsProtein(protein_g) {
  return protein_g >= 140
}

// B4: "low carb" flag — only on Moderate/Hard/Long days
function isLowCarb(dayType, carbs_g) {
  const threshold = CARB_THRESHOLDS[dayType]
  if (threshold == null) return false
  if (dayType === 'Rest' || dayType === 'Easy') return false  // not flagged
  return carbs_g < threshold
}

// B5: calorie status relative to day-type range
function calorieStatus(totalCal, dayType) {
  const range = CALORIE_RANGES[dayType]
  if (!range) return null
  if (totalCal < range[0]) return 'under'
  if (totalCal > range[1]) return 'over'
  return 'in range'
}

// CN-5 #3 A1/A2: format a data freshness line; exempt sources skip the stale flag
function formatFreshness(label, latestDate, snapshotDate, exempt) {
  if (!latestDate) return `${label}: no data`
  const ageDays = Math.round(
    (new Date(snapshotDate + 'T00:00:00Z') - new Date(latestDate + 'T00:00:00Z')) / 86400000
  )
  const stale = !exempt && ageDays > 2
  return `${label}: ${latestDate} (${ageDays} d ago)${stale ? ' ⚠ stale' : ''}`
}

/**
 * C1 + C2: weekly fueling summary.
 * @param {Array} days  [{date, totalCal, protein_g, carbs_g, trainMin}]
 *   trainMin must be the weighted value (CN-5 #3 B1)
 */
function computeWeeklyFueling(days) {
  const logged = days.filter(d => isComplete(d.totalCal))
  const n = logged.length

  if (n < 4) return { status: 'Insufficient data', loggedDays: n }

  const proteinHits = logged.filter(d => hitsProtein(d.protein_g)).length

  const hardLongDays = logged.filter(d => ['Hard', 'Long'].includes(classifyDayType(d.trainMin)))
  const hardLongUnder = hardLongDays.filter(d =>
    calorieStatus(d.totalCal, classifyDayType(d.trainMin)) === 'under'
  ).length

  // Low-carb check only on Moderate/Hard/Long days
  const modHardLongDays = logged.filter(d => ['Moderate', 'Hard', 'Long'].includes(classifyDayType(d.trainMin)))
  const lowCarbDays = modHardLongDays.filter(d => isLowCarb(classifyDayType(d.trainMin), d.carbs_g)).length

  // Red if any training day (≥1 min) is below 1,600 kcal
  const trainingDayUnder1600 = logged.some(d => d.trainMin >= 1 && d.totalCal < 1600)

  let status
  if (proteinHits < 3 || hardLongUnder >= 3 || trainingDayUnder1600) {
    status = 'Red'
  } else if (proteinHits / n >= 0.70 && hardLongUnder === 0 && lowCarbDays <= 1) {
    status = 'Green'
  } else {
    status = 'Yellow'
  }

  // Aggregates
  const calRange = { under: 0, inRange: 0, over: 0 }
  for (const d of logged) {
    const s = calorieStatus(d.totalCal, classifyDayType(d.trainMin))
    if (s === 'under') calRange.under++
    else if (s === 'in range') calRange.inRange++
    else if (s === 'over') calRange.over++
  }

  const avgKcal    = Math.round(logged.reduce((s, d) => s + d.totalCal,    0) / n)
  const avgProtein = Math.round(logged.reduce((s, d) => s + d.protein_g,   0) / n)
  const avgCarbs   = Math.round(logged.reduce((s, d) => s + d.carbs_g,     0) / n)

  return {
    status, loggedDays: n, proteinHits,
    calUnder: calRange.under, calInRange: calRange.inRange, calOver: calRange.over,
    lowCarbDays, avgKcal, avgProtein, avgCarbs,
  }
}

// ─── CN-5 #4: Calendar-window weight trend (W1–W3) ───────────────────────────

function isoDateAdd(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * W1: 7-day average for anchorDate.
 * Returns rounded avg (1 dp) if ≥3 readings in the window [anchorDate-6, anchorDate],
 * or null if fewer than 3.
 * @param {string} anchorDate  'YYYY-MM-DD'
 * @param {Array}  weightRows  [{date: 'YYYY-MM-DD', weight_lb: number}] (one per date, pre-grouped)
 */
function sevenDayAvg(anchorDate, weightRows) {
  const from = isoDateAdd(anchorDate, -6)
  const window = weightRows.filter(r => r.date >= from && r.date <= anchorDate)
  if (window.length < 3) return null
  const avg = window.reduce((s, r) => s + r.weight_lb, 0) / window.length
  return Math.round(avg * 10) / 10
}

/**
 * W2: Weight trend using calendar-day windows.
 * Finds D_new (latest date with ≥3 readings) and D_old (latest date ≤ D_new−14 with ≥3 readings).
 * Returns { lossPerWeek, label, avgPrior, avgRecent, dNew, dOld } or null if insufficient.
 */
function computeWeightTrend(weightRows) {
  if (!weightRows || weightRows.length === 0) return null

  const dates = [...new Set(weightRows.map(r => r.date))].sort()

  // Find D_new
  let dNew = null, avgNew = null
  for (let i = dates.length - 1; i >= 0; i--) {
    const avg = sevenDayAvg(dates[i], weightRows)
    if (avg !== null) { dNew = dates[i]; avgNew = avg; break }
  }
  if (!dNew) return null

  // Find D_old: latest date ≤ dNew − 14 with ≥3 readings
  const dOldMax = isoDateAdd(dNew, -14)
  let dOld = null, avgOld = null
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] > dOldMax) continue
    const avg = sevenDayAvg(dates[i], weightRows)
    if (avg !== null) { dOld = dates[i]; avgOld = avg; break }
  }
  if (!dOld) return null

  // W2: divide by 2 (2-week span); round to 1 dp
  const rawRate = (avgOld - avgNew) / 2
  const lossPerWeek = Math.round(rawRate * 10) / 10

  // W3: label
  let label
  if (lossPerWeek > 1.0)       label = 'losing too fast'
  else if (lossPerWeek > 0.75) label = 'above target'
  else if (lossPerWeek >= 0.5) label = 'on target'
  else if (lossPerWeek > 0)    label = 'below target'
  else                          label = 'gaining'

  return { lossPerWeek, label, flag: label, avgPrior: avgOld, avgRecent: avgNew, dNew, dOld }
}

module.exports = {
  CALORIE_RANGES, CARB_THRESHOLDS, BODY_MASS_KG,
  classifyDayType, computeWeightedTrainMin, isComplete, hitsProtein, isLowCarb,
  calorieStatus, formatFreshness, computeWeeklyFueling,
  sevenDayAvg, computeWeightTrend,
}
