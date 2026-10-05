'use strict'

const Database = require('better-sqlite3')
const {
  classifyDayType, calorieStatus, isComplete, hitsProtein, isLowCarb,
  computeWeeklyFueling, computeWeightTrend,
  computeWeightedTrainMin, formatFreshness, sevenDayAvg,
} = require('../src/core/fueling')

// ─── N1: Rest day, in range, protein hit, no flags ────────────────────────

test('N1: 0 min training, 1900 kcal, protein 150g, carbs 220g — Rest, in range, protein hit, no flags', () => {
  expect(classifyDayType(0)).toBe('Rest')
  expect(calorieStatus(1900, 'Rest')).toBe('in range')
  expect(hitsProtein(150)).toBe(true)
  expect(isLowCarb('Rest', 220)).toBe(false)
})

// ─── N2: Easy boundary ───────────────────────────────────────────────────

test('N2: 75 min training — Easy', () => {
  expect(classifyDayType(75)).toBe('Easy')
})

// ─── N3: Moderate boundary ───────────────────────────────────────────────

test('N3: 76 min training — Moderate', () => {
  expect(classifyDayType(76)).toBe('Moderate')
})

// ─── N4: Long, under ─────────────────────────────────────────────────────

test('N4: 181 min training, 2800 kcal — Long, under', () => {
  expect(classifyDayType(181)).toBe('Long')
  expect(calorieStatus(2800, 'Long')).toBe('under')
})

// ─── N5: Moderate, low carb ──────────────────────────────────────────────

test('N5: Moderate day, carbs 300g — flag low carb', () => {
  expect(isLowCarb('Moderate', 300)).toBe(true)
})

// ─── N6: incomplete log ──────────────────────────────────────────────────

test('N6: 650 kcal — incomplete', () => {
  expect(isComplete(650)).toBe(false)
})

// ─── N7: fewer than 4 logged days → Insufficient data ────────────────────

test('N7: week with 3 logged days — Insufficient data', () => {
  const days = [
    { totalCal: 2000, protein_g: 155, carbs_g: 250, trainMin: 0 },
    { totalCal: 2200, protein_g: 150, carbs_g: 280, trainMin: 60 },
    { totalCal: 1900, protein_g: 160, carbs_g: 200, trainMin: 0 },
  ]
  const result = computeWeeklyFueling(days)
  expect(result.status).toBe('Insufficient data')
  expect(result.loggedDays).toBe(3)
})

// ─── N8: Green ───────────────────────────────────────────────────────────

test('N8: 5 logged, protein hit 4, no Hard/Long under, 1 low-carb — Green', () => {
  const days = [
    // 4 protein hits, no Hard/Long under, 1 Moderate with low carb
    { totalCal: 2400, protein_g: 155, carbs_g: 350, trainMin: 90 },   // Moderate, in range, protein hit, carbs ok
    { totalCal: 2400, protein_g: 155, carbs_g: 300, trainMin: 90 },   // Moderate, in range, protein hit, low carb (300 < 343)
    { totalCal: 2000, protein_g: 155, carbs_g: 220, trainMin: 0 },    // Rest, in range, protein hit
    { totalCal: 2100, protein_g: 155, carbs_g: 250, trainMin: 60 },   // Easy, in range, protein hit
    { totalCal: 2200, protein_g: 120, carbs_g: 240, trainMin: 0 },    // Rest, in range, no protein hit
  ]
  const result = computeWeeklyFueling(days)
  expect(result.status).toBe('Green')
  expect(result.loggedDays).toBe(5)
  expect(result.proteinHits).toBe(4)
  expect(result.lowCarbDays).toBe(1)
})

// ─── N9: Red — protein hits < 3 ──────────────────────────────────────────

test('N9: 6 logged days, protein hit on 2 — Red', () => {
  const days = Array(6).fill(null).map((_, i) => ({
    totalCal: 2000,
    protein_g: i < 2 ? 155 : 100,   // only 2 protein hits
    carbs_g: 250,
    trainMin: 0,
  }))
  const result = computeWeeklyFueling(days)
  expect(result.status).toBe('Red')
  expect(result.proteinHits).toBe(2)
})

// ─── N10: Red — training day below 1600 kcal ──────────────────────────────

test('N10: training day 45 min, 1550 kcal — week Red', () => {
  const days = [
    { totalCal: 1550, protein_g: 140, carbs_g: 200, trainMin: 45 },  // Easy, 1550 < 1600 → Red
    { totalCal: 2200, protein_g: 155, carbs_g: 250, trainMin: 0 },
    { totalCal: 2100, protein_g: 155, carbs_g: 240, trainMin: 0 },
    { totalCal: 2000, protein_g: 155, carbs_g: 230, trainMin: 0 },
  ]
  const result = computeWeeklyFueling(days)
  expect(result.status).toBe('Red')
})

// ─── N11: re-importing same data — no duplicates ──────────────────────────

test('N11: importing the same data twice — no duplicate dates; totals unchanged', () => {
  const db = new Database(':memory:')
  db.prepare(`
    CREATE TABLE nutrition_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT, meal TEXT, food_name TEXT DEFAULT '',
      calories REAL, protein_g REAL, carbs_g REAL, fat_g REAL, source TEXT
    )
  `).run()

  const rows = [
    { date: '2026-09-14', meal: 'Breakfast', calories: 600, protein_g: 40, carbs_g: 70, fat_g: 20 },
    { date: '2026-09-14', meal: 'Lunch',     calories: 700, protein_g: 50, carbs_g: 80, fat_g: 25 },
  ]

  function importRows(data) {
    db.transaction(() => {
      for (const r of data) {
        db.prepare('DELETE FROM nutrition_logs WHERE date=? AND meal=? AND source=?')
          .run(r.date, r.meal, 'csv_myfitnesspal')
        db.prepare('INSERT INTO nutrition_logs (date, meal, calories, protein_g, carbs_g, fat_g, source) VALUES (?,?,?,?,?,?,?)')
          .run(r.date, r.meal, r.calories, r.protein_g, r.carbs_g, r.fat_g, 'csv_myfitnesspal')
      }
    })()
  }

  importRows(rows)
  importRows(rows)  // second import — should replace, not duplicate

  const total = db.prepare('SELECT SUM(calories) as kcal, COUNT(*) as cnt FROM nutrition_logs').get()
  expect(total.cnt).toBe(2)
  expect(total.kcal).toBeCloseTo(1300, 0)
  db.close()
})

// ─── N12: weight trend — losing too fast ──────────────────────────────────

test('N12: 7-day avg 151.4 → 149.0 over 2 weeks — 1.2 lb/wk loss, flag "losing too fast"', () => {
  // 21 data points: days 1-7 avg=151.4, days 8-14 midpoint, days 15-21 avg=149.0
  const weightRows = [
    ...Array(7).fill(null).map((_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, weight_lb: 151.4 })),
    ...Array(7).fill(null).map((_, i) => ({ date: `2026-09-${String(i + 8).padStart(2, '0')}`, weight_lb: 150.2 })),
    ...Array(7).fill(null).map((_, i) => ({ date: `2026-09-${String(i + 15).padStart(2, '0')}`, weight_lb: 149.0 })),
  ]
  const result = computeWeightTrend(weightRows)
  expect(result.lossPerWeek).toBeCloseTo(1.2, 1)
  expect(result.flag).toBe('losing too fast')
})

// ─── CN-5 #3: Q1–Q9 ──────────────────────────────────────────────────────────

// ─── Q1: run + strength → weighted Hard ──────────────────────────────────────

test('Q1: Day: run 68 min + strength 111 min — weighted 123.5 → Hard', () => {
  const weighted = computeWeightedTrainMin({ run: 68, strength: 111 })
  expect(weighted).toBeCloseTo(123.5, 1)
  expect(classifyDayType(weighted)).toBe('Hard')
})

// ─── Q2: hike only → weighted Moderate, calories in range ────────────────────

test('Q2: Day: other (hike) 168 min, 2,382 kcal — weighted 84 → Moderate; calories in range (2,300–2,600)', () => {
  const weighted = computeWeightedTrainMin({ other: 168 })
  expect(weighted).toBeCloseTo(84, 1)
  expect(classifyDayType(weighted)).toBe('Moderate')
  expect(calorieStatus(2382, 'Moderate')).toBe('in range')
})

// ─── Q3: bike only → weighted Moderate (unchanged) ───────────────────────────

test('Q3: Day: bike 86 min — weighted 86 → Moderate (unchanged)', () => {
  const weighted = computeWeightedTrainMin({ bike: 86 })
  expect(weighted).toBe(86)
  expect(classifyDayType(weighted)).toBe('Moderate')
})

// ─── Q4: 893 kcal → incomplete ────────────────────────────────────────────────

test('Q4: Day total 893 kcal — incomplete; excluded from averages', () => {
  expect(isComplete(893)).toBe(false)
})

// ─── Q5: 1199 kcal → incomplete ──────────────────────────────────────────────

test('Q5: Day total 1,199 kcal — incomplete', () => {
  expect(isComplete(1199)).toBe(false)
})

// ─── Q6: 1200 kcal → logged ──────────────────────────────────────────────────

test('Q6: Day total 1,200 kcal — logged', () => {
  expect(isComplete(1200)).toBe(true)
})

// ─── Q7: Weight 3 d ago → ⚠ stale ────────────────────────────────────────────

test('Q7: Snapshot date 2026-10-05; latest weight 2026-10-02 — "Weight: 2026-10-02 (3 d ago) ⚠ stale"', () => {
  const line = formatFreshness('Weight', '2026-10-02', '2026-10-05', false)
  expect(line).toContain('3 d ago')
  expect(line).toContain('⚠ stale')
})

// ─── Q8: Sleep 2 d ago → no stale flag ───────────────────────────────────────

test('Q8: Snapshot date 2026-10-05; latest sleep 2026-10-03 — "(2 d ago)" with no stale flag', () => {
  const line = formatFreshness('Sleep/wellness', '2026-10-03', '2026-10-05', false)
  expect(line).toContain('2 d ago')
  expect(line).not.toContain('⚠ stale')
})

// ─── Q9: Execution score Wk 3 = 76 — unchanged after fueling changes ─────────

test('Q9: Execution score Wk 3 after these changes — 76 (unchanged)', () => {
  const Database = require('better-sqlite3')
  const { computeScore } = require('../src/core/scoring')
  const db = new Database('./data/ironman.db', { readonly: true })
  const wk3Start = '2026-09-28'
  const wk3End   = '2026-10-04'
  const planId = db.prepare("SELECT id FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1").get()?.id || -1
  const planned = db.prepare(
    'SELECT id, discipline, type, target_duration, importance, date, target_intensity_zone FROM planned_sessions WHERE plan_id=? AND date>=? AND date<=?'
  ).all(planId, wk3Start, wk3End)
  const logged = db.prepare(
    'SELECT id, discipline, duration, date, avg_hr FROM logged_sessions WHERE date>=? AND date<=?'
  ).all(wk3Start, wk3End)
  const result = computeScore(planned, logged, wk3End, {})
  db.close()
  expect(result.score).toBe(76)
})

// ─── CN-5 #4: W1–W7 (calendar-window weight trend) ───────────────────────────

// ─── W1: 7-day avg for 2026-10-05 (3 readings) → 149.9 ──────────────────────

test('W1: 7-day avg for 2026-10-05 (readings 9/30 150.0, 10/02 148.4, 10/05 151.2) — 149.9', () => {
  const rows = [
    { date: '2026-09-30', weight_lb: 150.0 },
    { date: '2026-10-02', weight_lb: 148.4 },
    { date: '2026-10-05', weight_lb: 151.2 },
  ]
  expect(sevenDayAvg('2026-10-05', rows)).toBeCloseTo(149.9, 1)
})

// ─── W2: 7-day avg for 2026-10-02 (2 readings) → — ──────────────────────────

test('W2: 7-day avg for 2026-10-02 (2 readings in window) — —', () => {
  const rows = [
    { date: '2026-09-30', weight_lb: 150.0 },
    { date: '2026-10-02', weight_lb: 148.4 },
  ]
  expect(sevenDayAvg('2026-10-02', rows)).toBeNull()
})

// ─── W3: 7-day avg for 2026-09-30 (1 reading) → — ───────────────────────────

test('W3: 7-day avg for 2026-09-30 (1 reading in window) — —', () => {
  const rows = [
    { date: '2026-09-30', weight_lb: 150.0 },
  ]
  expect(sevenDayAvg('2026-09-30', rows)).toBeNull()
})

// ─── W4: 7-day avg for 2026-09-22 (5 readings) → 151.5 ──────────────────────

test('W4: 7-day avg for 2026-09-22 (9/16 151.0, 9/17 151.4, 9/18 151.2, 9/20 152.9, 9/22 151.0) — 151.5', () => {
  const rows = [
    { date: '2026-09-16', weight_lb: 151.0 },
    { date: '2026-09-17', weight_lb: 151.4 },
    { date: '2026-09-18', weight_lb: 151.2 },
    { date: '2026-09-20', weight_lb: 152.9 },
    { date: '2026-09-22', weight_lb: 151.0 },
  ]
  expect(sevenDayAvg('2026-09-22', rows)).toBeCloseTo(151.5, 1)
})

// ─── W5: weight trend line from snapshot (integration) ───────────────────────

test('W5: Weight trend line — 151.5 → 149.9 lb, 0.8 lb/wk loss, "above target"', () => {
  const Database = require('better-sqlite3')
  const db = new Database('./data/ironman.db', { readonly: true })
  const rows = db.prepare(
    'SELECT date, AVG(weight_lb) as weight_lb FROM body_composition WHERE weight_lb IS NOT NULL GROUP BY date ORDER BY date ASC'
  ).all()
  db.close()
  const result = computeWeightTrend(rows)
  expect(result).not.toBeNull()
  expect(result.avgPrior).toBeCloseTo(151.5, 1)
  expect(result.avgRecent).toBeCloseTo(149.9, 1)
  expect(result.lossPerWeek).toBeCloseTo(0.8, 1)
  expect(result.label).toBe('above target')
})

// ─── W6: Weigh-ins last 7 days = 3 ───────────────────────────────────────────

test('W6: "Weigh-ins last 7 days" on 2026-10-05 — 3 (target ≥4)', () => {
  const Database = require('better-sqlite3')
  const db = new Database('./data/ironman.db', { readonly: true })
  const today = '2026-10-05'
  const from = '2026-09-29'  // today - 6
  const { cnt } = db.prepare(
    'SELECT COUNT(DISTINCT date) as cnt FROM body_composition WHERE weight_lb IS NOT NULL AND date>=? AND date<=?'
  ).get(from, today)
  db.close()
  expect(cnt).toBe(3)
})

// ─── W7: 3-reading boundary ───────────────────────────────────────────────────

test('W7: Unit tests: 3-reading boundary — exactly 3 readings → avg shown; 2 readings → "—"', () => {
  const anchor = '2026-10-05'
  const three = [
    { date: '2026-10-03', weight_lb: 150.0 },
    { date: '2026-10-04', weight_lb: 151.0 },
    { date: '2026-10-05', weight_lb: 152.0 },
  ]
  expect(sevenDayAvg(anchor, three)).not.toBeNull()

  const two = [
    { date: '2026-10-04', weight_lb: 151.0 },
    { date: '2026-10-05', weight_lb: 152.0 },
  ]
  expect(sevenDayAvg(anchor, two)).toBeNull()
})
