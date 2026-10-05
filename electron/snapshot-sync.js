'use strict'

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const RCLONE = '/opt/homebrew/bin/rclone'
const DRIVE_FOLDER = 'drive: Claude-Ironman Training'
const STATE_PATH = path.join(__dirname, '../data/sync-state.json')

const FILES = {
  snapshot:    'IM_LP2027_Progress_Snapshot.md',
  currentPlan: 'IM_LP2027_Current_Plan.md',
  buildSpec:   'IM_LP2027_Plan_Build_Spec.md',
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch { return {} }
}

function saveState(state) {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8') } catch (_) {}
}

function rcloneCopyto(localPath, remoteName) {
  execSync(
    `${RCLONE} copyto --drive-import-formats "" "${localPath}" "${DRIVE_FOLDER}/${remoteName}"`,
    { timeout: 60000, stdio: 'pipe' }
  )
}

function rcloneLsjson() {
  try {
    const out = execSync(`${RCLONE} lsjson "${DRIVE_FOLDER}" --no-modtime=false`, { timeout: 20000, stdio: 'pipe' }).toString()
    return JSON.parse(out)
  } catch { return [] }
}

// Extract weekly planned-minutes totals from snapshot markdown
// Looks for the Weekly Scores table and sums A/P swim+bike+run planned columns
function extractSnapshotWeeklyPlanned(snapMd) {
  const result = {}
  const lines = snapMd.split('\n')
  let inTable = false
  for (const line of lines) {
    if (line.includes('Weekly Scores')) { inTable = true; continue }
    if (!inTable) continue
    if (line.startsWith('|---|')) continue
    if (!line.startsWith('|')) { inTable = false; continue }
    // | Wk | Dates | Score | Grade | Planned h | Actual h | Swim A/P min | Bike A/P min | Run A/P min | ...
    const cells = line.split('|').map(s => s.trim()).filter(Boolean)
    if (cells.length < 9) continue
    const wk = parseInt(cells[0])
    if (isNaN(wk)) continue
    // Planned h is cells[4], multiply by 60 to get min
    const ph = parseFloat(cells[4])
    if (!isNaN(ph)) result[wk] = Math.round(ph * 60)
  }
  return result
}

// Extract weekly planned-minutes totals from plan doc markdown
// Looks for the Weekly Summary table
function extractPlanDocWeeklyPlanned(planMd) {
  const result = {}
  const lines = planMd.split('\n')
  let inTable = false
  for (const line of lines) {
    if (line.includes('Weekly Summary')) { inTable = true; continue }
    if (!inTable) continue
    if (line.startsWith('|---|')) continue
    if (!line.startsWith('|')) { inTable = false; continue }
    // | Wk | Phase | Mon Date | Swim min | Bike min | Run min | Str min | Total min | Total h |
    const cells = line.split('|').map(s => s.trim()).filter(Boolean)
    if (cells.length < 8) continue
    const wk = parseInt(cells[0])
    if (isNaN(wk)) continue
    const total = parseInt(cells[7])
    if (!isNaN(total)) result[wk] = total
  }
  return result
}

function checkRegression(db, state) {
  // Read current DB stats to guard against syncing a stale/wrong DB
  const activePlan = db.prepare("SELECT id FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1").get()
  const currentPlanId = activePlan?.id ?? 0
  const maxSession = db.prepare('SELECT MAX(date) as d FROM logged_sessions').get()?.d ?? ''
  const maxWellness = db.prepare('SELECT MAX(date) as d FROM daily_wellness').get()?.d ?? ''

  const prevPlanId   = state.regression?.planId ?? 0
  const prevSession  = state.regression?.maxSession ?? ''
  const prevWellness = state.regression?.maxWellness ?? ''

  const reasons = []
  if (prevPlanId > 0 && currentPlanId < prevPlanId)
    reasons.push(`active plan_id regressed: ${prevPlanId} → ${currentPlanId}`)
  if (prevSession && maxSession < prevSession)
    reasons.push(`newest session regressed: ${prevSession} → ${maxSession}`)
  if (prevWellness && maxWellness < prevWellness)
    reasons.push(`newest wellness regressed: ${prevWellness} → ${maxWellness}`)

  return { ok: reasons.length === 0, reasons, currentPlanId, maxSession, maxWellness }
}

function runSync(db) {
  // Clear cached copies of generator modules so file edits are picked up without
  // requiring a full main-process restart (a renderer reload is sufficient).
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/src/exporter/') || key.includes('/src/core/')) {
      delete require.cache[key]
    }
  }
  const { generateSnapshot } = require('../src/exporter/snapshot-generator')
  const { generatePlanDoc } = require('../src/exporter/plan-doc-generator')
  const { generateBuildSpec } = require('../src/exporter/build-spec-generator')

  const errors = []
  const state = loadState()
  const now = new Date().toISOString()

  // Regression guard: abort if DB looks older than last known good sync
  const rg = checkRegression(db, state)
  if (!rg.ok) {
    const msg = `Sync blocked: data regression — ${rg.reasons.join('; ')}`
    return { ok: false, blocked: true, errors: [msg], generatedAt: now }
  }

  let snapshotMd, planDocMd, buildSpecMd

  try { snapshotMd  = generateSnapshot(db)  } catch (e) { errors.push(`snapshot generation: ${e.message}`); snapshotMd  = `# ERROR\n${e.message}` }
  try { planDocMd   = generatePlanDoc(db)    } catch (e) { errors.push(`plan doc generation: ${e.message}`); planDocMd   = `# ERROR\n${e.message}` }
  try { buildSpecMd = generateBuildSpec()    } catch (e) { errors.push(`build spec generation: ${e.message}`); buildSpecMd = `# ERROR\n${e.message}` }

  // Consistency check
  if (snapshotMd && planDocMd && !snapshotMd.startsWith('# ERROR') && !planDocMd.startsWith('# ERROR')) {
    try {
      const snapWeekly = extractSnapshotWeeklyPlanned(snapshotMd)
      const planWeekly = extractPlanDocWeeklyPlanned(planDocMd)
      const mismatchWeeks = []
      for (const [wk, planMin] of Object.entries(planWeekly)) {
        const snapMin = snapWeekly[parseInt(wk)]
        if (snapMin !== undefined && Math.abs(snapMin - planMin) > 5) {
          mismatchWeeks.push(`Wk${wk}: snapshot=${snapMin} min, plan=${planMin} min`)
        }
      }
      if (mismatchWeeks.length > 0) {
        snapshotMd = `⚠ PLAN MISMATCH — weeks differ: ${mismatchWeeks.join('; ')}\n\n` + snapshotMd
      }
    } catch (_) {}
  }

  // Write to /tmp and upload
  const uploads = [
    { key: 'snapshot',    tmpPath: '/tmp/IM_LP2027_Progress_Snapshot.md',  content: snapshotMd,  name: FILES.snapshot },
    { key: 'currentPlan', tmpPath: '/tmp/IM_LP2027_Current_Plan.md',        content: planDocMd,   name: FILES.currentPlan },
    { key: 'buildSpec',   tmpPath: '/tmp/IM_LP2027_Plan_Build_Spec.md',     content: buildSpecMd, name: FILES.buildSpec },
  ]

  for (const u of uploads) {
    try {
      fs.writeFileSync(u.tmpPath, u.content, 'utf8')
      rcloneCopyto(u.tmpPath, u.name)
    } catch (e) {
      errors.push(`${u.key} upload: ${e.message}`)
    }
  }

  // Fetch file IDs via rclone lsjson
  try {
    const listing = rcloneLsjson()
    for (const u of uploads) {
      const entry = listing.find(f => f.Name === u.name || f.Path === u.name)
      if (entry) {
        state[u.key] = state[u.key] || {}
        state[u.key].fileId      = entry.ID || null
        state[u.key].modifiedTime = entry.ModTime || now
        state[u.key].lastSynced  = now
        state[u.key].rclonePath  = `${DRIVE_FOLDER}/${u.name}`
        state[u.key].owner       = 'dinu08@gmail.com'
      }
    }
  } catch (_) {}

  state.lastSyncError = errors.length > 0 ? errors.join(' | ') : null
  state.lastSyncedAt  = now
  // Update regression baseline so future syncs can guard against going backwards
  state.regression = {
    planId:      rg.currentPlanId,
    maxSession:  rg.maxSession,
    maxWellness: rg.maxWellness,
  }
  saveState(state)

  return {
    ok: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    files: {
      snapshot:    state.snapshot    || {},
      currentPlan: state.currentPlan || {},
      buildSpec:   state.buildSpec   || {},
    },
    generatedAt: now,
  }
}

module.exports = { runSync }
