'use strict'

const fs = require('fs')
const { randomUUID } = require('crypto')

/**
 * Parse CSV content manually — handles quoted fields, embedded commas.
 */
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
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current)
    return fields
  }

  const headers = parseLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseLine(line)
    const row = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

/**
 * Normalize a raw CSV row using a preset + mapping config.
 * Returns a normalized intermediate object or null if invalid.
 *
 * @param {Object} rawRow         Raw row from CSV parse
 * @param {Object} mapping        Field → column name mapping (from preset + overrides)
 * @param {Object} preset         The full preset config
 * @returns {Object|null}
 */
function normalizeRow(rawRow, mapping, preset) {
  try {
    // Extract raw values using the mapping
    const rawDate = mapping.date ? rawRow[mapping.date] : null
    const rawDiscipline = mapping.discipline ? rawRow[mapping.discipline] : null
    const rawDuration = mapping.duration ? rawRow[mapping.duration] : null
    const rawDistance = mapping.distance ? rawRow[mapping.distance] : null
    const rawAvgHr = mapping.avg_hr ? rawRow[mapping.avg_hr] : null
    const rawMaxHr = mapping.max_hr ? rawRow[mapping.max_hr] : null
    const rawCadence = mapping.avg_cadence ? rawRow[mapping.avg_cadence] : null
    const rawPower = mapping.avg_power ? rawRow[mapping.avg_power] : null
    const rawNP = mapping.normalized_power ? rawRow[mapping.normalized_power] : null
    const rawNotes = mapping.notes ? rawRow[mapping.notes] : null
    const rawElevation = mapping.elevation_gain ? rawRow[mapping.elevation_gain] : null

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
    if (preset && preset.disciplineMap && preset.disciplineMap[rawDiscipline.trim()]) {
      discipline = preset.disciplineMap[rawDiscipline.trim()]
    } else {
      const lower = rawDiscipline.trim().toLowerCase()
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
      const hmsMatch = trimmed.match(/^(\d+):(\d{2}):(\d{2})$/)
      if (hmsMatch) {
        durationMin = Math.round(parseInt(hmsMatch[1]) * 60 + parseInt(hmsMatch[2]) + parseInt(hmsMatch[3]) / 60)
      } else {
        const durVal = parseFloat(trimmed.replace(/,/g, ''))
        if (!isNaN(durVal)) {
          if (preset && preset.durationUnit === 'seconds') {
            durationMin = Math.round(durVal / 60)
          } else {
            durationMin = Math.round(durVal)
          }
        }
      }
    }
    if (!durationMin) return null

    // Helper: parse a numeric field, treating "--" and empty as null
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
        // Garmin swim distance is in meters or yards — store as km
        distanceStored = Math.round((rawDistVal / 1000) * 1000) / 1000
      } else if (preset && preset.distanceUnit === 'mi') {
        // Run/bike: miles → keep as miles for run, convert to km for bike
        distanceStored = discipline === 'run'
          ? Math.round(rawDistVal * 100) / 100
          : Math.round(rawDistVal * 1.60934 * 100) / 100
      } else if (preset && preset.distanceUnit === 'km') {
        distanceStored = discipline === 'run'
          ? Math.round((rawDistVal / 1.60934) * 100) / 100
          : rawDistVal
      } else {
        distanceStored = rawDistVal
      }
    }

    return {
      date: dateStr,
      discipline,
      duration: durationMin,
      distance: distanceStored,
      avg_hr: parseNum(rawAvgHr, true),
      max_hr: parseNum(rawMaxHr, true),
      avg_cadence: parseNum(rawCadence, true),
      avg_power: parseNum(rawPower, true),
      normalized_power: parseNum(rawNP, true),
      notes: rawNotes || '',
      elevation_gain: parseNum(rawElevation, false),
      source: preset ? `csv_${preset.name}` : 'csv_other',
    }
  } catch (err) {
    return null
  }
}

/**
 * Detect if a normalized row is a duplicate of an existing logged session.
 * Dedupe key: date + discipline + duration within 10% tolerance.
 *
 * @param {Object} normalizedRow
 * @param {Array}  existingSessionsForDate  Logged sessions on the same date
 * @returns {boolean}
 */
function isDuplicate(normalizedRow, existingSessionsForDate) {
  for (const existing of existingSessionsForDate) {
    if (existing.discipline !== normalizedRow.discipline) continue
    if (!existing.duration || !normalizedRow.duration) continue
    const tolerance = existing.duration * 0.1
    if (Math.abs(existing.duration - normalizedRow.duration) <= tolerance) {
      return true
    }
  }
  return false
}

/**
 * Run the full import pipeline.
 *
 * @param {Object} opts
 * @param {string} opts.filePath
 * @param {Object} opts.preset
 * @param {Object} opts.mappingOverrides
 * @param {import('better-sqlite3').Database} opts.db
 * @param {boolean} opts.dryRun
 * @returns {{ total, valid, invalid, duplicates, imported, errors, sample }}
 */
function runImportPipeline({ filePath, preset, mappingOverrides = {}, db, dryRun = false }) {
  const content = fs.readFileSync(filePath, 'utf8')
  const { rows } = parseCSV(content)

  // Build effective mapping: preset base + overrides
  const baseMapping = (preset && preset.columnMap) ? { ...preset.columnMap } : {}
  const mapping = { ...baseMapping, ...mappingOverrides }

  const batchId = randomUUID()
  const validRows = []
  const errors = []
  let invalid = 0
  let duplicates = 0

  // Normalize all rows
  for (let i = 0; i < rows.length; i++) {
    const normalized = normalizeRow(rows[i], mapping, preset)
    if (!normalized) {
      invalid++
      errors.push({ row: i + 2, reason: 'Missing required fields (date, discipline, duration)' })
    } else {
      validRows.push(normalized)
    }
  }

  // Dedupe: group valid rows by date, check against DB
  const dateGroups = {}
  for (const r of validRows) {
    if (!dateGroups[r.date]) dateGroups[r.date] = []
    dateGroups[r.date].push(r)
  }

  // Load existing sessions for all relevant dates
  const uniqueDates = Object.keys(dateGroups)
  const existingByDate = {}
  if (uniqueDates.length > 0) {
    const placeholders = uniqueDates.map(() => '?').join(',')
    const existing = db.prepare(
      `SELECT date, discipline, duration FROM logged_sessions WHERE date IN (${placeholders})`
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
      // Add to in-memory existing so we don't double-import within the same batch
      if (!existingByDate[row.date]) existingByDate[row.date] = []
      existingByDate[row.date].push(row)
    }
  }

  let imported = 0
  if (!dryRun && toInsert.length > 0) {
    const insertStmt = db.prepare(`
      INSERT INTO logged_sessions
        (discipline, date, duration, distance, avg_hr, rpe, notes,
         avg_power, normalized_power, avg_cadence, source, import_batch_id)
      VALUES
        (@discipline, @date, @duration, @distance, @avg_hr, @rpe, @notes,
         @avg_power, @normalized_power, @avg_cadence, @source, @import_batch_id)
    `)

    db.transaction(() => {
      for (const row of toInsert) {
        insertStmt.run({
          discipline: row.discipline,
          date: row.date,
          duration: row.duration,
          distance: row.distance || null,
          avg_hr: row.avg_hr || null,
          rpe: null,
          notes: row.notes || '',
          avg_power: row.avg_power || null,
          normalized_power: row.normalized_power || null,
          avg_cadence: row.avg_cadence || null,
          source: row.source || 'csv_other',
          import_batch_id: batchId,
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
