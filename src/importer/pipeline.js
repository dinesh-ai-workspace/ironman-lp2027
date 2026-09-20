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
    const rawDate       = mapping.date       ? rawRow[mapping.date]       : null
    const rawDiscipline = mapping.discipline  ? rawRow[mapping.discipline] : null
    const rawDuration   = mapping.duration    ? rawRow[mapping.duration]   : null
    const rawDistance   = mapping.distance    ? rawRow[mapping.distance]   : null
    const rawAvgHr      = mapping.avg_hr      ? rawRow[mapping.avg_hr]     : null
    const rawPower      = mapping.avg_power   ? rawRow[mapping.avg_power]  : null
    const rawNP         = mapping.normalized_power ? rawRow[mapping.normalized_power] : null
    const rawMaxPower   = mapping.max_power   ? rawRow[mapping.max_power]  : null
    const rawNotes      = mapping.notes       ? rawRow[mapping.notes]      : null
    const rawElevation  = mapping.elevation_gain ? rawRow[mapping.elevation_gain] : null
    const rawPoolLength = mapping.pool_length_m  ? rawRow[mapping.pool_length_m]  : null

    if (!rawDate || !rawDiscipline || !rawDuration) return null

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

    // Parse duration — handles HH:MM:SS, seconds, or minutes
    let durationMin = null
    if (rawDuration && rawDuration.trim() !== '--') {
      const trimmed = rawDuration.trim()
      const hmsMatch = trimmed.match(/^(\d+):(\d{2}):(\d{2})(\.\d+)?$/)
      if (hmsMatch) {
        durationMin = Math.round(parseInt(hmsMatch[1]) * 60 + parseInt(hmsMatch[2]) + parseInt(hmsMatch[3]) / 60)
      } else {
        const durVal = parseFloat(trimmed.replace(/,/g, ''))
        if (!isNaN(durVal)) {
          durationMin = preset?.durationUnit === 'seconds'
            ? Math.round(durVal / 60)
            : Math.round(durVal)
        }
      }
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
        // Run: keep as miles (user preference); Bike: convert to km
        distanceStored = discipline === 'run'
          ? Math.round(rawDistVal * 100) / 100
          : Math.round(rawDistVal * 1.60934 * 100) / 100
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

    return {
      date: dateStr,
      discipline,
      duration: durationMin,
      distance: distanceStored,
      avg_hr: parseNum(rawAvgHr, true),
      avg_cadence: parseNum(rawCadence, true),
      avg_power: parseNum(rawPower, true),
      normalized_power: parseNum(rawNP, true),
      max_power: parseNum(rawMaxPower, true),
      notes: rawNotes || '',
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
        (discipline, date, duration, distance, avg_hr, rpe, notes,
         avg_power, normalized_power, avg_cadence, max_power,
         environment, pool_length_m, is_brick,
         source, import_batch_id)
      VALUES
        (@discipline, @date, @duration, @distance, @avg_hr, @rpe, @notes,
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
