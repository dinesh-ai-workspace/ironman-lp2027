'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { DOMParser } = require('@xmldom/xmldom')
const FitParser = require('fit-file-parser').default
const { deriveBikeZones } = require('../core/scoring/zones')

const halfUp = n => Math.floor(n + 0.5)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function getImportFile(db, sha256) {
  return db.prepare('SELECT id FROM import_files WHERE sha256=?').get(sha256)
}

function insertImportFile(db, { sha256, filePath, source, sessionId }) {
  db.prepare(
    'INSERT OR IGNORE INTO import_files (sha256, path, source, logged_session_id, imported_at) VALUES (?, ?, ?, ?, ?)'
  ).run(sha256, filePath, source, sessionId ?? null, new Date().toISOString())
}

// CN-20 #3: remove dur-fallback and empty brackets from notes
function cleanNotes(notes) {
  return (notes || '')
    .replace(/[;,]?\s*dur-fallback\b/gi, '')
    .replace(/\s*\[\s*\]\s*/g, '')
    .trim()
    .replace(/^[;,]\s*/, '')
    .trim()
}

// ─── TCX parsing ──────────────────────────────────────────────────────────────

function parseKeiserTcx(tcxPath) {
  const xml = fs.readFileSync(tcxPath, 'utf8')
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const trackpoints = doc.getElementsByTagName('Trackpoint')
  const rawPoints = []

  for (let i = 0; i < trackpoints.length; i++) {
    const tp = trackpoints[i]
    const timeEl = tp.getElementsByTagName('Time')[0]
    if (!timeEl) continue
    const timeStr = timeEl.textContent.trim()

    // Timestamps without timezone offset are treated as America/New_York (EDT = UTC-4 in Oct)
    let t_utc
    if (/[Zz]|[+-]\d{2}:\d{2}/.test(timeStr)) {
      t_utc = new Date(timeStr)
    } else {
      t_utc = new Date(timeStr + '-04:00')
    }
    if (isNaN(t_utc.getTime())) continue

    // Power (Watts) — use getElementsByTagNameNS('*',...) to match any namespace prefix
    let power_w = null
    const wattsEls = tp.getElementsByTagNameNS('*', 'Watts')
    if (wattsEls.length > 0) {
      const w = parseFloat(wattsEls[0].textContent)
      if (!isNaN(w) && w > 2000) continue
      if (!isNaN(w)) power_w = w
    }

    // Cadence
    let cadence_rpm = null
    const cadEls = tp.getElementsByTagName('Cadence')
    if (cadEls.length > 0) {
      const c = parseFloat(cadEls[0].textContent)
      if (!isNaN(c)) cadence_rpm = c
    }

    // Heart rate
    let hr_bpm = null
    const hrEls = tp.getElementsByTagName('HeartRateBpm')
    if (hrEls.length > 0) {
      const valEls = hrEls[0].getElementsByTagName('Value')
      if (valEls.length > 0) {
        const h = parseInt(valEls[0].textContent, 10)
        if (!isNaN(h)) hr_bpm = h
      }
    }

    rawPoints.push({ t_utc, power_w, cadence_rpm, hr_bpm })
  }

  if (rawPoints.length === 0) return null
  rawPoints.sort((a, b) => a.t_utc - b.t_utc)

  return {
    points: resample1s(rawPoints),
    startUtc: rawPoints[0].t_utc,
    endUtc: rawPoints[rawPoints.length - 1].t_utc,
  }
}

function resample1s(rawPoints) {
  const startMs = rawPoints[0].t_utc.getTime()
  const endMs = rawPoints[rawPoints.length - 1].t_utc.getTime()
  const points = []
  let j = 0
  for (let s = 0; startMs + s * 1000 <= endMs; s++) {
    const ms = startMs + s * 1000
    while (j < rawPoints.length - 2 && rawPoints[j + 1].t_utc.getTime() <= ms) j++
    const prev = rawPoints[j]
    const next = rawPoints[j + 1] ?? prev
    const prevMs = prev.t_utc.getTime()
    const nextMs = next.t_utc.getTime()
    const frac = nextMs === prevMs ? 0 : (ms - prevMs) / (nextMs - prevMs)
    const lerp = (a, b) => (a == null && b == null) ? null : a == null ? b : b == null ? a : a + frac * (b - a)
    points.push({
      t_utc: new Date(ms),
      power_w: lerp(prev.power_w, next.power_w),
      cadence_rpm: lerp(prev.cadence_rpm, next.cadence_rpm),
      hr_bpm: lerp(prev.hr_bpm, next.hr_bpm),
    })
  }
  return points
}

// ─── Garmin FIT HR reader ─────────────────────────────────────────────────────

function readGarminBikeHr(fitPath) {
  const buf = fs.readFileSync(fitPath)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const parser = new FitParser({ force: false, speedUnit: 'km/h', lengthUnit: 'm', mode: 'list' })
  let result = null
  parser.parse(ab, (err, data) => {
    if (err) return
    const sessions = data.sessions || []
    const bikeSession = sessions.find(s => s.sport === 'cycling' || s.sport === 'bike')
    if (!bikeSession) return

    const records = (data.records || [])
      .filter(r => r.timestamp != null && r.heart_rate != null)
      .map(r => ({ t_utc: new Date(r.timestamp), hr_bpm: r.heart_rate }))

    const laps = (data.laps || []).map(l => ({
      startUtc: new Date(l.start_time),
      durationS: l.total_elapsed_time ?? 0,
      avgPower: l.avg_power ?? null,
    }))

    const sessionStartUtc = bikeSession.start_time ? new Date(bikeSession.start_time) :
      (records.length > 0 ? records[0].t_utc : null)
    const sessionDurationS = bikeSession.total_elapsed_time ?? 0
    const sessionEndUtc = sessionStartUtc
      ? new Date(sessionStartUtc.getTime() + sessionDurationS * 1000)
      : null

    result = { records, laps, sessionStartUtc, sessionEndUtc }
  })
  return result
}

// ─── Overlap check ────────────────────────────────────────────────────────────

function overlapsAtLeast50pct(aStart, aEnd, bStart, bEnd) {
  const overlapStart = Math.max(aStart.getTime(), bStart.getTime())
  const overlapEnd = Math.min(aEnd.getTime(), bEnd.getTime())
  if (overlapStart >= overlapEnd) return false
  const overlap = overlapEnd - overlapStart
  const shorter = Math.min(aEnd.getTime() - aStart.getTime(), bEnd.getTime() - bStart.getTime())
  return shorter > 0 && overlap / shorter >= 0.5
}

// ─── Best 20-min window (CN-20 #1: P from Keiser always; HR from Garmin if available) ──

function findBest20Window(keiserPoints, garminRecords, garminLaps) {
  if (keiserPoints.length === 0) return null
  const WINDOW_S = 1200

  // Prefer Garmin laps of 1170–1230 s; pick the one with highest Keiser avg power
  let windowStartMs = null, windowEndMs = null
  const qualLaps = (garminLaps || []).filter(l => l.durationS >= 1170 && l.durationS <= 1230)
  if (qualLaps.length > 0) {
    let bestAvg = -1
    for (const lap of qualLaps) {
      const lapStartMs = lap.startUtc.getTime()
      const lapEndMs = lapStartMs + lap.durationS * 1000
      const withPower = keiserPoints.filter(p => p.t_utc.getTime() >= lapStartMs && p.t_utc.getTime() < lapEndMs && p.power_w != null)
      if (withPower.length === 0) continue
      const avg = withPower.reduce((s, p) => s + p.power_w, 0) / withPower.length
      if (avg > bestAvg) { bestAvg = avg; windowStartMs = lapStartMs; windowEndMs = lapEndMs }
    }
  }

  // Fallback: best rolling 1200-s Keiser power window
  if (windowStartMs == null) {
    let bestAvg = -1
    for (let i = 0; i + WINDOW_S <= keiserPoints.length; i++) {
      const window = keiserPoints.slice(i, i + WINDOW_S)
      const withPower = window.filter(p => p.power_w != null)
      if (withPower.length < WINDOW_S * 0.5) continue
      const avg = withPower.reduce((s, p) => s + p.power_w, 0) / withPower.length
      if (avg > bestAvg) {
        bestAvg = avg
        windowStartMs = keiserPoints[i].t_utc.getTime()
        windowEndMs = windowStartMs + WINDOW_S * 1000
      }
    }
  }

  if (windowStartMs == null) return null

  // Avg Keiser power in window
  const keiserInWindow = keiserPoints.filter(p => p.t_utc.getTime() >= windowStartMs && p.t_utc.getTime() < windowEndMs)
  const withPower = keiserInWindow.filter(p => p.power_w != null)
  const power20 = withPower.length > 0
    ? Math.round(withPower.reduce((s, p) => s + p.power_w, 0) / withPower.length)
    : null

  // Avg HR in window: Garmin first, Keiser fallback
  let hr20 = null, hrComplete = false
  const garminInWindow = (garminRecords || []).filter(r => r.t_utc.getTime() >= windowStartMs && r.t_utc.getTime() < windowEndMs)
  const WINDOW_ACTUAL = (windowEndMs - windowStartMs) / 1000
  if (garminInWindow.length > 0) {
    hr20 = Math.round(garminInWindow.reduce((s, r) => s + r.hr_bpm, 0) / garminInWindow.length)
    hrComplete = garminInWindow.length >= WINDOW_ACTUAL * 0.9
  } else {
    const keiserWithHr = keiserInWindow.filter(p => p.hr_bpm != null)
    if (keiserWithHr.length > 0) {
      hr20 = Math.round(keiserWithHr.reduce((s, p) => s + p.hr_bpm, 0) / keiserWithHr.length)
      hrComplete = keiserWithHr.length >= WINDOW_ACTUAL * 0.9
    }
  }

  return { power20, hr20, startUtc: new Date(windowStartMs), hrComplete }
}

// ─── Benchmark writers ────────────────────────────────────────────────────────

function writeBikeBenchmarks(db, activityDate, best20, source) {
  db.prepare("INSERT OR REPLACE INTO athlete_benchmarks (metric, value, unit, date, method, notes) VALUES (?, ?, ?, ?, ?, ?)")
    .run('bike_power20_w', best20.power20, 'W', activityDate, source, best20.hr20 == null ? 'HR incomplete' : '')
  if (best20.hr20 != null) {
    const bz = deriveBikeZones(best20.power20, best20.hr20)
    db.prepare("INSERT OR REPLACE INTO athlete_benchmarks (metric, value, unit, date, method, notes) VALUES (?, ?, ?, ?, ?, ?)")
      .run('bike_hr20_bpm', best20.hr20, 'bpm', activityDate, source, best20.hrComplete ? '' : 'HR incomplete')
    db.prepare("INSERT OR REPLACE INTO athlete_benchmarks (metric, value, unit, date, method, notes) VALUES (?, ?, ?, ?, ?, ?)")
      .run('bike_ceiling_hr', bz.bikeCeiling, 'bpm', activityDate, source, '')
    return { ftp: bz.ftp, lthr: bz.bikeLthr, bikeCeiling: bz.bikeCeiling }
  }
  return { ftp: halfUp(best20.power20 * 0.95), lthr: null }
}

// ─── Stream insert / merge ────────────────────────────────────────────────────

// CN-20 #2: INSERT OR IGNORE for existing rows; then UPDATE nulls for Garmin HR
function mergeOrInsertStreams(sessionId, points, garminHrByTs, db) {
  const ins = db.prepare(
    'INSERT OR IGNORE INTO bike_streams (logged_session_id, t_utc, power_w, cadence_rpm, hr_bpm, power_source, hr_source) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const updPower = db.prepare(
    'UPDATE bike_streams SET power_w=COALESCE(power_w,?), cadence_rpm=COALESCE(cadence_rpm,?) WHERE logged_session_id=? AND t_utc=?'
  )
  db.transaction(() => {
    for (const p of points) {
      const tStr = p.t_utc.toISOString()
      const key  = Math.round(p.t_utc.getTime() / 1000)
      const garminHr = garminHrByTs ? garminHrByTs.get(key) : null
      const hr    = garminHr != null ? garminHr : p.hr_bpm
      const hrSrc = garminHr != null ? 'garmin' : (p.hr_bpm != null ? 'keiser' : null)
      const inserted = ins.run(sessionId, tStr, p.power_w, p.cadence_rpm, hr, 'keiser', hrSrc)
      if (inserted.changes === 0) {
        // Row existed — fill nulls
        updPower.run(p.power_w, p.cadence_rpm, sessionId, tStr)
        if (garminHr != null) {
          db.prepare('UPDATE bike_streams SET hr_bpm=COALESCE(hr_bpm,?), hr_source=COALESCE(hr_source,?) WHERE logged_session_id=? AND t_utc=?')
            .run(garminHr, 'garmin', sessionId, tStr)
        }
      }
    }
  })()
}

// ─── Main TCX import ──────────────────────────────────────────────────────────

function importKeiserTcx(tcxPath, garminFitDir, db) {
  const sha256Tcx = fileSha256(tcxPath)
  if (getImportFile(db, sha256Tcx)) return { imported: false, idempotent: true, path: tcxPath }

  const tcxData = parseKeiserTcx(tcxPath)
  if (!tcxData) return { error: 'failed to parse TCX: ' + tcxPath }
  const { points, startUtc, endUtc } = tcxData

  // Derive activity date from filename or TCX start time (ET)
  const fnBase = path.basename(tcxPath, '.tcx').replace(/\.TCX$/i, '')
  const dateParts = fnBase.match(/(\d{4})-(\d{2})-(\d{2})/)
  const activityDate = dateParts
    ? `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(startUtc)

  // CN-20 #2: find matching Garmin FIT not yet in import_files
  let garminData = null, garminFitPath = null, garminFitSha256 = null
  if (garminFitDir && fs.existsSync(garminFitDir)) {
    const fitFiles = fs.readdirSync(garminFitDir)
      .filter(f => f.toLowerCase().endsWith('.fit'))
      .map(f => path.join(garminFitDir, f))
    for (const fitPath of fitFiles) {
      const fitSha = fileSha256(fitPath)
      if (getImportFile(db, fitSha)) continue   // FIT already imported separately
      const candidate = readGarminBikeHr(fitPath)
      if (!candidate || !candidate.sessionStartUtc || !candidate.sessionEndUtc) continue
      if (overlapsAtLeast50pct(startUtc, endUtc, candidate.sessionStartUtc, candidate.sessionEndUtc)) {
        garminData = candidate
        garminFitPath = fitPath
        garminFitSha256 = fitSha
        break
      }
    }
  }

  // Find bike logged_session for this date
  const session = db.prepare(
    "SELECT id, moving_min, notes, planned_session_id FROM logged_sessions WHERE discipline='bike' AND date=? ORDER BY id LIMIT 1"
  ).get(activityDate)

  // Avg power for whole session
  const withPower = points.filter(p => p.power_w != null)
  const avgPowerW = withPower.length > 0
    ? Math.round(withPower.reduce((s, p) => s + p.power_w, 0) / withPower.length)
    : null

  // Garmin HR map for stream merge
  const garminHrByTs = garminData
    ? new Map(garminData.records.map(r => [Math.round(r.t_utc.getTime() / 1000), r.hr_bpm]))
    : null

  if (session) {
    // CN-20 #3: clean notes
    let noteStr = cleanNotes(session.notes)

    // Moving min from cadence
    const cadSecs = points.filter(p => p.cadence_rpm != null && p.cadence_rpm > 0).length
    const newMovingMin = (!session.moving_min || session.moving_min === 0)
      ? cadSecs / 60 : session.moving_min
    const movingNote = (!session.moving_min || session.moving_min === 0) ? 'moving: keiser' : ''
    if (movingNote && !noteStr.includes('moving: keiser')) {
      noteStr = noteStr ? noteStr + '; ' + movingNote : movingNote
    }

    // CN-20 #1: always compute best20 for ftp_test (check FK or same-date planned session)
    const isFtpTest = (session.planned_session_id != null
      ? db.prepare("SELECT id FROM planned_sessions WHERE id=? AND type='ftp_test'").get(session.planned_session_id) != null
      : db.prepare("SELECT id FROM planned_sessions WHERE date=? AND discipline='bike' AND type='ftp_test' LIMIT 1").get(activityDate) != null)

    let best20 = null
    if (isFtpTest) {
      best20 = findBest20Window(points, garminData?.records, garminData?.laps)
    }

    // Update session fields
    const setFields = {
      avg_power_w: avgPowerW,
      power_source: garminData ? 'keiser+garmin' : 'keiser',
      notes: noteStr,
      moving_min: newMovingMin,
    }
    if (best20) {
      setFields.best20_power_w    = best20.power20
      setFields.best20_hr_bpm     = best20.hr20
      setFields.best20_start_utc  = best20.startUtc.toISOString()
    }
    const setClauses = Object.keys(setFields).map(k => `${k}=?`).join(', ')
    db.prepare(`UPDATE logged_sessions SET ${setClauses} WHERE id=?`).run(...Object.values(setFields), session.id)

    // CN-20 #2: merge or insert streams
    mergeOrInsertStreams(session.id, points, garminHrByTs, db)

    // CN-20 #1: write FTP benchmark (power always; HR if available)
    let ftpResult = null
    if (isFtpTest && best20 && best20.power20 != null) {
      const source = garminData ? 'auto: keiser+garmin' : 'auto: keiser'
      ftpResult = writeBikeBenchmarks(db, activityDate, best20, source)
    }

    // CN-20 #2: record imported files
    insertImportFile(db, { sha256: sha256Tcx, filePath: tcxPath, source: 'keiser-tcx', sessionId: session.id })
    if (garminFitSha256) {
      insertImportFile(db, { sha256: garminFitSha256, filePath: garminFitPath, source: 'garmin-fit', sessionId: session.id })
    }

    return { imported: true, sessionId: session.id, date: activityDate, matched: true, avgPowerW, best20, ftpResult }

  } else {
    // No matching session: create keiser-only row
    const durationMin = (endUtc.getTime() - startUtc.getTime()) / 60000
    const r = db.prepare(
      `INSERT INTO logged_sessions (discipline, date, duration, avg_power_w, power_source, notes, source)
       VALUES ('bike', ?, ?, ?, 'keiser', 'keiser-only (no HR)', 'keiser-tcx')`
    ).run(activityDate, durationMin, avgPowerW)
    const newId = r.lastInsertRowid

    mergeOrInsertStreams(newId, points, garminHrByTs, db)

    insertImportFile(db, { sha256: sha256Tcx, filePath: tcxPath, source: 'keiser-tcx', sessionId: newId })
    if (garminFitSha256) {
      insertImportFile(db, { sha256: garminFitSha256, filePath: garminFitPath, source: 'garmin-fit', sessionId: newId })
    }

    return { imported: true, sessionId: newId, date: activityDate, matched: false, note: 'keiser-only' }
  }
}

// ─── Late Garmin FIT import (CN-20 #1/#2) ────────────────────────────────────

function importGarminFit(fitPath, db) {
  const sha256 = fileSha256(fitPath)
  if (getImportFile(db, sha256)) return { imported: false, idempotent: true, path: fitPath }

  const garminData = readGarminBikeHr(fitPath)
  if (!garminData || !garminData.sessionStartUtc || !garminData.sessionEndUtc) {
    return { error: 'no bike session in FIT', path: fitPath }
  }

  // Find matching session: look for bike session with overlapping stream timestamps
  const startStr = garminData.sessionStartUtc.toISOString()
  const endStr   = garminData.sessionEndUtc.toISOString()
  let session = db.prepare(`
    SELECT ls.id, ls.planned_session_id, ls.date, ls.best20_start_utc, ls.best20_power_w
    FROM logged_sessions ls
    WHERE ls.discipline='bike'
      AND EXISTS (SELECT 1 FROM bike_streams bs WHERE bs.logged_session_id=ls.id AND bs.t_utc >= ? AND bs.t_utc <= ?)
    LIMIT 1
  `).get(startStr, endStr)

  if (!session) {
    // Fallback: match by date
    const sessionDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(garminData.sessionStartUtc)
    session = db.prepare(
      "SELECT id, planned_session_id, date, best20_start_utc, best20_power_w FROM logged_sessions WHERE discipline='bike' AND date=? LIMIT 1"
    ).get(sessionDate)
  }

  if (!session) return { error: 'no matching bike session', path: fitPath }

  // Merge HR into existing bike_streams by t_utc
  const insRow = db.prepare(
    'INSERT OR IGNORE INTO bike_streams (logged_session_id, t_utc, power_w, cadence_rpm, hr_bpm, power_source, hr_source) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const updHr = db.prepare(
    'UPDATE bike_streams SET hr_bpm=COALESCE(hr_bpm,?), hr_source=COALESCE(hr_source,?) WHERE logged_session_id=? AND t_utc=?'
  )
  let hrMerged = 0
  db.transaction(() => {
    for (const r of garminData.records) {
      const tStr = r.t_utc.toISOString()
      const res = updHr.run(r.hr_bpm, 'garmin', session.id, tStr)
      if (res.changes > 0) hrMerged++
      else insRow.run(session.id, tStr, null, null, r.hr_bpm, 'keiser', 'garmin')
    }
  })()

  // CN-20 #1: recompute H in best20 window if session is ftp_test
  let ftpResult = null
  const isFtpTest = (session.planned_session_id != null
    ? db.prepare("SELECT id FROM planned_sessions WHERE id=? AND type='ftp_test'").get(session.planned_session_id) != null
    : db.prepare("SELECT id FROM planned_sessions WHERE date=? AND discipline='bike' AND type='ftp_test' LIMIT 1").get(
        db.prepare('SELECT date FROM logged_sessions WHERE id=?').get(session.id)?.date
      ) != null)

  if (isFtpTest && session.best20_start_utc && session.best20_power_w) {
    const windowStartMs = new Date(session.best20_start_utc).getTime()
    const windowEndMs   = windowStartMs + 1200 * 1000
    const inWindow = garminData.records.filter(r => {
      const t = r.t_utc.getTime()
      return t >= windowStartMs && t < windowEndMs
    })
    if (inWindow.length >= 1200 * 0.9) {
      const hr20   = Math.round(inWindow.reduce((s, r) => s + r.hr_bpm, 0) / inWindow.length)
      const power20 = session.best20_power_w
      const source  = 'auto: keiser+garmin'
      const bz = deriveBikeZones(power20, hr20)
      db.prepare("INSERT OR REPLACE INTO athlete_benchmarks (metric, value, unit, date, method, notes) VALUES (?, ?, ?, ?, ?, ?)")
        .run('bike_hr20_bpm', hr20, 'bpm', session.date, source, '')
      db.prepare("INSERT OR REPLACE INTO athlete_benchmarks (metric, value, unit, date, method, notes) VALUES (?, ?, ?, ?, ?, ?)")
        .run('bike_ceiling_hr', bz.bikeCeiling, 'bpm', session.date, source, '')
      db.prepare("UPDATE athlete_benchmarks SET method=?, notes='' WHERE metric='bike_power20_w' AND date=?")
        .run(source, session.date)
      db.prepare('UPDATE logged_sessions SET best20_hr_bpm=?, power_source=? WHERE id=?')
        .run(hr20, 'keiser+garmin', session.id)
      ftpResult = { hr20, lthr: bz.bikeLthr, bikeCeiling: bz.bikeCeiling }
    }
  }

  // Update avg_hr on session from all merged HR records if currently null
  const sessionRow = db.prepare('SELECT avg_hr FROM logged_sessions WHERE id=?').get(session.id)
  if (sessionRow && sessionRow.avg_hr == null && garminData.records.length > 0) {
    const avgHr = Math.round(garminData.records.reduce((s, r) => s + r.hr_bpm, 0) / garminData.records.length)
    db.prepare('UPDATE logged_sessions SET avg_hr=? WHERE id=?').run(avgHr, session.id)
  }

  insertImportFile(db, { sha256, filePath: fitPath, source: 'garmin-fit', sessionId: session.id })

  return { imported: true, sessionId: session.id, hrMerged, ftpResult }
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

function backfillKeiserSessions(keiserDir, garminFitDir, db) {
  const results = []

  // Process all TCX files (idempotent via sha256)
  if (keiserDir && fs.existsSync(keiserDir)) {
    const tcxFiles = fs.readdirSync(keiserDir)
      .filter(f => f.toLowerCase().endsWith('.tcx'))
      .map(f => path.join(keiserDir, f))
    for (const f of tcxFiles) {
      results.push({ file: path.basename(f), ...importKeiserTcx(f, garminFitDir, db) })
    }
  }

  // Process any FIT files not yet imported (late-arriving FIT)
  if (garminFitDir && fs.existsSync(garminFitDir)) {
    const fitFiles = fs.readdirSync(garminFitDir)
      .filter(f => f.toLowerCase().endsWith('.fit'))
      .map(f => path.join(garminFitDir, f))
    for (const f of fitFiles) {
      const sha256 = fileSha256(f)
      if (!getImportFile(db, sha256)) {
        results.push({ file: path.basename(f), ...importGarminFit(f, db) })
      }
    }
  }

  // Report sessions without Keiser power
  const sessionsWithoutKeiser = db.prepare(
    "SELECT id, date FROM logged_sessions WHERE discipline='bike' AND date<='2026-10-18' AND (power_source IS NULL OR power_source='')"
  ).all()

  return { results, noKeiserDates: sessionsWithoutKeiser.map(s => s.date) }
}

module.exports = { parseKeiserTcx, readGarminBikeHr, findBest20Window, importKeiserTcx, importGarminFit, backfillKeiserSessions }
