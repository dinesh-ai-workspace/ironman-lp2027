'use strict'

const fs = require('fs')
const { randomUUID } = require('crypto')

// Strip non-ASCII characters (e.g. ®, ™) from a header string for fuzzy matching
function normaliseHeader(s) {
  return s.replace(/[^\x20-\x7E]/g, '').trim()
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }

  function parseLine(line) {
    const fields = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current); current = ''
      } else {
        current += ch
      }
    }
    fields.push(current)
    return fields
  }

  const rawHeaders = parseLine(lines[0])
  // Build normalised → raw header map so ® and similar don't break lookups
  const headerMap = {}
  rawHeaders.forEach(h => { headerMap[normaliseHeader(h)] = h })

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseLine(line)
    const row = {}
    rawHeaders.forEach((h, idx) => {
      // Store under both raw and normalised key so callers can use either
      row[h] = values[idx] !== undefined ? values[idx] : ''
      const norm = normaliseHeader(h)
      if (norm !== h) row[norm] = row[h]
    })
    rows.push(row)
  }
  return { headers: rawHeaders, rows }
}

function normalizeRow(rawRow, mapping, preset) {
  try {
    // CN-10 #1: read all three Garmin time fields; mapping.duration = Moving Time for Garmin
    const rawDate       = mapping.date       ? rawRow[mapping.date]       : null
    const rawDiscipline = mapping.discipline  ? rawRow[mapping.discipline] : null
    const rawMoving     = mapping.duration    ? rawRow[mapping.duration]   : null
    const rawTimer      = mapping.timer       ? rawRow[mapping.timer]      : null
    const rawElapsed    = mapping.elapsed     ? rawRow[mapping.elapsed]    : null
    const rawDistance   = mapping.distance    ? rawRow[mapping.distance]   : null
    const rawAvgHr      = mapping.avg_hr      ? rawRow[mapping.avg_hr]     : null
    const rawPower      = mapping.avg_power   ? rawRow[mapping.avg_power]  : null
    const rawNP         = mapping.normalized_power ? rawRow[mapping.normalized_power] : null
    const rawMaxPower   = mapping.max_power   ? rawRow[mapping.max_power]  : null
    const rawNotes      = mapping.notes       ? rawRow[mapping.notes]      : null
    const rawElevation  = mapping.elevation_gain ? rawRow[mapping.elevation_gain] : null
    const rawPoolLength = mapping.pool_length_m  ? rawRow[mapping.pool_length_m]  : null

    if (!rawDate || !rawDiscipline) return null

    // Parse date — Garmin format: "2026-09-06 07:30:00"
    let dateStr = null
    if (rawDate) {
      const d = rawDate.trim().split(' ')[0]
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dateStr = d
    }
    if (!dateStr) return null

    // Normalize discipline
    let discipline = null
    const rawDiscTrimmed = rawDiscipline.trim()
    if (preset?.disciplineMap?.[rawDiscTrimmed]) {
      discipline = preset.disciplineMap[rawDiscTrimmed]
    } else {
      const lower = rawDiscTrimmed.toLowerCase()
      if (lower.includes('swim')) discipline = 'swim'
      else if (lower.includes('run')) discipline = 'run'
      else if (lower.includes('cycl') || lower.includes('bike') || lower.includes('riding')) discipline = 'bike'
      else if (lower.includes('strength')) discipline = 'strength'
      else discipline = 'other'
    }

    // Parse a raw time string into minutes (null if missing/blank/--, 0 if exactly 00:00:00)
    function parseTimeMin(raw) {
      if (!raw || raw.trim() === '--' || raw.trim() === '') return null
      const t = raw.trim()
      const hms = t.match(/^(\d+):(\d{2}):(\d{2})(\.\d+)?$/)
      if (hms) return Math.round(parseInt(hms[1]) * 60 + parseInt(hms[2]) + parseInt(hms[3]) / 60)
      const v = parseFloat(t.replace(/,/g, ''))
      if (isNaN(v)) return null
      return Math.round(preset?.durationUnit === 'seconds' ? v / 60 : v)
    }

    const movingMin  = parseTimeMin(rawMoving)
    const timerMin   = parseTimeMin(rawTimer)
    const elapsedMin = parseTimeMin(rawElapsed)

    // CN-10 #1 rule 2: select duration_min by discipline; rule 3: fallback with flag
    let durationMin = null
    let durFallback = false
    const RACE_TYPES = new Set(['race', 'race_simulation', 'brick_run', 'multisport'])

    if (!mapping.timer) {
      // Legacy preset with single duration field — no three-field rules
      durationMin = movingMin
    } else if (RACE_TYPES.has(discipline)) {
      if (elapsedMin) { durationMin = elapsedMin }
      else { durationMin = timerMin || movingMin; durFallback = true }
    } else if (discipline === 'bike' || discipline === 'run') {
      if (movingMin) { durationMin = movingMin }
      else { durationMin = timerMin || elapsedMin; durFallback = true }
    } else {
      // swim, strength, other → timer
      if (timerMin) { durationMin = timerMin }
      else { durationMin = elapsedMin || movingMin; durFallback = true }
    }

    if (!durationMin) return null

    function parseNum(raw, isInt) {
      if (!raw || raw.trim() === '--' || raw.trim() === '') return null
      const val = isInt
        ? parseInt(raw.replace(/,/g, '').trim())
        : parseFloat(raw.replace(/,/g, '').trim())
      return isNaN(val) ? null : val
    }

    // Parse distance
    let distanceStored = null
    const rawDistVal = parseNum(rawDistance, false)
    if (rawDistVal !== null && rawDistVal > 0) {
      if (discipline === 'swim') {
        // Garmin swim exports in meters (metric) or yards (imperial) — store as km
        distanceStored = Math.round((rawDistVal / 1000) * 1000) / 1000
      } else if (preset?.distanceUnit === 'mi') {
        distanceStored = Math.round(rawDistVal * 100) / 100
      } else if (preset?.distanceUnit === 'km') {
        // Run: convert km → miles; Bike: keep as km
        distanceStored = discipline === 'run'
          ? Math.round((rawDistVal / 1.60934) * 100) / 100
          : rawDistVal
      } else {
        distanceStored = rawDistVal
      }
    }

    // Cadence — discipline-aware column lookup
    let rawCadence = null
    if (discipline === 'run' && mapping.avg_cadence_run) {
      rawCadence = rawRow[mapping.avg_cadence_run]
    } else if (discipline === 'bike' && mapping.avg_cadence_bike) {
      rawCadence = rawRow[mapping.avg_cadence_bike]
    } else if (mapping.avg_cadence_swim) {
      rawCadence = rawRow[mapping.avg_cadence_swim]
    } else if (mapping.avg_cadence) {
      rawCadence = rawRow[mapping.avg_cadence]
    }

    // Swim-specific fields
    const isOpenWater = rawDiscTrimmed === 'Open Water Swimming'
    const environment  = discipline === 'swim' ? (isOpenWater ? 'open_water' : 'pool') : null
    const poolLengthM  = discipline === 'swim' && !isOpenWater ? parseNum(rawPoolLength, true) : null

    const notes = (rawNotes || '') + (durFallback ? ' [dur-fallback]' : '')

    return {
      date: dateStr,
      discipline,
      duration: durationMin,
      moving_min: movingMin,
      timer_min: timerMin,
      elapsed_min: elapsedMin,
      distance: distanceStored,
      avg_hr: parseNum(rawAvgHr, true),
      avg_cadence: parseNum(rawCadence, true),
      avg_power: parseNum(rawPower, true),
      normalized_power: parseNum(rawNP, true),
      max_power: parseNum(rawMaxPower, true),
      notes,
      elevation_gain: parseNum(rawElevation, false),
      environment,
      pool_length_m: poolLengthM,
      source: preset ? `csv_${preset.name}` : 'csv_other',
    }
  } catch {
    return null
  }
}

function isDuplicate(normalizedRow, existingSessionsForDate) {
  for (const existing of existingSessionsForDate) {
    if (existing.discipline !== normalizedRow.discipline) continue
    if (!existing.duration || !normalizedRow.duration) continue
    // Tighter tolerance: 2-minute absolute + distance within 0.5 units
    const durationMatch = Math.abs(existing.duration - normalizedRow.duration) <= 2
    const distMatch = existing.distance == null || normalizedRow.distance == null
      || Math.abs(existing.distance - normalizedRow.distance) < 0.5
    if (durationMatch && distMatch) return true
  }
  return false
}

function runImportPipeline({ filePath, preset, mappingOverrides = {}, db, dryRun = false }) {
  // CN-10 #2: validate distance unit before processing anything
  if (preset?.distanceUnit !== undefined && !['km', 'm', 'mi'].includes(preset.distanceUnit)) {
    const err = `Unknown distance unit '${preset.distanceUnit}' — must be km, m, or mi. Import aborted.`
    return { total: 0, valid: 0, invalid: 0, duplicates: 0, imported: 0, skipped_duplicates: 0, skipped_invalid: 0, batch_id: null, errors: [{ row: 0, reason: err }], sample: [] }
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const { rows } = parseCSV(content)

  const baseMapping = preset?.columnMap ? { ...preset.columnMap } : {}
  const mapping = { ...baseMapping, ...mappingOverrides }

  const batchId = randomUUID()
  const validRows = []
  const errors = []
  let invalid = 0
  let duplicates = 0

  for (let i = 0; i < rows.length; i++) {
    const normalized = normalizeRow(rows[i], mapping, preset)
    if (!normalized) {
      invalid++
      errors.push({ row: i + 2, reason: 'Missing required fields (date, discipline, duration)' })
    } else {
      validRows.push(normalized)
    }
  }

  // Dedupe against existing DB sessions
  const dateGroups = {}
  for (const r of validRows) {
    if (!dateGroups[r.date]) dateGroups[r.date] = []
    dateGroups[r.date].push(r)
  }

  const uniqueDates = Object.keys(dateGroups)
  const existingByDate = {}
  if (uniqueDates.length > 0) {
    const placeholders = uniqueDates.map(() => '?').join(',')
    const existing = db.prepare(
      `SELECT date, discipline, duration, distance FROM logged_sessions WHERE date IN (${placeholders})`
    ).all(...uniqueDates)
    for (const e of existing) {
      if (!existingByDate[e.date]) existingByDate[e.date] = []
      existingByDate[e.date].push(e)
    }
  }

  const toInsert = []
  for (const row of validRows) {
    const existingOnDate = existingByDate[row.date] || []
    if (isDuplicate(row, existingOnDate)) {
      duplicates++
    } else {
      toInsert.push(row)
      if (!existingByDate[row.date]) existingByDate[row.date] = []
      existingByDate[row.date].push(row)
    }
  }

  // Detect bricks: same-date bike + run pairs
  const byDate = {}
  for (const row of toInsert) {
    if (!byDate[row.date]) byDate[row.date] = []
    byDate[row.date].push(row)
  }
  for (const rows of Object.values(byDate)) {
    const hasBike = rows.some(r => r.discipline === 'bike')
    const hasRun  = rows.some(r => r.discipline === 'run')
    if (hasBike && hasRun) {
      rows.filter(r => r.discipline === 'bike' || r.discipline === 'run')
          .forEach(r => { r.is_brick = 1 })
    }
  }

  let imported = 0
  if (!dryRun && toInsert.length > 0) {
    const insertStmt = db.prepare(`
      INSERT INTO logged_sessions
        (discipline, date, duration, moving_min, timer_min, elapsed_min,
         distance, avg_hr, rpe, notes,
         avg_power, normalized_power, avg_cadence, max_power,
         environment, pool_length_m, is_brick,
         source, import_batch_id)
      VALUES
        (@discipline, @date, @duration, @moving_min, @timer_min, @elapsed_min,
         @distance, @avg_hr, @rpe, @notes,
         @avg_power, @normalized_power, @avg_cadence, @max_power,
         @environment, @pool_length_m, @is_brick,
         @source, @import_batch_id)
    `)

    db.transaction(() => {
      for (const row of toInsert) {
        insertStmt.run({
          discipline:        row.discipline,
          date:              row.date,
          duration:          row.duration,
          moving_min:        row.moving_min    ?? null,
          timer_min:         row.timer_min     ?? null,
          elapsed_min:       row.elapsed_min   ?? null,
          distance:          row.distance      || null,
          avg_hr:            row.avg_hr        || null,
          rpe:               null,
          notes:             row.notes         || '',
          avg_power:         row.avg_power     || null,
          normalized_power:  row.normalized_power || null,
          avg_cadence:       row.avg_cadence   || null,
          max_power:         row.max_power     || null,
          environment:       row.environment   || null,
          pool_length_m:     row.pool_length_m || null,
          is_brick:          row.is_brick      || 0,
          source:            row.source        || 'csv_other',
          import_batch_id:   batchId,
        })
        imported++
      }
    })()
  }

  return {
    total: rows.length,
    valid: validRows.length,
    invalid,
    duplicates,
    imported: dryRun ? 0 : imported,
    skipped_duplicates: duplicates,
    skipped_invalid: invalid,
    batch_id: dryRun ? null : batchId,
    errors: errors.slice(0, 10),
    sample: validRows.slice(0, 5),
  }
}

module.exports = { normalizeRow, isDuplicate, runImportPipeline }
