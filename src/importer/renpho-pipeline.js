'use strict'

const fs = require('fs')
const { randomUUID } = require('crypto')

/**
 * Parse Renpho date "M/D/YY" → "YYYY-MM-DD"
 */
function parseRenphoDate(raw) {
  const trimmed = (raw || '').trim()
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (!m) return null
  const year = parseInt(m[3]) + 2000
  const month = m[1].padStart(2, '0')
  const day   = m[2].padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse a numeric field — returns null for '--', empty, or NaN.
 */
function parseNum(raw, isInt) {
  const s = (raw || '').trim()
  if (!s || s === '--' || s === '-') return null
  const v = isInt ? parseInt(s.replace(/,/g, '')) : parseFloat(s.replace(/,/g, ''))
  return isNaN(v) ? null : v
}

/**
 * Parse CSV content — Renpho columns have leading spaces in header.
 */
function parseCSV(content) {
  const lines = content.split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }

  function parseLine(line) {
    const fields = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { fields.push(cur); cur = '' }
      else cur += ch
    }
    fields.push(cur)
    return fields
  }

  // Trim each header so " Weight(lb)" → "Weight(lb)"
  const headers = parseLine(lines[0]).map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const vals = parseLine(line)
    const row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] !== undefined ? vals[idx] : '' })
    rows.push(row)
  }
  return { headers, rows }
}

/**
 * Normalize one raw Renpho row.
 * Returns null if date or weight is missing/invalid.
 */
function normalizeRenphoRow(raw) {
  const dateStr = parseRenphoDate(raw['Date'])
  if (!dateStr) return null

  const weight = parseNum(raw['Weight(lb)'], false)
  if (!weight) return null

  // Parse time — keep as HH:MM:SS string
  const timeRaw = (raw['Time'] || '').trim()

  return {
    date:                 dateStr,
    time:                 timeRaw || null,
    weight_lb:            weight,
    bmi:                  parseNum(raw['BMI'], false),
    body_fat_pct:         parseNum(raw['Body Fat(%)'], false),
    skeletal_muscle_pct:  parseNum(raw['Skeletal Muscle(%)'], false),
    fat_free_mass_lb:     parseNum(raw['Fat-Free Mass(lb)'], false),
    subcutaneous_fat_pct: parseNum(raw['Subcutaneous Fat(%)'], false),
    visceral_fat:         parseNum(raw['Visceral Fat'], false),
    body_water_pct:       parseNum(raw['Body Water(%)'], false),
    muscle_mass_lb:       parseNum(raw['Muscle Mass(lb)'], false),
    bone_mass_lb:         parseNum(raw['Bone Mass(lb)'], false),
    protein_pct:          parseNum(raw['Protein (%)'], false),
    bmr_kcal:             parseNum(raw['BMR(kcal)'], true),
    metabolic_age:        parseNum(raw['Metabolic Age'], true),
  }
}

/**
 * Check if a normalized row is a duplicate of an existing DB record.
 * Key: date + time (exact match). If time missing, match on date + weight within 0.2lb.
 */
function isRenphoDuplicate(row, existingForDate) {
  for (const e of existingForDate) {
    if (row.time && e.time && row.time === e.time) return true
    if (!row.time && !e.time && Math.abs((e.weight_lb || 0) - row.weight_lb) < 0.2) return true
  }
  return false
}

/**
 * Run the Renpho import pipeline.
 * Inserts into body_composition table; also backfills daily_wellness.body_weight_lb
 * with the first (morning) reading for each date.
 */
function runRenphoPipeline({ filePath, db, dryRun = false }) {
  const content = fs.readFileSync(filePath, 'utf8')
  const { rows } = parseCSV(content)

  const batchId = randomUUID()
  const valid = []
  let invalid = 0
  const errors = []

  for (let i = 0; i < rows.length; i++) {
    const norm = normalizeRenphoRow(rows[i])
    if (!norm) {
      invalid++
      errors.push({ row: i + 2, reason: 'Missing date or weight' })
    } else {
      valid.push(norm)
    }
  }

  // Group by date, load existing
  const uniqueDates = [...new Set(valid.map(r => r.date))]
  const existingByDate = {}
  if (uniqueDates.length > 0) {
    const ph = uniqueDates.map(() => '?').join(',')
    const existing = db.prepare(
      `SELECT date, time, weight_lb FROM body_composition WHERE date IN (${ph})`
    ).all(...uniqueDates)
    for (const e of existing) {
      if (!existingByDate[e.date]) existingByDate[e.date] = []
      existingByDate[e.date].push(e)
    }
  }

  const toInsert = []
  let duplicates = 0
  for (const row of valid) {
    const existing = existingByDate[row.date] || []
    if (isRenphoDuplicate(row, existing)) {
      duplicates++
    } else {
      toInsert.push(row)
      if (!existingByDate[row.date]) existingByDate[row.date] = []
      existingByDate[row.date].push(row)
    }
  }

  let imported = 0
  if (!dryRun && toInsert.length > 0) {
    const insertBC = db.prepare(`
      INSERT INTO body_composition
        (date, time, weight_lb, bmi, body_fat_pct, skeletal_muscle_pct,
         fat_free_mass_lb, subcutaneous_fat_pct, visceral_fat, body_water_pct,
         muscle_mass_lb, bone_mass_lb, protein_pct, bmr_kcal, metabolic_age,
         source, import_batch_id)
      VALUES
        (@date, @time, @weight_lb, @bmi, @body_fat_pct, @skeletal_muscle_pct,
         @fat_free_mass_lb, @subcutaneous_fat_pct, @visceral_fat, @body_water_pct,
         @muscle_mass_lb, @bone_mass_lb, @protein_pct, @bmr_kcal, @metabolic_age,
         'renpho', @import_batch_id)
    `)

    // For wellness backfill: first reading of the day (CSV is newest-first, so last = earliest)
    // Group new readings by date, pick the earliest time
    const morningByDate = {}
    for (const row of toInsert) {
      if (!morningByDate[row.date]) {
        morningByDate[row.date] = row
      } else {
        // Compare time strings — earlier time wins
        if (row.time && morningByDate[row.date].time && row.time < morningByDate[row.date].time) {
          morningByDate[row.date] = row
        }
      }
    }

    db.transaction(() => {
      for (const row of toInsert) {
        insertBC.run({ ...row, import_batch_id: batchId })
        imported++
      }

      // Backfill daily_wellness.body_weight_lb where not already set
      for (const [date, row] of Object.entries(morningByDate)) {
        const existing = db.prepare(
          'SELECT body_weight_lb FROM daily_wellness WHERE date = ?'
        ).get(date)
        if (existing) {
          if (!existing.body_weight_lb) {
            db.prepare(
              'UPDATE daily_wellness SET body_weight_lb = ? WHERE date = ?'
            ).run(row.weight_lb, date)
          }
        } else {
          db.prepare(
            `INSERT OR IGNORE INTO daily_wellness (date, body_weight_lb) VALUES (?, ?)`
          ).run(date, row.weight_lb)
        }
      }
    })()
  }

  return {
    total: rows.length,
    valid: valid.length,
    invalid,
    duplicates,
    imported: dryRun ? 0 : imported,
    skipped_duplicates: duplicates,
    skipped_invalid: invalid,
    batch_id: dryRun ? null : batchId,
    errors: errors.slice(0, 10),
    sample: valid.slice(0, 3),
  }
}

module.exports = { runRenphoPipeline, normalizeRenphoRow }
