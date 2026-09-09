'use strict'

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
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

// ─── First-launch plan initialization ─────────────────────────────────────
function initializePlan() {
  const existingPlan = db.prepare(
    "SELECT id FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1"
  ).get()

  if (existingPlan) return

  // Compute next Monday on or after today
  const today = new Date()
  const dow = today.getUTCDay()
  const daysUntilMonday = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow
  const planStartDate = new Date(today)
  planStartDate.setUTCDate(today.getUTCDate() + daysUntilMonday)

  // TODO: Replace with actual athlete DOB once profile is stored
  const athleteBirthDate = new Date('1980-01-15T00:00:00Z')
  const raceDate = new Date('2027-07-25T00:00:00Z')

  try {
    const generated = generatePlan({
      raceDate,
      planStartDate,
      athleteBirthDate,
    })
    savePlan(db, generated)
    console.log('[main] Initial plan generated and saved.')
  } catch (err) {
    console.error('[main] Failed to generate initial plan:', err)
  }
}

// ─── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  db = getDb(dbPath)
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
  const conditions = ['1=1']
  const params = []

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
    const candidates = db.prepare(`
      SELECT * FROM planned_sessions
      WHERE date = ? AND discipline = ?
    `).all(session.date, session.discipline)

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
       pain_flag, pain_notes, motivation_1_5, notes)
    VALUES
      (@date, @sleep_hours, @sleep_quality_1_5, @fatigue_1_5, @soreness_1_5,
       @pain_flag, @pain_notes, @motivation_1_5, @notes)
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
  })
  return { id: result.lastInsertRowid }
})

// ─── IPC: wellness:get ────────────────────────────────────────────────────
ipcMain.handle('wellness:get', (event, date) => {
  return db.prepare('SELECT * FROM daily_wellness WHERE date = ?').get(date) || null
})

// ─── IPC: wellness:history ────────────────────────────────────────────────
ipcMain.handle('wellness:history', (event, days) => {
  return db.prepare(
    'SELECT * FROM daily_wellness ORDER BY date DESC LIMIT ?'
  ).all(days || 14)
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

  return db.prepare(`
    SELECT ps.*, pb.phase, pb.phase_name
    FROM planned_sessions ps
    JOIN plan_blocks pb ON ps.block_id = pb.id
    WHERE ps.date >= ? AND ps.date <= ?
    ORDER BY ps.date, ps.discipline
  `).all(today, futureDateStr)
})

// ─── IPC: stats:readiness ─────────────────────────────────────────────────
ipcMain.handle('stats:readiness', () => {
  const today = new Date()
  const futureDate = new Date()
  futureDate.setUTCDate(today.getUTCDate() + 7)
  const futureDateStr = futureDate.toISOString().slice(0, 10)

  return db.prepare(`
    SELECT * FROM readiness_gates
    WHERE date <= ?
    ORDER BY date ASC
  `).all(futureDateStr)
})

// ─── IPC: stats:readiness:update ─────────────────────────────────────────
ipcMain.handle('stats:readiness:update', (event, id, data) => {
  const result = db.prepare(`
    UPDATE readiness_gates
    SET actual_value = ?, status = ?, notes = ?
    WHERE id = ?
  `).run(data.actual_value || null, data.status || 'pending', data.notes || '', id)
  return { changes: result.changes }
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
    WHERE date >= ? AND date <= ?
  `).get(fourWeeksAgoStr, today)

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
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  // Sleep = YESTERDAY's entry (last night's sleep logged this morning)
  const sleepRow = db.prepare('SELECT * FROM daily_wellness WHERE date = ?').get(yesterday) || {}
  // Fatigue/soreness = TODAY's morning check-in
  const wellnessRow = db.prepare('SELECT * FROM daily_wellness WHERE date = ?').get(today) || {}
  // Nutrition = most recent day with data (yesterday preferred; fall back to today)
  const targets = db.prepare('SELECT * FROM nutrition_targets ORDER BY id DESC LIMIT 1').get() || {}
  // Ironman training defaults — override in Nutrition → Targets
  const CAL_TARGET = targets.calories || 2800
  const PROTEIN_TARGET = targets.protein_g || 140
  const nutRow = db.prepare(`
    SELECT date, SUM(calories) AS cal, SUM(protein_g) AS protein
    FROM nutrition_logs
    WHERE date IN (?, ?)
    GROUP BY date
    ORDER BY date DESC
    LIMIT 1
  `).get(today, yesterday) || {}
  const nutDate = nutRow.date || null
  // Today's logged sessions (training load context) — rpe only, no zone col in logged_sessions
  const todaySessions = db.prepare(
    'SELECT discipline, duration, rpe FROM logged_sessions WHERE date = ?'
  ).all(today)

  // ── Sleep component — 40 pts (yesterday's data) ───────────────────────
  const sleepHasData = sleepRow.sleep_hours != null || sleepRow.sleep_quality_1_5 != null
  let sleepPts = 20  // neutral when no data
  const sleepGaps = []

  if (!sleepHasData) {
    sleepGaps.push(`No sleep logged for ${yesterday} — enter last night's sleep in Wellness tab`)
  } else {
    const hours = sleepRow.sleep_hours || 0
    const quality = sleepRow.sleep_quality_1_5 || 3
    sleepPts = Math.min(hours / 8, 1) * 20 + (quality / 5) * 20
    if (hours < 8) sleepGaps.push(`${hours.toFixed(1)}h slept last night — target is 8h`)
    if (quality < 5) sleepGaps.push(`Sleep quality ${quality}/5 — aim for 5/5`)
  }

  // ── Wellness component — 40 pts (today's fatigue + soreness) ─────────
  // Apply training load penalty if hard sessions already logged today
  const wellnessHasData = wellnessRow.fatigue_1_5 != null || wellnessRow.soreness_1_5 != null
  let wellnessPts = 20  // neutral when no data
  const wellnessGaps = []

  if (!wellnessHasData) {
    wellnessGaps.push('No fatigue/soreness logged today — enter morning check-in in Wellness tab')
  } else {
    const fat = wellnessRow.fatigue_1_5 || 3
    const sor = wellnessRow.soreness_1_5 || 3
    wellnessPts = ((6 - fat) / 4) * 20 + ((6 - sor) / 4) * 20
    if (fat > 1) wellnessGaps.push(`Fatigue ${fat}/5 — aim for 1/5 (rest or easy session)`)
    if (sor > 1) wellnessGaps.push(`Soreness ${sor}/5 — aim for 1/5 (stretch, foam roll)`)
  }

  // Training load modifier: high-intensity sessions already done today reduce wellness pts
  let loadPenalty = 0
  let loadNote = null
  if (todaySessions.length > 0) {
    const totalMin = todaySessions.reduce((s, r) => s + (r.duration || 0), 0)
    const maxRpe = Math.max(...todaySessions.map(r => r.rpe || 0))
    const isHard = maxRpe >= 7
    if (isHard && totalMin > 30) {
      loadPenalty = Math.min(Math.round(totalMin / 10), 10)
      loadNote = `${totalMin}min of hard training already logged today (−${loadPenalty}pts)`
    } else if (totalMin > 0) {
      loadNote = `${totalMin}min logged today`
    }
  }
  if (loadPenalty > 0) wellnessGaps.push(loadNote)
  wellnessPts = Math.max(0, wellnessPts - loadPenalty)

  // ── Nutrition component — 20 pts (10 calories + 10 protein) ─────────
  // Uses most recent logged date (yesterday or today)
  let nutritionPts = 10  // neutral when no data
  const nutritionGaps = []
  const nutDateLabel = nutDate === yesterday ? 'yesterday' : nutDate === today ? 'today' : null

  let calPts = 0, proteinPts = 0
  if (!nutDate) {
    nutritionGaps.push('No meals logged — import MFP or add manually in Nutrition tab')
  } else {
    const cal = nutRow.cal || 0
    const protein = nutRow.protein || 0

    // Calories: 10 pts, target ≥ CAL_TARGET
    calPts = Math.min(cal / CAL_TARGET, 1) * 10
    nutritionGaps.push(
      cal >= CAL_TARGET
        ? `Calories: ${Math.round(cal)} kcal ✓ (target ${CAL_TARGET} kcal)`
        : `Calories: ${Math.round(cal)} kcal — ${Math.round(CAL_TARGET - cal)} short of ${CAL_TARGET} kcal target (${Math.round(cal / CAL_TARGET * 100)}%)`
    )

    // Protein: 10 pts, target ≥ PROTEIN_TARGET
    proteinPts = Math.min(protein / PROTEIN_TARGET, 1) * 10
    nutritionGaps.push(
      protein >= PROTEIN_TARGET
        ? `Protein: ${Math.round(protein)}g ✓ (target ${PROTEIN_TARGET}g)`
        : `Protein: ${Math.round(protein)}g — ${Math.round(PROTEIN_TARGET - protein)}g short of ${PROTEIN_TARGET}g target (${Math.round(protein / PROTEIN_TARGET * 100)}%)`
    )

    nutritionPts = calPts + proteinPts
  }

  const score = Math.round(sleepPts + wellnessPts + nutritionPts)
  const tier = score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red'

  // ── Advice ────────────────────────────────────────────────────────────
  const primaryIssues = [
    wellnessGaps.find(g => g.includes('Fatigue')),
    sleepGaps.find(g => g.includes('slept')),
    nutritionGaps.find(g => g.includes('kcal') || g.includes('protein')),
  ].filter(Boolean)

  let advice
  if (tier === 'green') {
    advice = 'Recovery is solid — execute today\'s session as planned.'
  } else if (tier === 'amber') {
    const reason = primaryIssues[0] ? primaryIssues[0].split(' — ')[0] : 'Moderate fatigue'
    advice = `${reason} — reduce intensity by 10–15% on hard efforts.`
  } else {
    advice = 'Body needs recovery — consider swapping today\'s session for easy aerobic or rest.'
  }

  // ── Tips ordered by pts gain ──────────────────────────────────────────
  const tips = []

  const sleepGain = 40 - Math.round(sleepPts)
  if (sleepGain > 0) {
    if (!sleepHasData) {
      tips.push({ text: `Log last night's sleep (${yesterday}) in the Wellness tab`, gain: sleepGain, where: 'Wellness tab' })
    } else {
      const hours = sleepRow.sleep_hours || 0
      const quality = sleepRow.sleep_quality_1_5 || 3
      if (hours < 8) {
        const g = Math.round((1 - Math.min(hours / 8, 1)) * 20)
        if (g > 0) tips.push({ text: `Sleep 8h tonight — last night was ${hours.toFixed(1)}h`, gain: g, where: null })
      }
      if (quality < 5) {
        const g = Math.round(((5 - quality) / 5) * 20)
        if (g > 0) tips.push({ text: `Improve sleep quality — currently ${quality}/5, aim for 5/5`, gain: g, where: null })
      }
    }
  }

  const wellnessGain = 40 - Math.round(wellnessPts) + loadPenalty
  if (wellnessGain > 0) {
    if (!wellnessHasData) {
      tips.push({ text: 'Log today\'s fatigue & soreness in the Wellness tab', gain: wellnessGain, where: 'Wellness tab' })
    } else {
      const fat = wellnessRow.fatigue_1_5 || 3
      const sor = wellnessRow.soreness_1_5 || 3
      if (fat > 1) {
        const g = Math.round(((fat - 1) / 4) * 20)
        tips.push({ text: `Reduce fatigue to 1/5 via rest or easy aerobic (currently ${fat}/5)`, gain: g, where: null })
      }
      if (sor > 1) {
        const g = Math.round(((sor - 1) / 4) * 20)
        tips.push({ text: `Reduce soreness to 1/5 via stretching/foam rolling (currently ${sor}/5)`, gain: g, where: null })
      }
    }
  }

  const nutritionGain = 20 - Math.round(nutritionPts)
  if (nutritionGain > 0) {
    if (!nutDate) {
      tips.push({ text: 'Log meals in the Nutrition tab or import MFP', gain: nutritionGain, where: 'Nutrition tab' })
    } else {
      const cal = nutRow.cal || 0
      const protein = nutRow.protein || 0
      if (cal < CAL_TARGET) {
        const g = Math.round((1 - Math.min(cal / CAL_TARGET, 1)) * 10)
        if (g > 0) tips.push({ text: `Eat ${Math.round(CAL_TARGET - cal)} more kcal today (${Math.round(cal)} of ${CAL_TARGET} target)`, gain: g, where: null })
      }
      if (protein < PROTEIN_TARGET) {
        const g = Math.round((1 - Math.min(protein / PROTEIN_TARGET, 1)) * 10)
        if (g > 0) tips.push({ text: `Add ${Math.round(PROTEIN_TARGET - protein)}g more protein today (${Math.round(protein)}g of ${PROTEIN_TARGET}g target)`, gain: g, where: null })
      }
    }
  }

  tips.sort((a, b) => b.gain - a.gain)

  return {
    score,
    tier,
    advice,
    hasData: sleepHasData || wellnessHasData || !!nutDate,
    todaySessionsLogged: todaySessions.length,
    todayLoadNote: loadNote,
    breakdown: {
      sleep:     { pts: Math.round(sleepPts),     max: 40, gaps: sleepGaps },
      wellness:  { pts: Math.round(wellnessPts),  max: 40, gaps: wellnessGaps },
      nutrition: {
        pts: Math.round(nutritionPts), max: 20, gaps: nutritionGaps,
        calPts: Math.round(calPts), proteinPts: Math.round(proteinPts),
        calTarget: CAL_TARGET, proteinTarget: PROTEIN_TARGET,
        nutDate, nutDateLabel,
      },
    },
    tips,
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
      INSERT OR REPLACE INTO daily_wellness
        (date, sleep_hours, sleep_quality_1_5, fatigue_1_5, soreness_1_5,
         pain_flag, pain_notes, motivation_1_5, notes)
      VALUES
        (@date, @sleep_hours, @sleep_quality_1_5, @fatigue_1_5, @soreness_1_5,
         @pain_flag, @pain_notes, @motivation_1_5, @notes)
    `)

    let imported = 0
    db.transaction(() => {
      for (const entry of entries) {
        stmt.run(entry)
        imported++
      }
    })()

    return { imported, dates: entries.map(e => e.date) }
  } catch (err) {
    return { error: err.message }
  }
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
ipcMain.handle('nutrition:history', (event, days) => {
  const n = days || 14
  return db.prepare(`
    SELECT date,
      ROUND(SUM(calories), 1) AS total_calories,
      ROUND(SUM(protein_g), 1) AS total_protein,
      ROUND(SUM(carbs_g), 1) AS total_carbs,
      ROUND(SUM(fat_g), 1) AS total_fat
    FROM nutrition_logs
    GROUP BY date
    ORDER BY date DESC
    LIMIT ?
  `).all(n)
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
      return { error: 'Could not find Date or Meal columns. Is this a MyFitnessPal Nutrition-Summary CSV?' }
    }

    const stmt = db.prepare(`
      INSERT INTO nutrition_logs
        (date, meal, food_name, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, notes, source, import_batch_id)
      VALUES
        (@date, @meal, @food_name, @calories, @protein_g, @carbs_g, @fat_g, @fiber_g, @sugar_g, @sodium_mg, @notes, @source, @import_batch_id)
    `)

    const batchId = require('crypto').randomUUID()
    let imported = 0, skipped = 0

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
        if (!date || !meal) { skipped++; continue }
        if (skipMeals.includes(meal)) { skipped++; continue }

        // Dedup: skip if same date+meal already exists in this batch
        const existing = db.prepare(
          'SELECT id FROM nutrition_logs WHERE date=? AND meal=? AND source=?'
        ).get(date, meal, 'csv_myfitnesspal')
        if (existing) { skipped++; continue }

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

    return { imported, skipped, batch_id: batchId }
  } catch (err) {
    return { error: err.message }
  }
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
