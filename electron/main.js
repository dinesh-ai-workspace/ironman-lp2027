'use strict'

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')

// ─── Database setup ────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV !== 'production'

function getDbPath() {
  if (isDev) {
    return path.join(__dirname, '../data/ironman.db')
  }
  return path.join(app.getPath('userData'), 'ironman.db')
}

// Ensure data directory exists in dev
const dbPath = getDbPath()
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const { getDb } = require('../src/db/connection')
const { generatePlan, savePlan } = require('../src/core/plan-generator/index')
const { runImportPipeline } = require('../src/importer/pipeline')
const garminPreset = require('../src/importer/presets/garmin')
const mfpPreset = require('../src/importer/presets/myfitnesspal')
const { parseGarminSleepFile } = require('../src/importer/presets/garmin-sleep')
const { runRenphoPipeline } = require('../src/importer/renpho-pipeline')

let db

// ─── Window creation ───────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: '#0f172a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/renderer/index.html'))
  }

  return win
}

// ─── DB migrations ────────────────────────────────────────────────────────
function runMigrations() {
  const dwCols = db.prepare('PRAGMA table_info(daily_wellness)').all().map(c => c.name)
  if (!dwCols.includes('body_weight_lb')) {
    db.prepare('ALTER TABLE daily_wellness ADD COLUMN body_weight_lb REAL').run()
  }
  if (!dwCols.includes('hunger')) {
    db.prepare('ALTER TABLE daily_wellness ADD COLUMN hunger TEXT').run()
  }
  db.prepare(`
    CREATE TABLE IF NOT EXISTS weekly_fat_loss_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start_date TEXT NOT NULL UNIQUE,
      waist_in REAL,
      strength_trend TEXT NOT NULL DEFAULT 'stable',
      training_phase TEXT NOT NULL DEFAULT 'base',
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )
  `).run()
  const ciCols = db.prepare('PRAGMA table_info(weekly_fat_loss_checkins)').all().map(c => c.name)
  if (!ciCols.includes('status')) {
    db.prepare("ALTER TABLE weekly_fat_loss_checkins ADD COLUMN status TEXT NOT NULL DEFAULT 'green'").run()
  }

  db.prepare(`
    CREATE TABLE IF NOT EXISTS readiness_overrides (
      gate       TEXT PRIMARY KEY,
      status     TEXT NOT NULL,
      note       TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS body_composition (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      date                 TEXT NOT NULL,
      time                 TEXT,
      weight_lb            REAL NOT NULL,
      bmi                  REAL,
      body_fat_pct         REAL,
      skeletal_muscle_pct  REAL,
      fat_free_mass_lb     REAL,
      subcutaneous_fat_pct REAL,
      visceral_fat         REAL,
      body_water_pct       REAL,
      muscle_mass_lb       REAL,
      bone_mass_lb         REAL,
      protein_pct          REAL,
      bmr_kcal             INTEGER,
      metabolic_age        INTEGER,
      source               TEXT NOT NULL DEFAULT 'renpho',
      import_batch_id      TEXT,
      UNIQUE(date, time)
    )
  `).run()
}

// ─── First-launch plan initialization ─────────────────────────────────────
function initializePlan() {
  // Plan start: Sep 14, 2026 (Monday). Race: Jul 25, 2027 = 45 weeks.
  // Two buffer weeks before the Sep 28 hard-training block.
  const PLAN_START = '2026-09-14'
  const existingPlan = db.prepare(
    "SELECT id, plan_start_date FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1"
  ).get()

  if (existingPlan && existingPlan.plan_start_date === PLAN_START) return

  // Supersede any stale active plan before inserting the new one.
  db.prepare("UPDATE plans SET status='superseded' WHERE status='active'").run()

  const planStartDate   = new Date('2026-09-14T00:00:00Z')
  const athleteBirthDate = new Date('1980-01-15T00:00:00Z')
  const raceDate        = new Date('2027-07-25T00:00:00Z')

  try {
    const generated = generatePlan({ raceDate, planStartDate, athleteBirthDate })
    savePlan(db, generated)
    console.log('[main] Plan generated: Sep 14 2026 → Jul 25 2027 (45 weeks).')
  } catch (err) {
    console.error('[main] Failed to generate plan:', err)
  }
}

// ─── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  db = getDb(dbPath)
  runMigrations()
  initializePlan()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── Helpers ───────────────────────────────────────────────────────────────
function getPresetByName(name) {
  if (name === 'garmin') return garminPreset
  if (name === 'myfitnesspal') return mfpPreset
  return null
}

function parseCSVManual(content) {
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

// ─── IPC: plan:get ─────────────────────────────────────────────────────────
ipcMain.handle('plan:get', () => {
  return db.prepare(
    "SELECT * FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1"
  ).get() || null
})

// ─── IPC: plan:generate ───────────────────────────────────────────────────
ipcMain.handle('plan:generate', (event, config) => {
  const raceDate = new Date(config.raceDate)
  const planStartDate = new Date(config.planStartDate)
  const athleteBirthDate = new Date(config.athleteBirthDate || '1980-01-15T00:00:00Z')
  const generated = generatePlan({ raceDate, planStartDate, athleteBirthDate })
  return savePlan(db, generated)
})

// ─── IPC: sessions:planned:list ───────────────────────────────────────────
ipcMain.handle('sessions:planned:list', (event, filters = {}) => {
  // Always scope to the active plan to prevent duplicate rows from superseded plans.
  const activePlan = db.prepare("SELECT id FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1").get()
  const conditions = ['ps.plan_id = ?']
  const params = [activePlan ? activePlan.id : -1]

  if (filters.weekStartDate) {
    conditions.push('ps.date >= ?')
    params.push(filters.weekStartDate)
  }
  if (filters.weekEndDate) {
    conditions.push('ps.date <= ?')
    params.push(filters.weekEndDate)
  }
  if (filters.discipline) {
    conditions.push('ps.discipline = ?')
    params.push(filters.discipline)
  }
  if (filters.date) {
    conditions.push('ps.date = ?')
    params.push(filters.date)
  }

  const sql = `
    SELECT ps.*, pb.phase, pb.phase_name
    FROM planned_sessions ps
    JOIN plan_blocks pb ON ps.block_id = pb.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ps.date, ps.discipline
  `
  return db.prepare(sql).all(...params)
})

// ─── IPC: sessions:log ────────────────────────────────────────────────────
ipcMain.handle('sessions:log', (event, session) => {
  let plannedSessionId = session.planned_session_id || null

  // Auto-match to planned session if not provided
  if (!plannedSessionId && session.date && session.discipline) {
    const activeForLog = db.prepare("SELECT id FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1").get()
    const candidates = db.prepare(`
      SELECT * FROM planned_sessions
      WHERE plan_id = ? AND date = ? AND discipline = ?
    `).all(activeForLog ? activeForLog.id : -1, session.date, session.discipline)

    if (candidates.length > 0 && session.duration) {
      const dur = parseInt(session.duration)
      const match = candidates.find(c => Math.abs(c.target_duration - dur) / c.target_duration <= 0.3)
      if (match) plannedSessionId = match.id
    }
  }

  const stmt = db.prepare(`
    INSERT INTO logged_sessions
      (planned_session_id, discipline, date, start_datetime, end_datetime, duration, distance,
       avg_hr, rpe, notes, is_brick, avg_power, normalized_power, avg_cadence,
       environment, wetsuit_used, pool_length_m, source, import_batch_id)
    VALUES
      (@planned_session_id, @discipline, @date, @start_datetime, @end_datetime, @duration, @distance,
       @avg_hr, @rpe, @notes, @is_brick, @avg_power, @normalized_power, @avg_cadence,
       @environment, @wetsuit_used, @pool_length_m, @source, @import_batch_id)
  `)

  const result = stmt.run({
    planned_session_id: plannedSessionId,
    discipline: session.discipline,
    date: session.date,
    start_datetime: session.start_datetime || null,
    end_datetime: session.end_datetime || null,
    duration: session.duration ? parseInt(session.duration) : null,
    distance: session.distance ? parseFloat(session.distance) : null,
    avg_hr: session.avg_hr ? parseInt(session.avg_hr) : null,
    rpe: session.rpe ? parseInt(session.rpe) : null,
    notes: session.notes || '',
    is_brick: session.is_brick ? 1 : 0,
    avg_power: session.avg_power ? parseInt(session.avg_power) : null,
    normalized_power: session.normalized_power ? parseInt(session.normalized_power) : null,
    avg_cadence: session.avg_cadence ? parseInt(session.avg_cadence) : null,
    environment: session.environment || null,
    wetsuit_used: session.wetsuit_used ? 1 : 0,
    pool_length_m: session.pool_length_m ? parseInt(session.pool_length_m) : null,
    source: session.source || 'manual',
    import_batch_id: session.import_batch_id || null,
  })

  return { id: result.lastInsertRowid }
})

// ─── IPC: sessions:logged:list ────────────────────────────────────────────
ipcMain.handle('sessions:logged:list', (event, filters = {}) => {
  const conditions = ['1=1']
  const params = []

  if (filters.startDate) {
    conditions.push('date >= ?')
    params.push(filters.startDate)
  }
  if (filters.endDate) {
    conditions.push('date <= ?')
    params.push(filters.endDate)
  }
  if (filters.discipline) {
    conditions.push('discipline = ?')
    params.push(filters.discipline)
  }

  return db.prepare(
    `SELECT * FROM logged_sessions WHERE ${conditions.join(' AND ')} ORDER BY date DESC`
  ).all(...params)
})

// ─── IPC: sessions:logged:update ─────────────────────────────────────────
ipcMain.handle('sessions:logged:update', (event, id, data) => {
  const fields = []
  const params = []
  const allowed = ['duration', 'distance', 'avg_hr', 'rpe', 'notes', 'avg_power',
    'normalized_power', 'avg_cadence', 'environment', 'wetsuit_used', 'pool_length_m']
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`)
      params.push(data[key])
    }
  }
  if (!fields.length) return { changes: 0 }
  params.push(id)
  const result = db.prepare(`UPDATE logged_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return { changes: result.changes }
})

// ─── IPC: wellness:save ───────────────────────────────────────────────────
ipcMain.handle('wellness:save', (event, entry) => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO daily_wellness
      (date, sleep_hours, sleep_quality_1_5, fatigue_1_5, soreness_1_5,
       pain_flag, pain_notes, motivation_1_5, notes, body_weight_lb, hunger)
    VALUES
      (@date, @sleep_hours, @sleep_quality_1_5, @fatigue_1_5, @soreness_1_5,
       @pain_flag, @pain_notes, @motivation_1_5, @notes, @body_weight_lb, @hunger)
  `)
  const result = stmt.run({
    date: entry.date,
    sleep_hours: entry.sleep_hours !== undefined ? entry.sleep_hours : null,
    sleep_quality_1_5: entry.sleep_quality_1_5 !== undefined ? entry.sleep_quality_1_5 : null,
    fatigue_1_5: entry.fatigue_1_5 !== undefined ? entry.fatigue_1_5 : null,
    soreness_1_5: entry.soreness_1_5 !== undefined ? entry.soreness_1_5 : null,
    pain_flag: entry.pain_flag ? 1 : 0,
    pain_notes: entry.pain_notes || '',
    motivation_1_5: entry.motivation_1_5 !== undefined ? entry.motivation_1_5 : null,
    notes: entry.notes || '',
    body_weight_lb: entry.body_weight_lb !== undefined ? entry.body_weight_lb : null,
    hunger: entry.hunger || null,
  })
  return { id: result.lastInsertRowid }
})

// ─── IPC: wellness:get ────────────────────────────────────────────────────
ipcMain.handle('wellness:get', (event, date) => {
  return db.prepare('SELECT * FROM daily_wellness WHERE date = ?').get(date) || null
})

// ─── IPC: wellness:history ────────────────────────────────────────────────
ipcMain.handle('wellness:history', (event, { start, end } = {}) => {
  const endDate   = end   || new Date().toISOString().slice(0, 10)
  const startDate = start || (() => { const d = new Date(); d.setDate(d.getDate() - 13); return d.toISOString().slice(0, 10) })()
  return db.prepare(
    'SELECT * FROM daily_wellness WHERE date >= ? AND date <= ? ORDER BY date DESC'
  ).all(startDate, endDate)
})

// ─── IPC: stoploss:log-weight ─────────────────────────────────────────────
ipcMain.handle('stoploss:log-weight', (event, { date, weight }) => {
  db.prepare(`
    INSERT INTO daily_wellness (date, body_weight_lb)
    VALUES (@date, @weight)
    ON CONFLICT(date) DO UPDATE SET body_weight_lb = excluded.body_weight_lb
  `).run({ date, weight })
  return { ok: true }
})

// ─── IPC: stoploss:checkin:get ────────────────────────────────────────────
ipcMain.handle('stoploss:checkin:get', (event, weekStartDate) => {
  return db.prepare(
    'SELECT * FROM weekly_fat_loss_checkins WHERE week_start_date = ?'
  ).get(weekStartDate) || null
})

// ─── IPC: stoploss:checkin:save ───────────────────────────────────────────
ipcMain.handle('stoploss:checkin:save', (event, entry) => {
  db.prepare(`
    INSERT INTO weekly_fat_loss_checkins (week_start_date, waist_in, strength_trend, training_phase, notes, status, updated_at)
    VALUES (@week_start_date, @waist_in, @strength_trend, @training_phase, @notes, @status, @updated_at)
    ON CONFLICT(week_start_date) DO UPDATE SET
      waist_in = excluded.waist_in,
      strength_trend = excluded.strength_trend,
      training_phase = excluded.training_phase,
      notes = excluded.notes,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run({
    week_start_date: entry.week_start_date,
    waist_in: entry.waist_in || null,
    strength_trend: entry.strength_trend || 'stable',
    training_phase: entry.training_phase || 'base',
    notes: entry.notes || '',
    status: entry.status || 'green',
    updated_at: new Date().toISOString(),
  })
  return { ok: true }
})

// ─── IPC: stoploss:weekly-check ───────────────────────────────────────────
ipcMain.handle('stoploss:weekly-check', (event, weekStartDate) => {
  function slDateAdd(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  function slAvg(arr) {
    if (!arr.length) return null
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }
  // Bounded parsers — cap at 3 digits to prevent e.g. "HRV: 420" from a malformed note
  function parseHRV(notes) {
    const m = notes && notes.match(/HRV:\s*(\d{1,3})\b/i)
    return m ? parseInt(m[1]) : null
  }
  function parseRHR(notes) {
    const m = notes && notes.match(/RHR:\s*(\d{1,3})\b/i)
    return m ? parseInt(m[1]) : null
  }

  if (!weekStartDate) {
    const now = new Date()
    const dow = now.getUTCDay()
    const diff = dow === 0 ? -6 : 1 - dow
    now.setUTCDate(now.getUTCDate() + diff)
    weekStartDate = now.toISOString().slice(0, 10)
  }

  const wEnd      = slDateAdd(weekStartDate, 6)
  const lwStart   = slDateAdd(weekStartDate, -7)
  const lwEnd     = slDateAdd(weekStartDate, -1)
  const _ntRow  = db.prepare('SELECT protein_g FROM nutrition_targets ORDER BY id DESC LIMIT 1').get()
  const _proteinTarget = _ntRow?.protein_g || 155
  const _planRow = db.prepare("SELECT id FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1").get()
  const _blockRow = _planRow ? db.prepare(
    'SELECT phase FROM plan_blocks WHERE plan_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1'
  ).get(_planRow.id, weekStartDate, weekStartDate) : null
  const phase = _blockRow?.phase || 'base'

  // ── Signal A1: Weight gaining week-over-week ─────────────────────────────
  const twWeights = db.prepare(
    'SELECT body_weight_lb FROM daily_wellness WHERE date >= ? AND date <= ? AND body_weight_lb IS NOT NULL'
  ).all(weekStartDate, wEnd).map(r => r.body_weight_lb)
  const lwWeights = db.prepare(
    'SELECT body_weight_lb FROM daily_wellness WHERE date >= ? AND date <= ? AND body_weight_lb IS NOT NULL'
  ).all(lwStart, lwEnd).map(r => r.body_weight_lb)
  const thisAvgWeight = slAvg(twWeights)
  const lastAvgWeight = slAvg(lwWeights)
  const weeklyChange  = thisAvgWeight != null && lastAvgWeight != null ? thisAvgWeight - lastAvgWeight : null
  const lossRate      = weeklyChange != null ? Math.round(-weeklyChange * 100) / 100 : null
  const weightConfidence = twWeights.length >= 6 ? 'full' : twWeights.length >= 3 ? 'moderate' : 'insufficient'
  // Fire when weight is not going down — need ≥3 readings this week, any last week reading to compare
  const weightSignal = weightConfidence !== 'insufficient' && lastAvgWeight != null && lossRate != null && lossRate <= 0

  // ── Signal B1: Rising fatigue (RHR trending up 3+ consecutive days) ──────
  const rhrRows = db.prepare(
    'SELECT date, notes FROM daily_wellness WHERE date >= ? AND date <= ? ORDER BY date ASC'
  ).all(weekStartDate, wEnd)
  const rhrSeries = rhrRows.map(r => ({ date: r.date, rhr: parseRHR(r.notes) })).filter(r => r.rhr != null)
  const lwRHRRows = db.prepare(
    'SELECT notes FROM daily_wellness WHERE date >= ? AND date <= ?'
  ).all(lwStart, lwEnd)
  const lwRHRSeries = lwRHRRows.map(r => parseRHR(r.notes)).filter(v => v != null)
  const thisRHRAvg = slAvg(rhrSeries.map(r => r.rhr))
  const lastRHRAvg = slAvg(lwRHRSeries)
  let consecRising = 0, maxConsec = 0
  for (let i = 1; i < rhrSeries.length; i++) {
    consecRising = rhrSeries[i].rhr > rhrSeries[i-1].rhr ? consecRising + 1 : 0
    maxConsec = Math.max(maxConsec, consecRising)
  }
  // Require ≥3 valid RHR readings before firing — sparse data shouldn't trigger
  const fatigueSignal = rhrSeries.length >= 3 && maxConsec >= 2

  // ── Signal B2: HRV declining (>5% below prior week avg) ──────────────────
  const twHRV = db.prepare('SELECT notes FROM daily_wellness WHERE date >= ? AND date <= ?').all(weekStartDate, wEnd)
    .map(r => parseHRV(r.notes)).filter(v => v != null)
  const lwHRV = db.prepare('SELECT notes FROM daily_wellness WHERE date >= ? AND date <= ?').all(lwStart, lwEnd)
    .map(r => parseHRV(r.notes)).filter(v => v != null)
  const thisHRVAvg = slAvg(twHRV)
  const lastHRVAvg = slAvg(lwHRV)
  // Require ≥4 valid days in each window — a 5% gap from sparse data is normal variation
  const hrvSignal = twHRV.length >= 4 && lwHRV.length >= 4 && thisHRVAvg != null && lastHRVAvg != null
    && thisHRVAvg < lastHRVAvg * 0.95

  // ── Signal C1: BFP rising week-over-week (Renpho) ────────────────────────
  const twBFP = db.prepare(
    'SELECT body_fat_pct FROM body_composition WHERE date >= ? AND date <= ? AND body_fat_pct IS NOT NULL'
  ).all(weekStartDate, wEnd).map(r => r.body_fat_pct)
  const lwBFP = db.prepare(
    'SELECT body_fat_pct FROM body_composition WHERE date >= ? AND date <= ? AND body_fat_pct IS NOT NULL'
  ).all(lwStart, lwEnd).map(r => r.body_fat_pct)
  const thisBFPAvg = slAvg(twBFP)
  const lastBFPAvg = slAvg(lwBFP)
  // Fire when BFP is not going down (flat or rising) — need ≥3 this week, any last week reading
  const bfpSignal = twBFP.length >= 3 && lastBFPAvg != null
    && thisBFPAvg != null && lastBFPAvg != null
    && thisBFPAvg >= lastBFPAvg

  // ── Signals map ───────────────────────────────────────────────────────────
  const signals = {
    weight_not_losing: weightSignal,
    bfp_not_losing:    !!bfpSignal,
    rising_fatigue:    fatigueSignal,
    hrv_declining:     !!hrvSignal,
  }

  const SIGNAL_DOMAINS = {
    weight_not_losing: 'A',
    bfp_not_losing:    'C',
    rising_fatigue:    'B',
    hrv_declining:     'B',
  }
  const activeSignals = Object.entries(signals).filter(([, v]) => v).map(([k]) => k)
  const activeCount   = activeSignals.length
  const activeDomains = [...new Set(activeSignals.map(s => SIGNAL_DOMAINS[s]))]
  const activeDomainCount = activeDomains.length

  // ── Confidence scoring (4 data streams) ──────────────────────────────────
  const dataStreams = {
    weight: weightConfidence !== 'insufficient',
    bfp:    twBFP.length >= 3,
    hrv:    twHRV.length >= 4,
    rhr:    rhrSeries.length >= 3,
  }
  const availableStreams = Object.values(dataStreams).filter(Boolean).length
  const confidence = availableStreams >= 3 ? 'high' : availableStreams >= 2 ? 'moderate' : 'low'

  // ── Status logic (domain-aware, persistence-gated) ────────────────────────
  let status = 'green'
  let statusReason = ''

  if (signals.weight_not_losing && signals.bfp_not_losing) {
    status = 'red'
    statusReason = 'Neither weight nor BFP is dropping — fat loss has stalled'
  } else if (signals.bfp_not_losing) {
    status = 'yellow'
    statusReason = 'BFP not dropping week-over-week'
  } else if (signals.weight_not_losing) {
    status = 'yellow'
    statusReason = 'Weight not dropping week-over-week'
  } else if (activeCount >= 2) {
    status = 'yellow'
    statusReason = 'Multiple recovery signals — may affect fat loss'
  }

  // ── Phase targets ─────────────────────────────────────────────────────────
  const phaseTargets = {
    base:       { min: 0.5, max: 0.75 },
    build:      { min: 0.25, max: 0.5 },
    peak:       { min: 0, max: 0.1 },
    race_taper: { min: 0, max: 0 },
  }
  const target = phaseTargets[phase] || phaseTargets.base

  // ── Protein compliance (separate from signals) ────────────────────────────
  const protRow = db.prepare(`
    SELECT AVG(daily_p) as avg FROM (
      SELECT date, SUM(protein_g) as daily_p FROM nutrition_logs
      WHERE date >= ? AND date <= ? GROUP BY date
    )
  `).get(weekStartDate, wEnd)
  const proteinAvg = protRow.avg != null ? Math.round(protRow.avg) : null

  const gainingFlag = lossRate != null && lossRate < 0 && ['base', 'build'].includes(phase)

  const STATUS_LABELS = {
    green:  'Fat loss on track',
    yellow: 'Fat loss stalling',
    red:    'Fat loss stalled',
  }
  const ACTIONS = {
    green:  'Weight and BFP trending down — continue as planned.',
    yellow: 'Review weekly nutrition and training load. Check if calories are too high or activity too low.',
    red:    'Both weight and BFP not dropping. Review total weekly calories and training stimulus.',
  }

  return {
    weekStart: weekStartDate,
    status,
    statusLabel:   STATUS_LABELS[status],
    statusReason,
    confidence,
    availableStreams,
    totalStreams: Object.keys(dataStreams).length,
    dataStreams,
    activeSignals,
    activeDomains,
    signals,
    lossRate:      lossRate,
    thisAvgWeight: thisAvgWeight != null ? Math.round(thisAvgWeight * 10) / 10 : null,
    lastAvgWeight: lastAvgWeight != null ? Math.round(lastAvgWeight * 10) / 10 : null,
    phase,
    target,
    gainingFlag,
    proteinAvg,
    proteinTarget: _proteinTarget,
    action:        ACTIONS[status],
    thisBFPAvg:    thisBFPAvg != null ? Math.round(thisBFPAvg * 10) / 10 : null,
    lastBFPAvg:    lastBFPAvg != null ? Math.round(lastBFPAvg * 10) / 10 : null,
    thisHRVAvg:    thisHRVAvg != null ? Math.round(thisHRVAvg) : null,
    lastHRVAvg:    lastHRVAvg != null ? Math.round(lastHRVAvg) : null,
    thisRHRAvg:    thisRHRAvg != null ? Math.round(thisRHRAvg) : null,
    lastRHRAvg:    lastRHRAvg != null ? Math.round(lastRHRAvg) : null,
    dataQuality: {
      weightDays:      twWeights.length,
      weightConfidence,
      bfpDays:         twBFP.length,
      hrvDays:         twHRV.length,
      rhrDays:         rhrSeries.length,
    },
  }
})

// ─── IPC: stoploss:history ────────────────────────────────────────────────
ipcMain.handle('stoploss:history', (event, weeks) => {
  const numWeeks = weeks || 12
  function slDateAdd2(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  // Compute Monday of current week
  const now = new Date()
  const dow = now.getUTCDay()
  const diff = dow === 0 ? -6 : 1 - dow
  now.setUTCDate(now.getUTCDate() + diff)
  const currentMonday = now.toISOString().slice(0, 10)

  const result = []
  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekStart = slDateAdd2(currentMonday, -i * 7)
    const weekEnd   = slDateAdd2(weekStart, 6)
    // Fetch weights for this week and prior week
    function slAvg2(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null }
    const twW   = db.prepare('SELECT body_weight_lb FROM daily_wellness WHERE date >= ? AND date <= ? AND body_weight_lb IS NOT NULL').all(weekStart, weekEnd).map(r=>r.body_weight_lb)
    const lwW   = db.prepare('SELECT body_weight_lb FROM daily_wellness WHERE date >= ? AND date <= ? AND body_weight_lb IS NOT NULL').all(slDateAdd2(weekStart,-7), slDateAdd2(weekStart,-1)).map(r=>r.body_weight_lb)
    const twBFP = db.prepare('SELECT body_fat_pct FROM body_composition WHERE date >= ? AND date <= ? AND body_fat_pct IS NOT NULL').all(weekStart, weekEnd).map(r=>r.body_fat_pct)
    const twA   = slAvg2(twW)
    const lwA   = slAvg2(lwW)
    const change = twA != null && lwA != null ? twA - lwA : null
    const lr     = change != null ? Math.round(-change * 100) / 100 : null
    const avgBFP = twBFP.length ? Math.round(slAvg2(twBFP) * 10) / 10 : null
    const target = { min: 0.5, max: 0.75 }
    let histStatus = null
    if (twA != null && lwA != null && twW.length >= 4 && lwW.length >= 4) {
      histStatus = lr > 1 ? 'yellow' : lr <= 0 ? 'red' : 'green'
    }

    if (twA != null || avgBFP != null) {
      result.push({
        weekStart,
        avgWeight: twA != null ? Math.round(twA*10)/10 : null,
        avgBFP,
        lossRate: lr,
        target,
        status: histStatus,
      })
    }
  }
  return result
})

// ─── IPC: stats:weekly-volume ─────────────────────────────────────────────
ipcMain.handle('stats:weekly-volume', (event, weeks) => {
  const numWeeks = weeks || 8
  const result = []

  const today = new Date()
  // Start from numWeeks ago
  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekStart = new Date(today)
    // Move back to Monday of current week
    const dow = weekStart.getUTCDay()
    const daysToMonday = dow === 0 ? 6 : dow - 1
    weekStart.setUTCDate(weekStart.getUTCDate() - daysToMonday - (i * 7))
    weekStart.setUTCHours(0, 0, 0, 0)

    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6)

    const weekStartStr = weekStart.toISOString().slice(0, 10)
    const weekEndStr = weekEnd.toISOString().slice(0, 10)

    const sessions = db.prepare(`
      SELECT discipline, duration, distance
      FROM logged_sessions
      WHERE date >= ? AND date <= ?
    `).all(weekStartStr, weekEndStr)

    const volume = {
      weekStart: weekStartStr,
      swim: { hours: 0, km: 0, sessions: 0 },
      bike: { hours: 0, km: 0, sessions: 0 },
      run: { hours: 0, mi: 0, sessions: 0 },
    }

    for (const s of sessions) {
      const disc = s.discipline
      if (!volume[disc]) continue
      const hrs = (s.duration || 0) / 60
      const dist = s.distance || 0
      volume[disc].hours += hrs
      volume[disc].sessions += 1
      if (disc === 'run') volume[disc].mi += dist
      else volume[disc].km += dist
    }

    // Round values
    ;['swim', 'bike', 'run'].forEach(d => {
      volume[d].hours = Math.round(volume[d].hours * 10) / 10
      if (d === 'run') volume[d].mi = Math.round(volume[d].mi * 10) / 10
      else volume[d].km = Math.round(volume[d].km * 10) / 10
    })

    result.push(volume)
  }

  return result
})

// ─── IPC: stats:upcoming ──────────────────────────────────────────────────
ipcMain.handle('stats:upcoming', (event, days) => {
  const numDays = days || 7
  const today = new Date().toISOString().slice(0, 10)
  const futureDate = new Date()
  futureDate.setUTCDate(futureDate.getUTCDate() + numDays)
  const futureDateStr = futureDate.toISOString().slice(0, 10)

  const activePlan2 = db.prepare("SELECT id FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1").get()
  return db.prepare(`
    SELECT ps.*, pb.phase, pb.phase_name
    FROM planned_sessions ps
    JOIN plan_blocks pb ON ps.block_id = pb.id
    WHERE ps.plan_id = ? AND ps.date >= ? AND ps.date <= ?
    ORDER BY ps.date, ps.discipline
  `).all(activePlan2 ? activePlan2.id : -1, today, futureDateStr)
})

// ─── IPC: stats:readiness ─────────────────────────────────────────────────
ipcMain.handle('stats:readiness', () => {
  const PLAN_START = new Date('2026-09-14T00:00:00Z')
  const now = new Date()
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const todayStr = todayUTC.toISOString().slice(0, 10)
  const currentWeek = Math.max(1, Math.floor((todayUTC - PLAN_START) / (7 * 24 * 60 * 60 * 1000)) + 1)

  const CHECKPOINTS = [8, 16, 24, 28, 32, 36]
  const isAtCheckpoint = CHECKPOINTS.includes(currentWeek)
  // evalCpWeek: thresholds to evaluate against (next checkpoint, or 36 if past all)
  const evalCpWeek = CHECKPOINTS.find(w => w >= currentWeek) || 36
  const evalCpIdx  = CHECKPOINTS.indexOf(evalCpWeek)
  // gapCpWeek: checkpoint to show gap towards (next future one after evalCp at checkpoints, same at non-checkpoints)
  const gapCpIdx   = isAtCheckpoint ? Math.min(evalCpIdx + 1, CHECKPOINTS.length - 1) : evalCpIdx
  const gapCpWeek  = CHECKPOINTS[gapCpIdx]
  // prevCpWeek: previous checkpoint for trajectory interpolation
  const prevCpWeek = evalCpIdx > 0 ? CHECKPOINTS[evalCpIdx - 1] : 0

  function phaseQuestion(wk) {
    if (wk <= 8)  return 'Am I progressing fast enough to reach Ironman readiness?'
    if (wk <= 16) return 'Am I still on the right trajectory?'
    if (wk <= 24) return 'Am I developing the required durability?'
    if (wk <= 32) return 'Am I demonstrating race-specific capability?'
    if (wk <= 36) return 'Do I have enough evidence to take on LPIM?'
    return 'Am I ready to race?'
  }

  const SWIM_T = [
    { week: 8,  green: 1.0, amber: 0.75 },
    { week: 16, green: 1.5, amber: 1.2  },
    { week: 24, green: 2.0, amber: 1.5  },
    { week: 28, green: 2.5, amber: 2.0  },
    { week: 32, green: 3.0, amber: 2.5  },
    { week: 36, green: 3.8, amber: 3.0  },
  ]
  const BIKE_T = [
    { week: 8,  green: 120, amber: 90  },
    { week: 16, green: 180, amber: 150 },
    { week: 24, green: 240, amber: 180 },
    { week: 28, green: 270, amber: 210 },
    { week: 32, green: 300, amber: 240 },
    { week: 36, green: 330, amber: 270 },
  ]
  const RUN_T = [
    { week: 8,  green: 8,  amber: 6  },
    { week: 16, green: 10, amber: 8  },
    { week: 24, green: 12, amber: 10 },
    { week: 28, green: 14, amber: 12 },
    { week: 32, green: 15, amber: 13 },
    { week: 36, green: 16, amber: 14 },
  ]

  function getT(thresholds, week) {
    return thresholds.find(t => t.week === week) || thresholds[thresholds.length - 1]
  }

  function evalCapacityGate(actual, thresholds) {
    const evalT = getT(thresholds, evalCpWeek)
    const gapT  = getT(thresholds, gapCpWeek)

    if (actual == null) {
      return {
        status: 'nodata', mode: isAtCheckpoint ? 'checkpoint' : 'trajectory',
        actual: null, greenTarget: evalT.green, amberTarget: evalT.amber,
        gapCpWeek, gapTarget: gapT.green, gap: gapT.green,
        trajectoryLabel: null,
      }
    }

    let status, trajectoryLabel = null

    if (isAtCheckpoint || currentWeek > 36) {
      status = actual >= evalT.green ? 'green' : actual >= evalT.amber ? 'amber' : 'red'
    } else {
      const prevT     = prevCpWeek > 0 ? getT(thresholds, prevCpWeek) : null
      const prevGreen = prevT ? prevT.green : 0
      const weeksIn   = currentWeek - prevCpWeek
      const blockLen  = evalCpWeek - prevCpWeek
      const expected  = prevGreen + (evalT.green - prevGreen) * (weeksIn / blockLen)

      if (actual >= evalT.green)   { status = 'green'; trajectoryLabel = 'Ahead of target' }
      else if (actual >= expected) { status = 'green'; trajectoryLabel = 'On trajectory' }
      else if (actual >= prevGreen){ status = 'amber'; trajectoryLabel = 'At risk' }
      else                         { status = 'red';   trajectoryLabel = 'Behind' }
    }

    const gap = Math.max(0, Math.round((gapT.green - actual) * 10) / 10)
    return {
      status, mode: isAtCheckpoint ? 'checkpoint' : 'trajectory',
      actual, greenTarget: evalT.green, amberTarget: evalT.amber,
      gapCpWeek, gapTarget: gapT.green, gap, trajectoryLabel,
    }
  }

  // ── Capacity gates (6-week rolling window) ───────────────────────────────
  const _6wAgo = new Date(todayUTC)
  _6wAgo.setUTCDate(_6wAgo.getUTCDate() - 42)
  const _6wAgoStr = _6wAgo.toISOString().slice(0, 10)

  // Swim: pace = duration / (distance * 10) min/100m — filter > 3.5 (3:30/100m)
  const maxSwim = db.prepare(`
    SELECT MAX(distance) AS val FROM logged_sessions
    WHERE discipline='swim' AND distance > 0 AND duration > 0 AND date >= ?
      AND (CAST(duration AS REAL) / (distance * 10)) <= 3.5
  `).get(_6wAgoStr)
  // Bike: duration-based, no pace filter needed (indoor = no distance)
  const maxBike = db.prepare("SELECT MAX(duration) AS val FROM logged_sessions WHERE discipline='bike' AND duration IS NOT NULL AND date >= ?").get(_6wAgoStr)
  // Run: pace = duration / distance min/mile — filter > 14:00/mile
  const maxRun  = db.prepare(`
    SELECT MAX(distance) AS val FROM logged_sessions
    WHERE discipline='run' AND distance > 0 AND duration > 0 AND date >= ?
      AND (CAST(duration AS REAL) / distance) <= 14.0
  `).get(_6wAgoStr)

  const swimGate = evalCapacityGate(maxSwim?.val ?? null, SWIM_T)
  const bikeGate = evalCapacityGate(maxBike?.val ?? null, BIKE_T)
  const runGate  = evalCapacityGate(maxRun?.val  ?? null, RUN_T)

  // ── Durability gate (adherence-based) ─────────────────────────────────────
  const _28dAgo = new Date(todayUTC)
  _28dAgo.setUTCDate(_28dAgo.getUTCDate() - 28)
  const _28dAgoStr = _28dAgo.toISOString().slice(0, 10)

  const activePlan  = db.prepare("SELECT id FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1").get()
  const activePlanId = activePlan?.id || -1

  const plannedCnt = db.prepare(
    'SELECT COUNT(*) AS cnt FROM planned_sessions WHERE plan_id = ? AND date >= ? AND date <= ?'
  ).get(activePlanId, _28dAgoStr, todayStr)?.cnt || 0

  const loggedCnt = db.prepare(
    'SELECT COUNT(*) AS cnt FROM logged_sessions WHERE date >= ? AND date <= ?'
  ).get(_28dAgoStr, todayStr)?.cnt || 0

  const adherencePct = plannedCnt > 0 ? Math.round((loggedCnt / plannedCnt) * 100) : null

  const durDates = db.prepare(
    'SELECT date FROM logged_sessions WHERE date >= ? AND date <= ? ORDER BY date'
  ).all(_28dAgoStr, todayStr)

  let maxGapDays = 0
  for (let i = 1; i < durDates.length; i++) {
    const gap = Math.round(
      (new Date(durDates[i].date + 'T00:00:00Z') - new Date(durDates[i - 1].date + 'T00:00:00Z'))
      / (1000 * 60 * 60 * 24)
    )
    if (gap > maxGapDays) maxGapDays = gap
  }

  let durabilityGate
  if (plannedCnt === 0 && loggedCnt < 3) {
    durabilityGate = { status: 'nodata', detail: 'Need planned sessions and training logs to evaluate', adherencePct: null, loggedCnt, plannedCnt, maxGapDays: null }
  } else if (plannedCnt === 0) {
    const s = maxGapDays <= 7 ? 'green' : maxGapDays <= 14 ? 'amber' : 'red'
    durabilityGate = { status: s, detail: `${loggedCnt} sessions logged, max gap ${maxGapDays} days (no plan to compare)`, adherencePct: null, loggedCnt, plannedCnt, maxGapDays }
  } else {
    let durStatus, durDetail
    if (adherencePct >= 85 && maxGapDays <= 7) {
      durStatus = 'green'
      durDetail = `${adherencePct}% adherence (${loggedCnt}/${plannedCnt} sessions), max gap ${maxGapDays} days`
    } else if (adherencePct >= 70 && maxGapDays <= 14) {
      durStatus = 'amber'
      durDetail = `${adherencePct}% adherence (${loggedCnt}/${plannedCnt}), max gap ${maxGapDays} days — consistency needs work`
    } else {
      durStatus = 'red'
      const reason = adherencePct < 70 ? `${adherencePct}% adherence` : `${maxGapDays}-day gap`
      durDetail = `${reason} — ${loggedCnt}/${plannedCnt} sessions, max gap ${maxGapDays} days`
    }
    durabilityGate = { status: durStatus, detail: durDetail, adherencePct, loggedCnt, plannedCnt, maxGapDays }
  }

  // ── Race-specific gate (active from week 25) ──────────────────────────────
  let raceSpecificGate
  if (currentWeek < 25) {
    raceSpecificGate = {
      status: 'na', active: false,
      detail: `Active from week 25 — ${25 - currentWeek} week${25 - currentWeek === 1 ? '' : 's'} away`,
      bricksLast4Wks: 0, bricksSinceW25: 0,
    }
  } else {
    // Bricks in last 4 weeks: is_brick flag OR same-day bike+run
    const bricksByFlag = db.prepare(
      'SELECT COUNT(*) AS cnt FROM logged_sessions WHERE date >= ? AND date <= ? AND is_brick = 1'
    ).get(_28dAgoStr, todayStr)?.cnt || 0

    const bricksByDay = db.prepare(`
      SELECT COUNT(DISTINCT b.date) AS cnt
      FROM logged_sessions b
      JOIN logged_sessions r ON b.date = r.date AND b.id != r.id
      WHERE b.discipline = 'bike' AND r.discipline = 'run'
      AND b.date >= ? AND b.date <= ?
    `).get(_28dAgoStr, todayStr)?.cnt || 0

    const bricksLast4 = Math.max(bricksByFlag, bricksByDay)

    // Total bricks since week 25
    const w25Start = new Date(PLAN_START)
    w25Start.setUTCDate(w25Start.getUTCDate() + (25 - 1) * 7)
    const w25StartStr = w25Start.toISOString().slice(0, 10)

    const bricksW25Flag = db.prepare(
      'SELECT COUNT(*) AS cnt FROM logged_sessions WHERE date >= ? AND date <= ? AND is_brick = 1'
    ).get(w25StartStr, todayStr)?.cnt || 0

    const bricksW25Day = db.prepare(`
      SELECT COUNT(DISTINCT b.date) AS cnt
      FROM logged_sessions b
      JOIN logged_sessions r ON b.date = r.date AND b.id != r.id
      WHERE b.discipline = 'bike' AND r.discipline = 'run'
      AND b.date >= ? AND b.date <= ?
    `).get(w25StartStr, todayStr)?.cnt || 0

    const bricksSinceW25 = Math.max(bricksW25Flag, bricksW25Day)

    if (currentWeek >= 37) {
      // Final readiness: capacity maintained + bricks accumulated + no big gap
      const capOk    = [swimGate, bikeGate, runGate].every(g => g.status !== 'red')
      const capGreen = [swimGate, bikeGate, runGate].every(g => g.status === 'green')
      const gapOk    = maxGapDays <= 10
      const bricksOk = bricksSinceW25 >= 4

      let rsStatus, rsDetail
      if (capGreen && gapOk && bricksOk) {
        rsStatus = 'green'
        rsDetail = `${bricksSinceW25} bricks since W25 ✓, capacity maintained, max gap ${maxGapDays} days`
      } else if (capOk && bricksSinceW25 >= 2) {
        const issues = []
        if (!bricksOk) issues.push(`${bricksSinceW25} bricks (need 4+)`)
        if (!gapOk)    issues.push(`${maxGapDays}-day gap`)
        if (!capGreen) issues.push('capacity borderline')
        rsStatus = 'amber'
        rsDetail = issues.length ? issues.join(', ') : `${bricksSinceW25} bricks since W25, taper progressing`
      } else {
        rsStatus = 'red'
        const issues = []
        if (!capOk)               issues.push('capacity deficiency')
        if (bricksSinceW25 < 2)   issues.push(`only ${bricksSinceW25} bricks since W25`)
        if (maxGapDays > 14)       issues.push(`${maxGapDays}-day training gap`)
        rsDetail = issues.join(', ') || 'insufficient race-specific preparation'
      }
      raceSpecificGate = { status: rsStatus, active: true, detail: rsDetail, bricksLast4Wks: bricksLast4, bricksSinceW25 }
    } else {
      // Weeks 25–36: track bricks as race-specific work
      let rsStatus, rsDetail
      if (bricksLast4 >= 2) {
        rsStatus = 'green'
        rsDetail = `${bricksLast4} brick sessions in last 4 weeks ✓`
      } else if (bricksLast4 === 1) {
        rsStatus = 'amber'
        rsDetail = `1 brick in last 4 weeks — build to 2+ per month`
      } else {
        rsStatus = 'red'
        rsDetail = 'No brick sessions in last 4 weeks — add bike+run combinations'
      }
      raceSpecificGate = { status: rsStatus, active: true, detail: rsDetail, bricksLast4Wks: bricksLast4, bricksSinceW25 }
    }
  }

  // ── Weakest-link overall ──────────────────────────────────────────────────
  const gateNames    = ['swim', 'bike', 'run', 'durability', 'race-specific']
  const gateStatuses = [swimGate.status, bikeGate.status, runGate.status, durabilityGate.status]
  if (raceSpecificGate.active) gateStatuses.push(raceSpecificGate.status)

  const failCount      = gateStatuses.filter(s => s === 'red').length
  const borderlineCount = gateStatuses.filter(s => s === 'amber').length
  const nodataCount    = gateStatuses.filter(s => s === 'nodata').length

  let overall, overallReason
  if (failCount > 0) {
    overall = 'red'
    overallReason = gateNames.filter((_, i) => gateStatuses[i] === 'red').join(', ') + ' behind target'
  } else if (borderlineCount >= 2 || (borderlineCount >= 1 && nodataCount >= 1)) {
    overall = 'red'
    overallReason = 'Multiple areas need attention'
  } else if (borderlineCount === 1) {
    overall = 'amber'
    overallReason = gateNames.find((_, i) => gateStatuses[i] === 'amber') + ' is borderline'
  } else if (nodataCount > 0) {
    overall = 'amber'
    overallReason = 'Insufficient data to confirm readiness'
  } else {
    overall = 'green'
    overallReason = 'All gates passing'
  }

  // Apply manual overrides
  const overrides = {}
  db.prepare('SELECT gate, status, note FROM readiness_overrides').all().forEach(r => {
    overrides[r.gate] = { status: r.status, note: r.note }
  })
  const GATE_DISPLAY = { swim: 'swim', bike: 'bike', run: 'run', durability: 'durability', raceSpecific: 'race-specific' }
  const gateMap = { swim: swimGate, bike: bikeGate, run: runGate, durability: durabilityGate, raceSpecific: raceSpecificGate }
  for (const [name, gate] of Object.entries(gateMap)) {
    if (overrides[name]) {
      gate.status = overrides[name].status
      gate.overrideNote = overrides[name].note
      gate.isOverridden = true
    }
  }

  // Recompute overall with overrides applied
  const oStatuses = Object.values(gateMap).map(g => g.status)
  const oFail = oStatuses.filter(s => s === 'red').length
  const oBorderline = oStatuses.filter(s => s === 'amber').length
  const oNodata = oStatuses.filter(s => s === 'nodata').length
  if (oFail > 0) {
    overall = 'red'
    overallReason = Object.keys(gateMap).filter((k, i) => oStatuses[i] === 'red').map(k => GATE_DISPLAY[k]).join(', ') + ' behind target'
  } else if (oBorderline >= 2 || (oBorderline >= 1 && oNodata >= 1)) {
    overall = 'red'
    overallReason = 'Multiple areas need attention'
  } else if (oBorderline === 1) {
    overall = 'amber'
    overallReason = GATE_DISPLAY[Object.keys(gateMap).find((k, i) => oStatuses[i] === 'amber')] + ' is borderline'
  } else if (oNodata > 0) {
    overall = 'amber'
    overallReason = 'Insufficient data to confirm readiness'
  } else {
    overall = 'green'
    overallReason = 'All gates passing'
  }

  return {
    weekNum: currentWeek,
    checkpointWeek: evalCpWeek,
    isAtCheckpoint,
    phaseQuestion: phaseQuestion(currentWeek),
    gates: { swim: swimGate, bike: bikeGate, run: runGate, durability: durabilityGate, raceSpecific: raceSpecificGate },
    overall,
    overallReason,
    overrides,
  }
})


// ─── IPC: readiness:overrides:set / clear ─────────────────────────────────
ipcMain.handle('readiness:overrides:set', (event, gate, status, note) => {
  db.prepare(`
    INSERT INTO readiness_overrides (gate, status, note, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(gate) DO UPDATE SET status=excluded.status, note=excluded.note, updated_at=excluded.updated_at
  `).run(gate, status, note || '', new Date().toISOString().slice(0, 10))
  return { ok: true }
})

ipcMain.handle('readiness:overrides:clear', (event, gate) => {
  db.prepare('DELETE FROM readiness_overrides WHERE gate = ?').run(gate)
  return { ok: true }
})

// ─── IPC: stats:progress ─────────────────────────────────────────────────
ipcMain.handle('stats:progress', () => {
  const longestSwim = db.prepare(`
    SELECT MAX(distance) AS val FROM logged_sessions WHERE discipline='swim' AND distance IS NOT NULL
  `).get()

  const longestBike = db.prepare(`
    SELECT MAX(duration) AS val FROM logged_sessions WHERE discipline='bike' AND duration IS NOT NULL
  `).get()

  const longestRun = db.prepare(`
    SELECT MAX(distance) AS val FROM logged_sessions WHERE discipline='run' AND distance IS NOT NULL
  `).get()

  const activePlan = db.prepare(
    "SELECT * FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1"
  ).get()

  let currentPhase = null
  if (activePlan) {
    const today = new Date().toISOString().slice(0, 10)
    const block = db.prepare(`
      SELECT phase, phase_name FROM plan_blocks
      WHERE plan_id = ? AND start_date <= ? AND end_date >= ?
      LIMIT 1
    `).get(activePlan.id, today, today)
    if (block) currentPhase = block.phase_name || block.phase
  }

  // Completed vs planned for last 4 weeks
  const fourWeeksAgo = new Date()
  fourWeeksAgo.setUTCDate(fourWeeksAgo.getUTCDate() - 28)
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  const plannedCount = db.prepare(`
    SELECT COUNT(*) AS cnt FROM planned_sessions
    WHERE plan_id = ? AND date >= ? AND date <= ?
  `).get(activePlan ? activePlan.id : -1, fourWeeksAgoStr, today)

  const loggedCount = db.prepare(`
    SELECT COUNT(*) AS cnt FROM logged_sessions
    WHERE date >= ? AND date <= ?
  `).get(fourWeeksAgoStr, today)

  return {
    longestSwim: longestSwim ? longestSwim.val : null,
    longestBike: longestBike ? Math.round((longestBike.val || 0) / 60 * 10) / 10 : null,
    longestRun: longestRun ? longestRun.val : null,
    currentPhase,
    completedVsPlanned4wk: {
      completed: loggedCount ? loggedCount.cnt : 0,
      planned: plannedCount ? plannedCount.cnt : 0,
    },
  }
})

// ─── IPC: stats:readiness-score ──────────────────────────────────────────
ipcMain.handle('stats:readiness-score', () => {
  const _now = new Date()
  const _nowUTC = new Date(Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth(), _now.getUTCDate()))
  const today = _nowUTC.toISOString().slice(0, 10)
  const _yd = new Date(_nowUTC); _yd.setUTCDate(_yd.getUTCDate() - 1)
  const yesterday = _yd.toISOString().slice(0, 10)
  const _28d = new Date(_nowUTC); _28d.setUTCDate(_28d.getUTCDate() - 28)
  const lookback28 = _28d.toISOString().slice(0, 10)

  // Parse Body Battery + HRV + RHR from Garmin notes
  function parseNotes(notes) {
    if (!notes) return {}
    const bb = notes.match(/Body Battery:\s*(\d+)/)
    const hrv = notes.match(/HRV:\s*(\d+)/)
    const rhr = notes.match(/RHR:\s*(\d+)/)
    return {
      bodyBattery: bb ? parseInt(bb[1]) : null,
      hrv: hrv ? parseInt(hrv[1]) : null,
      rhr: rhr ? parseInt(rhr[1]) : null,
    }
  }

  // Today's wellness row (sleep logged this morning = last night)
  const todayRow = db.prepare('SELECT * FROM daily_wellness WHERE date = ?').get(today) || {}

  // 28-day historical rows for HRV/RHR baseline
  const histRows = db.prepare('SELECT notes FROM daily_wellness WHERE date >= ? AND date < ? ORDER BY date').all(lookback28, today)

  const garmin = parseNotes(todayRow.notes)

  // Compute 28-day HRV and RHR baselines from historical notes
  const histHRVs = []
  const histRHRs = []
  for (const row of histRows) {
    const parsed = parseNotes(row.notes)
    if (parsed.hrv != null) histHRVs.push(parsed.hrv)
    if (parsed.rhr != null) histRHRs.push(parsed.rhr)
  }
  const hrvBaseline = histHRVs.length >= 7
    ? histHRVs.reduce((a, b) => a + b, 0) / histHRVs.length
    : null
  const rhrBaseline = histRHRs.length >= 7
    ? histRHRs.reduce((a, b) => a + b, 0) / histRHRs.length
    : null

  // Nutrition targets
  const targets = db.prepare('SELECT * FROM nutrition_targets ORDER BY id DESC LIMIT 1').get() || {}
  const CAL_SWEET = targets.calories || 2000
  const CAL_LOW   = CAL_SWEET - 200
  const PROTEIN_TARGET = targets.protein_g || 120

  // Today's logged sessions (training load)
  const todaySessions = db.prepare(
    'SELECT discipline, duration, rpe FROM logged_sessions WHERE date = ?'
  ).all(today)

  // Last 7 days of logged sessions with rpe >= 7
  const _7d = new Date(_now); _7d.setDate(_7d.getDate() - 7)
  const lookback7 = `${_7d.getFullYear()}-${String(_7d.getMonth()+1).padStart(2,'0')}-${String(_7d.getDate()).padStart(2,'0')}`
  const hardSessions7d = db.prepare(
    'SELECT duration, rpe FROM logged_sessions WHERE date >= ? AND date <= ? AND rpe >= 7'
  ).all(lookback7, today)

  // ── SLEEP — 30 pts ────────────────────────────────────────────────────
  const sleepHours = todayRow.sleep_hours != null ? todayRow.sleep_hours : null
  const sleepQuality = todayRow.sleep_quality_1_5 != null ? todayRow.sleep_quality_1_5 : null
  const sleepHasData = sleepHours != null || sleepQuality != null
  const sleepGaps = []

  let durPts, qualPts
  if (sleepHours != null) {
    durPts = Math.min(sleepHours / 8, 1) * 20
  } else {
    durPts = 15  // neutral
    sleepGaps.push('No sleep duration logged — enter last night\'s sleep in Wellness tab')
  }
  if (sleepQuality != null) {
    qualPts = (sleepQuality / 5) * 10
  } else {
    qualPts = 5  // neutral
    if (sleepHasData) sleepGaps.push('No sleep quality logged — rate your sleep quality in Wellness tab')
  }
  const sleepPts = durPts + qualPts

  // Hard overrides
  let sleepOverride = false
  let painOverride = false
  if (sleepHours != null && sleepHours < 5) sleepOverride = true
  if (todayRow.pain_flag === 1) painOverride = true

  // ── RECOVERY — 70 pts (HRV 50 + Body Battery 15 + Training load 5) ───
  const recoveryGaps = []

  // HRV trend (50 pts) — primary recovery signal
  let hrvPts
  if (garmin.hrv != null && hrvBaseline != null) {
    const ratio = garmin.hrv / hrvBaseline
    if (ratio >= 1.05) hrvPts = 50
    else if (ratio >= 0.95) hrvPts = 40
    else if (ratio >= 0.85) hrvPts = 28
    else if (ratio >= 0.75) hrvPts = 14
    else hrvPts = 0
    const pct = Math.round(ratio * 100)
    const arrow = ratio >= 1.05 ? '↑↑' : ratio >= 0.95 ? '→' : ratio >= 0.85 ? '↓' : ratio >= 0.75 ? '↓↓' : '↓↓↓'
    recoveryGaps.push(`HRV ${garmin.hrv}ms ${arrow} (baseline ${Math.round(hrvBaseline)}ms, ${pct}%)`)
  } else if (garmin.hrv != null) {
    hrvPts = 25  // neutral — have today but no baseline yet
    recoveryGaps.push(`HRV ${garmin.hrv}ms — building 7-day baseline`)
  } else {
    hrvPts = 25  // neutral — no data
    recoveryGaps.push('No HRV data — import Garmin sleep CSV in Wellness tab')
  }

  // Body Battery (15 pts) — Garmin composite
  let bbPts
  if (garmin.bodyBattery != null) {
    bbPts = Math.round((garmin.bodyBattery / 100) * 15)
    const bb = garmin.bodyBattery
    if (bb >= 75) recoveryGaps.push(`Body Battery ${bb}/100 ✓`)
    else if (bb >= 50) recoveryGaps.push(`Body Battery ${bb}/100 — moderate`)
    else recoveryGaps.push(`Body Battery ${bb}/100 — low recovery`)
  } else {
    bbPts = 7  // neutral
    recoveryGaps.push('No Body Battery data — import Garmin sleep CSV')
  }

  // RHR — informational only, shown in Garmin pills but not scored
  if (garmin.rhr != null && rhrBaseline != null) {
    const delta = garmin.rhr - rhrBaseline
    recoveryGaps.push(`RHR ${garmin.rhr}bpm (${delta > 0 ? '+' : ''}${Math.round(delta)} vs baseline)`)
  } else if (garmin.rhr != null) {
    recoveryGaps.push(`RHR ${garmin.rhr}bpm`)
  }

  // Training load (5 pts): hard sessions (rpe≥7) in last 7 days
  const hardCount = hardSessions7d.length
  const hardMinutes = hardSessions7d.reduce((s, r) => s + (r.duration || 0), 0)
  let loadPts
  if (hardCount === 0) loadPts = 5
  else if (hardCount === 1 || hardMinutes <= 60) loadPts = 4
  else if (hardCount <= 2 || hardMinutes <= 120) loadPts = 3
  else loadPts = Math.max(0, 5 - hardCount)

  const recoveryPts = Math.round(hrvPts + bbPts + loadPts)

  // Training load note for today
  let loadNote = null
  if (todaySessions.length > 0) {
    const totalMin = todaySessions.reduce((s, r) => s + (r.duration || 0), 0)
    const maxRpe = Math.max(...todaySessions.map(r => r.rpe || 0))
    if (maxRpe >= 7 && totalMin > 30) {
      loadNote = `${totalMin}min of hard training already logged today`
    } else if (totalMin > 0) {
      loadNote = `${totalMin}min logged today`
    }
  }

  // ── TOTAL SCORE + TIER ────────────────────────────────────────────────
  let score = Math.round(sleepPts + recoveryPts)
  score = Math.max(0, Math.min(100, score))

  let tier = score >= 80 ? 'green' : score >= 65 ? 'amber' : 'red'
  if (sleepOverride || painOverride) tier = 'red'

  // ── ADVICE ────────────────────────────────────────────────────────────
  let advice
  if (sleepOverride) {
    advice = `Only ${(sleepHours || 0).toFixed(1)}h sleep — no hard training regardless of other signals. Easy aerobic or rest.`
  } else if (painOverride) {
    advice = 'Pain flag set — no training until assessed. Prioritize recovery.'
  } else if (tier === 'green') {
    advice = 'Recovery is solid — execute today\'s session as planned.'
  } else if (tier === 'amber') {
    advice = 'Moderate readiness — reduce intensity 10–15% on hard efforts, keep aerobic volume.'
  } else {
    advice = 'Low readiness — swap hard sessions for easy aerobic or rest.'
  }

  // ── FUELING STATUS (separate, not part of score) ─────────────────────
  const nutRow = db.prepare(`
    SELECT date, SUM(calories) AS cal, SUM(protein_g) AS protein
    FROM nutrition_logs
    WHERE date IN (?, ?)
    GROUP BY date
    ORDER BY date DESC
    LIMIT 1
  `).get(today, yesterday) || {}
  const nutDate = nutRow.date || null

  let fuelingStatus, fuelingDetails = [], fuelingCal = null, fuelingProtein = null
  if (!nutDate) {
    fuelingStatus = 'unknown'
    fuelingDetails.push('No meals logged — import MFP or add manually in Nutrition tab')
  } else {
    fuelingCal = nutRow.cal || 0
    fuelingProtein = nutRow.protein || 0
    const nutDateLabel = nutDate === yesterday ? 'yesterday' : 'today'
    fuelingDetails.push(`Data from ${nutDateLabel}: ${Math.round(fuelingCal)} kcal, ${Math.round(fuelingProtein)}g protein`)

    let calStatus, proteinStatus
    if (fuelingCal < CAL_LOW) {
      calStatus = 'red'
      fuelingDetails.push(`Calories under-target: ${Math.round(fuelingCal)} kcal (target ${CAL_LOW}–${CAL_SWEET} kcal)`)
    } else if (fuelingCal <= CAL_SWEET) {
      calStatus = 'green'
      fuelingDetails.push(`Calories on target: ${Math.round(fuelingCal)} kcal ✓`)
    } else {
      calStatus = 'amber'
      fuelingDetails.push(`Calories over target: ${Math.round(fuelingCal)} kcal (aim ≤${CAL_SWEET} kcal)`)
    }

    if (fuelingProtein >= PROTEIN_TARGET) {
      proteinStatus = 'green'
      fuelingDetails.push(`Protein on target: ${Math.round(fuelingProtein)}g ✓ (target ${PROTEIN_TARGET}g)`)
    } else if (fuelingProtein >= PROTEIN_TARGET * 0.8) {
      proteinStatus = 'amber'
      fuelingDetails.push(`Protein marginal: ${Math.round(fuelingProtein)}g of ${PROTEIN_TARGET}g target (${Math.round(fuelingProtein / PROTEIN_TARGET * 100)}%)`)
    } else {
      proteinStatus = 'red'
      fuelingDetails.push(`Protein low: ${Math.round(fuelingProtein)}g of ${PROTEIN_TARGET}g target (${Math.round(fuelingProtein / PROTEIN_TARGET * 100)}%)`)
    }

    if (calStatus === 'red' || proteinStatus === 'red') fuelingStatus = 'red'
    else if (calStatus === 'green' && proteinStatus === 'green') fuelingStatus = 'green'
    else fuelingStatus = 'yellow'
  }

  // ── TIPS ──────────────────────────────────────────────────────────────
  const tips = []

  // Sleep tips
  if (!sleepHasData) {
    const gain = Math.round(30 - sleepPts)
    if (gain > 0) tips.push({ text: `Log last night's sleep in the Wellness tab`, gain, where: 'Wellness tab' })
  } else {
    if (sleepHours != null && sleepHours < 8) {
      const gain = Math.round((1 - Math.min(sleepHours / 8, 1)) * 20)
      if (gain > 0) tips.push({ text: `Sleep 8h tonight — last night was ${sleepHours.toFixed(1)}h`, gain, where: null })
    }
    if (sleepQuality != null && sleepQuality < 5) {
      const gain = Math.round(((5 - sleepQuality) / 5) * 10)
      if (gain > 0) tips.push({ text: `Improve sleep quality — currently ${sleepQuality}/5, aim for 5/5`, gain, where: null })
    }
  }

  // Recovery tips
  if (garmin.hrv == null) {
    tips.push({ text: 'Import Garmin sleep CSV to track HRV trend', gain: 25, where: 'Wellness tab' })
  } else if (hrvBaseline == null) {
    tips.push({ text: 'Keep importing Garmin CSV daily to build HRV baseline (need 7+ days)', gain: 10, where: 'Wellness tab' })
  } else {
    const hrvGain = 50 - hrvPts
    if (hrvGain > 0) tips.push({ text: `HRV ${garmin.hrv}ms is ${Math.round((1 - garmin.hrv / hrvBaseline) * 100)}% below baseline — prioritize sleep and recovery`, gain: hrvGain, where: null })
  }
  if (garmin.bodyBattery == null) {
    tips.push({ text: 'Import Garmin sleep CSV to track Body Battery', gain: 7, where: 'Wellness tab' })
  } else {
    const bbGain = 15 - bbPts
    if (bbGain > 0) tips.push({ text: `Body Battery ${garmin.bodyBattery}/100 — sleep more to recover`, gain: bbGain, where: null })
  }

  tips.sort((a, b) => b.gain - a.gain)
  const filteredTips = tips.filter(t => t.gain > 0)

  return {
    score,
    tier,
    advice,
    hasData: sleepHasData || garmin.bodyBattery != null || garmin.hrv != null,
    sleepOverride,
    painOverride,
    garmin,
    hrvBaseline,
    rhrBaseline,
    todaySessionsLogged: todaySessions.length,
    todayLoadNote: loadNote,
    breakdown: {
      sleep: {
        pts: Math.round(sleepPts), max: 30, gaps: sleepGaps,
        durPts: Math.round(durPts), qualPts: Math.round(qualPts),
      },
      recovery: {
        pts: Math.round(recoveryPts), max: 70, gaps: recoveryGaps,
        hrvPts, bbPts, loadPts,
        hrvBaseline: hrvBaseline != null ? Math.round(hrvBaseline) : null,
        rhrBaseline: rhrBaseline != null ? Math.round(rhrBaseline) : null,
      },
    },
    fueling: {
      status: fuelingStatus,
      details: fuelingDetails,
      cal: fuelingCal,
      protein: fuelingProtein,
      calTarget: { low: CAL_LOW, sweet: CAL_SWEET },
      proteinTarget: PROTEIN_TARGET,
    },
    tips: filteredTips,
  }
})

// ─── IPC: import:preview ─────────────────────────────────────────────────
ipcMain.handle('import:preview', (event, filePath, presetName) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const { headers, rows } = parseCSVManual(content)
    const preset = getPresetByName(presetName)

    const mapping = {}
    if (preset) {
      for (const [field, col] of Object.entries(preset.columnMap)) {
        if (headers.includes(col)) {
          mapping[field] = col
        }
      }
    }

    const sample = rows.slice(0, 5)
    let rowsValid = 0
    let rowsInvalid = 0

    for (const row of rows) {
      const hasDate = mapping.date && row[mapping.date]
      const hasDiscipline = mapping.discipline && row[mapping.discipline]
      const hasDuration = mapping.duration && row[mapping.duration]
      if (hasDate && hasDiscipline && hasDuration) rowsValid++
      else rowsInvalid++
    }

    return {
      detected: headers,
      mapping,
      rows_total: rows.length,
      rows_valid: rowsValid,
      rows_invalid: rowsInvalid,
      sample,
    }
  } catch (err) {
    return { error: err.message }
  }
})

// ─── IPC: import:csv ─────────────────────────────────────────────────────
ipcMain.handle('import:csv', (event, filePath, presetName, mappingOverrides) => {
  const preset = getPresetByName(presetName)
  try {
    return runImportPipeline({
      filePath,
      preset,
      mappingOverrides: mappingOverrides || {},
      db,
      dryRun: false,
    })
  } catch (err) {
    return { error: err.message }
  }
})

// ─── IPC: import:sleep ───────────────────────────────────────────────────
ipcMain.handle('import:sleep', (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const entries = parseGarminSleepFile(content)
    if (!entries || entries.length === 0) {
      return { error: 'Could not parse sleep file — expected Garmin Sleep Score format (7-day or 1-day).' }
    }

    const stmt = db.prepare(`
      INSERT INTO daily_wellness (date, sleep_hours, sleep_quality_1_5, notes)
      VALUES (@date, @sleep_hours, @sleep_quality_1_5, @notes)
      ON CONFLICT(date) DO UPDATE SET
        sleep_hours       = excluded.sleep_hours,
        sleep_quality_1_5 = excluded.sleep_quality_1_5,
        notes             = excluded.notes
    `)

    let imported = 0
    db.transaction(() => {
      for (const entry of entries) {
        stmt.run(entry)
        imported++
      }
    })()

    return { imported, skipped_duplicates: 0, skipped_invalid: 0, dates: entries.map(e => e.date) }
  } catch (err) {
    return { error: err.message }
  }
})

// ─── IPC: import:renpho ──────────────────────────────────────────────────
ipcMain.handle('import:renpho', (event, filePath) => {
  try {
    return runRenphoPipeline({ filePath, db, dryRun: false })
  } catch (err) {
    return { error: err.message }
  }
})

// ─── IPC: body-comp:history ──────────────────────────────────────────────
ipcMain.handle('body-comp:history', (event, days = 90) => {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)
  // One row per date — use earliest reading (lowest time) per day
  return db.prepare(`
    SELECT date,
      MIN(time) as time,
      ROUND(AVG(weight_lb), 1)            as weight_lb,
      ROUND(AVG(body_fat_pct), 1)         as body_fat_pct,
      ROUND(AVG(skeletal_muscle_pct), 1)  as skeletal_muscle_pct,
      ROUND(AVG(fat_free_mass_lb), 1)     as fat_free_mass_lb,
      ROUND(AVG(subcutaneous_fat_pct), 1) as subcutaneous_fat_pct,
      ROUND(AVG(visceral_fat), 1)         as visceral_fat,
      ROUND(AVG(body_water_pct), 1)       as body_water_pct,
      ROUND(AVG(muscle_mass_lb), 1)       as muscle_mass_lb,
      ROUND(AVG(bone_mass_lb), 2)         as bone_mass_lb,
      ROUND(AVG(protein_pct), 1)          as protein_pct,
      ROUND(AVG(bmr_kcal), 0)             as bmr_kcal,
      ROUND(AVG(metabolic_age), 0)        as metabolic_age
    FROM body_composition
    WHERE date >= ?
    GROUP BY date
    ORDER BY date DESC
  `).all(sinceStr)
})

// ─── IPC: body-comp:latest ───────────────────────────────────────────────
ipcMain.handle('body-comp:latest', () => {
  return db.prepare(`
    SELECT date, weight_lb, body_fat_pct, skeletal_muscle_pct, fat_free_mass_lb,
           visceral_fat, muscle_mass_lb, bmr_kcal, metabolic_age
    FROM body_composition
    ORDER BY date DESC, time DESC
    LIMIT 1
  `).get() || null
})

// ─── IPC: nutrition:log ───────────────────────────────────────────────────
ipcMain.handle('nutrition:log', (event, entry) => {
  const result = db.prepare(`
    INSERT INTO nutrition_logs
      (date, meal, food_name, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, notes, source)
    VALUES
      (@date, @meal, @food_name, @calories, @protein_g, @carbs_g, @fat_g, @fiber_g, @sugar_g, @sodium_mg, @notes, @source)
  `).run({
    date: entry.date,
    meal: entry.meal || 'other',
    food_name: entry.food_name || '',
    calories: entry.calories != null ? parseFloat(entry.calories) : null,
    protein_g: entry.protein_g != null ? parseFloat(entry.protein_g) : null,
    carbs_g: entry.carbs_g != null ? parseFloat(entry.carbs_g) : null,
    fat_g: entry.fat_g != null ? parseFloat(entry.fat_g) : null,
    fiber_g: entry.fiber_g != null ? parseFloat(entry.fiber_g) : null,
    sugar_g: entry.sugar_g != null ? parseFloat(entry.sugar_g) : null,
    sodium_mg: entry.sodium_mg != null ? parseFloat(entry.sodium_mg) : null,
    notes: entry.notes || '',
    source: entry.source || 'manual',
  })
  return { id: result.lastInsertRowid }
})

// ─── IPC: nutrition:delete ────────────────────────────────────────────────
ipcMain.handle('nutrition:delete', (event, id) => {
  db.prepare('DELETE FROM nutrition_logs WHERE id = ?').run(id)
  return { ok: true }
})

// ─── IPC: nutrition:get-day ───────────────────────────────────────────────
ipcMain.handle('nutrition:get-day', (event, date) => {
  return db.prepare('SELECT * FROM nutrition_logs WHERE date = ? ORDER BY id ASC').all(date)
})

// ─── IPC: nutrition:history ───────────────────────────────────────────────
ipcMain.handle('nutrition:history', (event, { start, end } = {}) => {
  const endDate   = end   || new Date().toISOString().slice(0, 10)
  const startDate = start || (() => { const d = new Date(); d.setDate(d.getDate() - 13); return d.toISOString().slice(0, 10) })()
  return db.prepare(`
    SELECT date,
      ROUND(SUM(calories), 1) AS total_calories,
      ROUND(SUM(protein_g), 1) AS total_protein,
      ROUND(SUM(carbs_g), 1) AS total_carbs,
      ROUND(SUM(fat_g), 1) AS total_fat
    FROM nutrition_logs
    WHERE date >= ? AND date <= ?
    GROUP BY date
    ORDER BY date DESC
  `).all(startDate, endDate)
})

// ─── IPC: nutrition:targets:get ───────────────────────────────────────────
ipcMain.handle('nutrition:targets:get', () => {
  return db.prepare('SELECT * FROM nutrition_targets ORDER BY id DESC LIMIT 1').get() || null
})

// ─── IPC: nutrition:targets:save ──────────────────────────────────────────
ipcMain.handle('nutrition:targets:save', (event, targets) => {
  // Keep one row — delete old and insert new
  db.prepare('DELETE FROM nutrition_targets').run()
  const result = db.prepare(`
    INSERT INTO nutrition_targets (calories, protein_g, carbs_g, fat_g, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(targets.calories || null, targets.protein_g || null, targets.carbs_g || null, targets.fat_g || null, new Date().toISOString())
  return { id: result.lastInsertRowid }
})

// ─── IPC: nutrition:race-plan:get ────────────────────────────────────────
ipcMain.handle('nutrition:race-plan:get', () => {
  return db.prepare('SELECT * FROM race_nutrition_plan ORDER BY id DESC LIMIT 1').get() || null
})

// ─── IPC: nutrition:race-plan:save ───────────────────────────────────────
ipcMain.handle('nutrition:race-plan:save', (event, plan) => {
  db.prepare('DELETE FROM race_nutrition_plan').run()
  const result = db.prepare(`
    INSERT INTO race_nutrition_plan (carbs_per_hour_g, fluids_ml_per_hour, sodium_mg_per_hour, gel_every_min, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    plan.carbs_per_hour_g || 60,
    plan.fluids_ml_per_hour || 500,
    plan.sodium_mg_per_hour || 500,
    plan.gel_every_min || 45,
    plan.notes || '',
    new Date().toISOString()
  )
  return { id: result.lastInsertRowid }
})

// ─── IPC: nutrition:import-mfp ────────────────────────────────────────────
ipcMain.handle('nutrition:import-mfp', (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split(/\r?\n/)
    if (lines.length < 2) return { error: 'File appears empty.' }

    function parseLine(line) {
      const fields = []
      let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') { inQ = !inQ }
        else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = '' }
        else { cur += ch }
      }
      fields.push(cur.trim())
      return fields
    }

    const headers = parseLine(lines[0].replace(/^﻿/, ''))
    const mfpPreset = require('../src/importer/presets/myfitnesspal')
    const colMap = mfpPreset.columnMap
    const skipMeals = mfpPreset.skipMealValues || []

    const idx = {}
    for (const [field, col] of Object.entries(colMap)) {
      const i = headers.indexOf(col)
      if (i !== -1) idx[field] = i
    }

    if (idx.date === undefined || idx.meal === undefined) {
      return { error: `Could not find Date or Meal columns. Found headers: ${headers.slice(0, 6).join(', ')}. Expected a MyFitnessPal Nutrition-Summary CSV.` }
    }

    const stmt = db.prepare(`
      INSERT INTO nutrition_logs
        (date, meal, food_name, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, notes, source, import_batch_id)
      VALUES
        (@date, @meal, @food_name, @calories, @protein_g, @carbs_g, @fat_g, @fiber_g, @sugar_g, @sodium_mg, @notes, @source, @import_batch_id)
    `)

    const batchId = require('crypto').randomUUID()
    let imported = 0, skipped_duplicates = 0, skipped_invalid = 0

    const getVal = (row, field) => {
      if (idx[field] === undefined) return null
      const v = row[idx[field]]
      if (!v || v === '' || v === '--') return null
      const n = parseFloat(v)
      return isNaN(n) ? null : n
    }

    db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const row = parseLine(line)
        const date = idx.date !== undefined ? row[idx.date] : null
        const meal = idx.meal !== undefined ? row[idx.meal] : 'other'
        if (!date || !meal) { skipped_invalid++; continue }
        if (skipMeals.includes(meal)) continue  // totals rows — skip silently

        const existing = db.prepare(
          'SELECT id FROM nutrition_logs WHERE date=? AND meal=? AND source=?'
        ).get(date, meal, 'csv_myfitnesspal')
        if (existing) { skipped_duplicates++; continue }

        stmt.run({
          date,
          meal,
          food_name: '',
          calories: getVal(row, 'calories'),
          protein_g: getVal(row, 'protein_g'),
          carbs_g: getVal(row, 'carbs_g'),
          fat_g: getVal(row, 'fat_g'),
          fiber_g: getVal(row, 'fiber_g'),
          sugar_g: getVal(row, 'sugar_g'),
          sodium_mg: getVal(row, 'sodium_mg'),
          notes: idx.notes !== undefined ? (row[idx.notes] || '') : '',
          source: 'csv_myfitnesspal',
          import_batch_id: batchId,
        })
        imported++
      }
    })()

    return { imported, skipped_duplicates, skipped_invalid, batch_id: batchId }
  } catch (err) {
    return { error: err.message }
  }
})

// ─── IPC: shell:openExternal ──────────────────────────────────────────────
ipcMain.handle('shell:openExternal', (event, url) => {
  shell.openExternal(url)
})

// ─── IPC: dialog:openFile ─────────────────────────────────────────────────
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})
