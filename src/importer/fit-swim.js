'use strict'

const fs = require('fs')
const FitParser = require('fit-file-parser').default

/**
 * Parse a Garmin FIT file and extract pool swim length records.
 * Returns { poolLengthM, lengths, sessionStartDate } where lengths is an array of:
 *   { length_index, length_type, stroke, distance_m, duration_s }
 * Returns null if the FIT file is not a pool swim activity.
 */
function parseFitSwim(fitPath) {
  const buf = fs.readFileSync(fitPath)
  const parser = new FitParser({ force: false, speedUnit: 'km/h', lengthUnit: 'm', mode: 'list' })

  let result = null
  parser.parse(buf.buffer, function(err, data) {
    if (err) return

    const sessions = data.sessions || []
    const poolSession = sessions.find(s =>
      s.sport === 'swimming' && (s.sub_sport === 'lap_swimming' || s.sub_sport === undefined)
    )
    if (!poolSession && sessions.length > 0 && !sessions.some(s => s.sport === 'swimming')) return

    // Pool length in metres (FitParser returns decoded value, typically 25)
    let poolLengthM = poolSession?.pool_length ?? 25
    if (poolLengthM > 100) poolLengthM = poolLengthM / 100  // guard: cm → m
    if (!poolLengthM) poolLengthM = 25

    const lengthMsgs = data.lengths || []
    if (lengthMsgs.length === 0) return

    const lengths = lengthMsgs.map((l, idx) => ({
      length_index: (l.message_index?.value ?? idx) + 1,
      length_type:  l.length_type === 'active' ? 'active' : 'idle',
      stroke:       l.swim_stroke ?? null,
      distance_m:   l.length_type === 'active' ? poolLengthM : 0,
      duration_s:   l.total_elapsed_time ?? null,
    }))

    result = { poolLengthM, lengths, sessionStartDate: poolSession?.start_time ?? null }
  })

  return result
}

/**
 * Import swim length data from a FIT file into the swim_lengths table.
 * Matches the FIT activity to a logged_session by date and discipline='swim'.
 * Returns { imported, sessionId, poolLengthM, lengthCount } or { error }.
 */
function importFitSwim(fitPath, db) {
  const result = parseFitSwim(fitPath)
  if (!result) return { error: 'not a pool swim FIT file' }

  const { poolLengthM, lengths, sessionStartDate } = result
  if (lengths.length === 0) return { error: 'no length records in FIT file' }

  // Derive date from FIT filename (Garmin names: YYYY-MM-DD-*.fit); fall back to session start_time
  const fnBase = require('path').basename(fitPath, '.fit').replace(/\.FIT$/i, '')
  const dateParts = fnBase.match(/(\d{4})-(\d{2})-(\d{2})/)
  let activityDate
  if (dateParts) {
    activityDate = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`
  } else if (sessionStartDate) {
    activityDate = new Date(sessionStartDate).toISOString().slice(0, 10)
  } else {
    return { error: 'cannot derive date from filename or FIT session: ' + fitPath }
  }

  // Find matching swim session (±0 day; if multiple, pick first)
  const session = db.prepare(
    "SELECT id FROM logged_sessions WHERE discipline='swim' AND date=? ORDER BY id LIMIT 1"
  ).get(activityDate)
  if (!session) return { error: `no swim session in DB for ${activityDate}` }

  // Delete any existing lengths for this session and re-insert
  db.prepare('DELETE FROM swim_lengths WHERE logged_session_id=?').run(session.id)

  // Update pool_length_m on the logged session
  db.prepare('UPDATE logged_sessions SET pool_length_m=? WHERE id=?').run(poolLengthM, session.id)

  const insert = db.prepare(
    `INSERT INTO swim_lengths (logged_session_id, length_index, length_type, stroke, distance_m, duration_s)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  db.transaction(() => {
    for (const l of lengths) {
      insert.run(session.id, l.length_index, l.length_type, l.stroke, l.distance_m, l.duration_s)
    }
  })()

  return {
    imported: true,
    sessionId: session.id,
    date: activityDate,
    poolLengthM,
    lengthCount: lengths.length,
    activeCount: lengths.filter(l => l.length_type === 'active').length,
  }
}

/**
 * Backfill all FIT files from a directory, matching to swim sessions.
 * Returns { results: [{fitFile, ...importResult}], noFitDates: [date] }
 */
function backfillFitSwims(fitDir, db) {
  const allSwims = db.prepare(
    "SELECT id, date FROM logged_sessions WHERE discipline='swim' ORDER BY date"
  ).all()

  let fitFiles = []
  if (fitDir && fs.existsSync(fitDir)) {
    fitFiles = fs.readdirSync(fitDir)
      .filter(f => f.toLowerCase().endsWith('.fit'))
      .map(f => require('path').join(fitDir, f))
  }

  const results = fitFiles.map(f => ({ fitFile: f, ...importFitSwim(f, db) }))

  // Determine which swim sessions have no length data after import
  const sessionsWithData = new Set(
    db.prepare("SELECT DISTINCT logged_session_id FROM swim_lengths").all().map(r => r.logged_session_id)
  )
  const noFitDates = allSwims
    .filter(s => !sessionsWithData.has(s.id))
    .map(s => s.date)

  return { results, noFitDates }
}

module.exports = { parseFitSwim, importFitSwim, backfillFitSwims }
