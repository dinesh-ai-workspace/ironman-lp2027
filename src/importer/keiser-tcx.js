'use strict'

const fs = require('fs')
const path = require('path')
const { DOMParser } = require('@xmldom/xmldom')
const FitParser = require('fit-file-parser').default
const { deriveBikeZones } = require('../core/scoring/zones')

const halfUp = n => Math.floor(n + 0.5)

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

    // Power (Watts) from TPX extension — use getElementsByTagNameNS('*',...) to match any namespace prefix
    let power_w = null
    const wattsEls = tp.getElementsByTagNameNS('*', 'Watts')
    if (wattsEls.length > 0) {
      const w = parseFloat(wattsEls[0].textContent)
      if (!isNaN(w) && w > 2000) continue  // drop bad point
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
    // Accept any cycling session (indoor or outdoor)
    const bikeSession = sessions.find(s =>
      s.sport === 'cycling' || s.sport === 'bike'
    )
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

// ─── Best 20-min window ───────────────────────────────────────────────────────

function findBest20Window(keiserPoints, garminRecords, garminLaps) {
  if (keiserPoints.length === 0) return null
  const WINDOW_S = 1200

  // Prefer Garmin laps of 1170–1230 s; pick the one with highest Keiser avg power in that window
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
  const WINDOW_ACTUAL = (windowEndMs - windowStartMs) / 1000  // actual window length in seconds
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

// ─── Main import ──────────────────────────────────────────────────────────────

function importKeiserTcx(tcxPath, garminFitDir, db) {
  // Parse Keiser TCX
  const tcxData = parseKeiserTcx(tcxPath)
  if (!tcxData) return { error: 'failed to parse TCX: ' + tcxPath }
  const { points, startUtc, endUtc } = tcxData

  // Derive date from filename (YYYY-MM-DD*) or from TCX start time (ET)
  const fnBase = path.basename(tcxPath, '.tcx').replace(/\.TCX$/i, '')
  const dateParts = fnBase.match(/(\d{4})-(\d{2})-(\d{2})/)
  const activityDate = dateParts
    ? `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(startUtc)

  // Find matching Garmin FIT file (overlap ≥50% with Keiser time range)
  let garminData = null
  if (garminFitDir && fs.existsSync(garminFitDir)) {
    const fitFiles = fs.readdirSync(garminFitDir)
      .filter(f => f.toLowerCase().endsWith('.fit'))
      .map(f => path.join(garminFitDir, f))
    for (const fitPath of fitFiles) {
      const candidate = readGarminBikeHr(fitPath)
      if (!candidate || !candidate.sessionStartUtc || !candidate.sessionEndUtc) continue
      if (overlapsAtLeast50pct(startUtc, endUtc, candidate.sessionStartUtc, candidate.sessionEndUtc)) {
        garminData = candidate
        break
      }
    }
  }

  // Find bike logged_session for this date
  const session = db.prepare(
    "SELECT id, moving_min, notes, planned_session_id FROM logged_sessions WHERE discipline='bike' AND date=? ORDER BY id LIMIT 1"
  ).get(activityDate)

  // Idempotency: if bike_streams already populated for this session, skip
  if (session) {
    const existing = db.prepare('SELECT COUNT(*) as cnt FROM bike_streams WHERE logged_session_id=?').get(session.id)
    if (existing.cnt > 0) return { imported: true, idempotent: true, sessionId: session.id, date: activityDate }
  }

  // Avg power for whole session
  const withPower = points.filter(p => p.power_w != null)
  const avgPowerW = withPower.length > 0
    ? Math.round(withPower.reduce((s, p) => s + p.power_w, 0) / withPower.length)
    : null

  if (session && garminData) {
    // ── Merge: enrich existing session ──────────────────────────────────────
    let movingNote = ''
    let newMovingMin = session.moving_min
    if (!newMovingMin || newMovingMin === 0) {
      const cadSecs = points.filter(p => p.cadence_rpm != null && p.cadence_rpm > 0).length
      newMovingMin = cadSecs / 60
      movingNote = 'moving: keiser'
    }

    // Check if planned session is ftp_test
    const isFtpTest = session.planned_session_id != null
      ? db.prepare("SELECT id FROM planned_sessions WHERE id=? AND type='ftp_test'").get(session.planned_session_id) != null
      : false

    let best20 = null
    if (isFtpTest) {
      best20 = findBest20Window(points, garminData.records, garminData.laps)
    }

    // Build updated notes
    let noteStr = (session.notes || '')
      .replace(/[;,]?\s*dur-fallback\b/gi, '').trim().replace(/^[;,]\s*/, '').trim()
    if (movingNote && !noteStr.includes('moving: keiser')) {
      noteStr = noteStr ? noteStr + '; ' + movingNote : movingNote
    }

    // Persist: update logged_session
    const setFields = { avg_power_w: avgPowerW, power_source: 'keiser', notes: noteStr }
    if (movingNote) setFields.moving_min = newMovingMin
    if (best20) {
      setFields.best20_power_w = best20.power20
      setFields.best20_hr_bpm = best20.hr20
      setFields.best20_start_utc = best20.startUtc.toISOString()
    }
    const setClauses = Object.keys(setFields).map(k => `${k}=?`).join(', ')
    db.prepare(`UPDATE logged_sessions SET ${setClauses} WHERE id=?`).run(...Object.values(setFields), session.id)

    // Insert bike_streams (merge Garmin HR by timestamp)
    const garminHrByTs = new Map()
    for (const r of garminData.records) garminHrByTs.set(Math.round(r.t_utc.getTime() / 1000), r.hr_bpm)
    const ins = db.prepare(
      'INSERT INTO bike_streams (logged_session_id, t_utc, power_w, cadence_rpm, hr_bpm, power_source, hr_source) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    db.transaction(() => {
      for (const p of points) {
        const key = Math.round(p.t_utc.getTime() / 1000)
        const garminHr = garminHrByTs.get(key)
        const hr = garminHr != null ? garminHr : p.hr_bpm
        const hrSrc = garminHr != null ? 'garmin' : (p.hr_bpm != null ? 'keiser' : null)
        ins.run(session.id, p.t_utc.toISOString(), p.power_w, p.cadence_rpm, hr, 'keiser', hrSrc)
      }
    })()

    // FTP extraction for ftp_test sessions
    let ftpResult = null
    if (isFtpTest && best20 && best20.power20 != null) {
      const ftp = halfUp(best20.power20 * 0.95)
      const source = 'auto: keiser+garmin'
      const ftpNote = best20.hrComplete ? '' : 'HR incomplete'
      db.prepare("INSERT OR REPLACE INTO athlete_benchmarks (metric, value, unit, date, method, notes) VALUES (?, ?, ?, ?, ?, ?)").run('bike_power20_w', best20.power20, 'W', activityDate, source, '')
      if (best20.hr20 != null) {
        const lthr = halfUp(best20.hr20 * 0.95)
        db.prepare("INSERT OR REPLACE INTO athlete_benchmarks (metric, value, unit, date, method, notes) VALUES (?, ?, ?, ?, ?, ?)").run('bike_hr20_bpm', best20.hr20, 'bpm', activityDate, source, ftpNote)
        const bz = deriveBikeZones(best20.power20, best20.hr20)
        db.prepare("INSERT OR REPLACE INTO athlete_benchmarks (metric, value, unit, date, method, notes) VALUES (?, ?, ?, ?, ?, ?)").run('bike_ceiling_hr', bz.bikeCeiling, 'bpm', activityDate, source, '')
        ftpResult = { ftp, lthr, bikeCeiling: bz.bikeCeiling }
      } else {
        ftpResult = { ftp, lthr: null }
      }
    }

    return { imported: true, sessionId: session.id, date: activityDate, matched: true, avgPowerW, best20, ftpResult }

  } else if (!session) {
    // ── No matching logged_session: create keiser-only row ───────────────────
    const durationMin = (endUtc.getTime() - startUtc.getTime()) / 60000
    const r = db.prepare(
      `INSERT INTO logged_sessions (discipline, date, duration, avg_power_w, power_source, notes, source)
       VALUES ('bike', ?, ?, ?, 'keiser', 'keiser-only (no HR)', 'keiser-tcx')`
    ).run(activityDate, durationMin, avgPowerW)
    const newId = r.lastInsertRowid

    const ins = db.prepare(
      'INSERT INTO bike_streams (logged_session_id, t_utc, power_w, cadence_rpm, hr_bpm, power_source, hr_source) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    db.transaction(() => {
      for (const p of points) {
        const hrSrc = p.hr_bpm != null ? 'keiser' : null
        ins.run(newId, p.t_utc.toISOString(), p.power_w, p.cadence_rpm, p.hr_bpm, 'keiser', hrSrc)
      }
    })()

    return { imported: true, sessionId: newId, date: activityDate, matched: false, note: 'keiser-only (no HR)' }

  } else {
    // Session exists but no Garmin FIT found: enrich power only, no HR merge
    let noteStr = (session.notes || '')
      .replace(/[;,]?\s*dur-fallback\b/gi, '').trim().replace(/^[;,]\s*/, '').trim()
    const cadSecs = points.filter(p => p.cadence_rpm != null && p.cadence_rpm > 0).length
    const newMovingMin = (!session.moving_min || session.moving_min === 0) ? cadSecs / 60 : session.moving_min
    const movingNote = (!session.moving_min || session.moving_min === 0) ? 'moving: keiser' : ''
    if (movingNote && !noteStr.includes('moving: keiser')) noteStr = noteStr ? noteStr + '; ' + movingNote : movingNote

    db.prepare('UPDATE logged_sessions SET avg_power_w=?, power_source=?, notes=?, moving_min=? WHERE id=?')
      .run(avgPowerW, 'keiser', noteStr, newMovingMin, session.id)

    const ins = db.prepare(
      'INSERT INTO bike_streams (logged_session_id, t_utc, power_w, cadence_rpm, hr_bpm, power_source, hr_source) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    db.transaction(() => {
      for (const p of points) {
        ins.run(session.id, p.t_utc.toISOString(), p.power_w, p.cadence_rpm, p.hr_bpm, 'keiser', p.hr_bpm != null ? 'keiser' : null)
      }
    })()

    return { imported: true, sessionId: session.id, date: activityDate, matched: true, garminHrMissing: true, avgPowerW }
  }
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

function backfillKeiserSessions(keiserDir, garminFitDir, db) {
  const tcxFiles = (keiserDir && fs.existsSync(keiserDir))
    ? fs.readdirSync(keiserDir).filter(f => f.toLowerCase().endsWith('.tcx')).map(f => path.join(keiserDir, f))
    : []

  const results = tcxFiles.map(f => ({ tcxFile: f, ...importKeiserTcx(f, garminFitDir, db) }))

  // List Wk 1–5 indoor bike sessions (no power_source set = no Keiser data)
  const wk5End = '2026-10-18'
  const sessionsWithoutKeiser = db.prepare(
    "SELECT id, date FROM logged_sessions WHERE discipline='bike' AND date<=? AND (power_source IS NULL OR power_source='') ORDER BY date"
  ).all(wk5End)
  const noKeiserDates = sessionsWithoutKeiser.map(s => s.date)

  return { results, noKeiserDates }
}

module.exports = { parseKeiserTcx, readGarminBikeHr, findBest20Window, importKeiserTcx, backfillKeiserSessions }
