'use strict'

// Acceptance tests for CN-17 #1 (AT1, AT2, AT8, AT9)
// Runs against an in-memory SQLite DB with fixture files.

const Database = require('better-sqlite3')
const path = require('path')
const { importKeiserTcx, findBest20Window, parseKeiserTcx, readGarminBikeHr } = require('../src/importer/keiser-tcx')

const FIXTURE_DIR = path.join(__dirname, '../test/fixtures')

let passed = 0, failed = 0

function expect(label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  PASS  ${label}`)
    passed++
  } else {
    console.error(`  FAIL  ${label}`)
    console.error(`        Expected: ${JSON.stringify(expected)}`)
    console.error(`        Actual:   ${JSON.stringify(actual)}`)
    failed++
  }
}

function expectApprox(label, actual, expected, tol = 1) {
  if (actual != null && Math.abs(actual - expected) <= tol) {
    console.log(`  PASS  ${label} (${actual} ≈ ${expected})`)
    passed++
  } else {
    console.error(`  FAIL  ${label}`)
    console.error(`        Expected: ~${expected} (tol=${tol}), Actual: ${actual}`)
    failed++
  }
}

// ─── Setup: in-memory DB with required schema ─────────────────────────────────

function makeDb() {
  const db = new Database(':memory:')

  db.prepare(`CREATE TABLE planned_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER, discipline TEXT, date TEXT, type TEXT, target_duration INTEGER,
    importance TEXT, target_intensity_zone TEXT, phase TEXT, notes TEXT, target_distance_m INTEGER
  )`).run()

  db.prepare(`CREATE TABLE logged_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    planned_session_id INTEGER, discipline TEXT, date TEXT, start_datetime TEXT, end_datetime TEXT,
    duration REAL, distance REAL, avg_hr REAL, hr_zone_json TEXT, rpe REAL, notes TEXT,
    is_brick INTEGER, brick_pair_id INTEGER, avg_power REAL, normalized_power REAL, max_power REAL,
    avg_cadence REAL, environment TEXT, wetsuit_used INTEGER, pool_length_m REAL, source TEXT,
    import_batch_id TEXT, reason TEXT, swap_planned_id INTEGER, swap_planned_discipline TEXT,
    moving_min REAL, timer_min REAL, elapsed_min REAL,
    avg_power_w REAL, best20_power_w REAL, best20_hr_bpm REAL, best20_start_utc TEXT, power_source TEXT
  )`).run()

  db.prepare(`CREATE TABLE bike_streams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    logged_session_id INTEGER NOT NULL,
    t_utc TEXT NOT NULL,
    power_w REAL, cadence_rpm REAL, hr_bpm REAL,
    power_source TEXT NOT NULL DEFAULT 'keiser',
    hr_source TEXT
  )`).run()

  db.prepare(`CREATE TABLE athlete_benchmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'test', notes TEXT NOT NULL DEFAULT '',
    UNIQUE(metric, date)
  )`).run()

  return db
}

// ─── AT1: 55-min fixture (no Garmin laps) ────────────────────────────────────
console.log('\n── AT1: keiser_ftp.tcx + garmin_ftp.fit (no laps) ──')
{
  const db = makeDb()
  // Insert planned ftp_test
  const planRow = db.prepare("INSERT INTO planned_sessions (plan_id, discipline, date, type, target_duration, importance) VALUES (10,'bike','2026-10-18','ftp_test',100,'key')").run()
  // Insert logged bike session (simulates Garmin import)
  const logRow = db.prepare("INSERT INTO logged_sessions (planned_session_id, discipline, date, moving_min, notes, source) VALUES (?,?,?,?,?,?)").run(planRow.lastInsertRowid, 'bike', '2026-10-18', 0, 'dur-fallback', 'garmin')

  const result = importKeiserTcx(
    path.join(FIXTURE_DIR, 'keiser_ftp.tcx'),
    FIXTURE_DIR,   // garmin FIT files are in fixtures dir
    db
  )

  const session = db.prepare('SELECT * FROM logged_sessions WHERE id=?').get(result.sessionId)
  const bm = metric => db.prepare("SELECT value FROM athlete_benchmarks WHERE metric=? ORDER BY id DESC LIMIT 1").get(metric)?.value

  expectApprox('AT1: best20_power_w = 240', session?.best20_power_w, 240)
  expectApprox('AT1: best20_hr_bpm = 165',  session?.best20_hr_bpm, 165)

  const power20 = bm('bike_power20_w')
  const hr20    = bm('bike_hr20_bpm')
  const ftp     = power20 != null ? Math.floor(power20 * 0.95 + 0.5) : null
  const lthr    = hr20 != null    ? Math.floor(hr20 * 0.95 + 0.5)    : null

  expectApprox('AT1: FTP = 228', ftp, 228)
  expectApprox('AT1: LTHR = 157', lthr, 157)

  const streamCount = db.prepare('SELECT COUNT(*) as cnt FROM bike_streams WHERE logged_session_id=?').get(result.sessionId)?.cnt
  expect('AT1: bike_streams rows inserted (>0)', streamCount > 0, true)

  // Note should NOT contain dur-fallback
  expect('AT1: note does not contain dur-fallback', session?.notes?.includes('dur-fallback'), false)
  // Note should contain moving: keiser
  expect('AT1: note contains moving: keiser', session?.notes?.includes('moving: keiser'), true)

  db.close()
}

// ─── AT2: lap wins over higher rolling window ────────────────────────────────
console.log('\n── AT2: keiser_at2.tcx + garmin_ftp_lap.fit (lap at 230W vs rolling 250W) ──')
{
  const db = makeDb()
  const planRow = db.prepare("INSERT INTO planned_sessions (plan_id, discipline, date, type, target_duration, importance) VALUES (10,'bike','2026-10-18','ftp_test',100,'key')").run()
  const logRow = db.prepare("INSERT INTO logged_sessions (planned_session_id, discipline, date, moving_min, notes, source) VALUES (?,?,?,?,?,?)").run(planRow.lastInsertRowid, 'bike', '2026-10-18', 0, '', 'garmin')

  const result = importKeiserTcx(
    path.join(FIXTURE_DIR, 'keiser_at2.tcx'),
    FIXTURE_DIR,
    db
  )

  const session = db.prepare('SELECT * FROM logged_sessions WHERE id=?').get(result.sessionId)
  const power20 = db.prepare("SELECT value FROM athlete_benchmarks WHERE metric='bike_power20_w' ORDER BY id DESC LIMIT 1").get()?.value

  expectApprox('AT2: FTP power source = lap (P=230)', power20, 230)
  expectApprox('AT2: best20_power_w = 230', session?.best20_power_w, 230)

  db.close()
}

// ─── AT8: idempotency ────────────────────────────────────────────────────────
console.log('\n── AT8: Idempotency — re-import same TCX unchanged ──')
{
  const db = makeDb()
  const planRow = db.prepare("INSERT INTO planned_sessions (plan_id, discipline, date, type, target_duration, importance) VALUES (10,'bike','2026-10-18','ftp_test',100,'key')").run()
  db.prepare("INSERT INTO logged_sessions (planned_session_id, discipline, date, moving_min, notes, source) VALUES (?,?,?,?,?,?)").run(planRow.lastInsertRowid, 'bike', '2026-10-18', 0, '', 'garmin')

  importKeiserTcx(path.join(FIXTURE_DIR, 'keiser_ftp.tcx'), FIXTURE_DIR, db)
  const countBefore = db.prepare('SELECT COUNT(*) as cnt FROM bike_streams').get().cnt
  const bmCountBefore = db.prepare('SELECT COUNT(*) as cnt FROM athlete_benchmarks').get().cnt

  // Second import
  importKeiserTcx(path.join(FIXTURE_DIR, 'keiser_ftp.tcx'), FIXTURE_DIR, db)
  const countAfter = db.prepare('SELECT COUNT(*) as cnt FROM bike_streams').get().cnt
  const bmCountAfter = db.prepare('SELECT COUNT(*) as cnt FROM athlete_benchmarks').get().cnt

  expect('AT8: bike_streams row count unchanged', countBefore, countAfter)
  expect('AT8: benchmarks row count unchanged', bmCountBefore, bmCountAfter)
  const bikeCount = db.prepare("SELECT COUNT(*) as cnt FROM logged_sessions WHERE date='2026-10-18' AND discipline='bike'").get().cnt
  expect('AT8: only 1 bike session for 2026-10-18', bikeCount, 1)

  db.close()
}

// ─── AT9: no matching Garmin session → keiser-only row ────────────────────────
console.log('\n── AT9: Keiser TCX with no Garmin session → keiser-only row ──')
{
  const db = makeDb()
  // No logged_session in DB

  const result = importKeiserTcx(
    path.join(FIXTURE_DIR, 'keiser_ftp.tcx'),
    FIXTURE_DIR,  // garmin_ftp.fit exists but no logged_session to match
    db
  )

  const bikeCount = db.prepare("SELECT COUNT(*) as cnt FROM logged_sessions WHERE date='2026-10-18' AND discipline='bike'").get().cnt
  expect('AT9: exactly 1 bike row created', bikeCount, 1)

  const session = db.prepare("SELECT * FROM logged_sessions WHERE date='2026-10-18' AND discipline='bike' LIMIT 1").get()
  expect('AT9: note contains keiser-only (no HR)', session?.notes?.includes('keiser-only (no HR)'), true)

  db.close()
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n── Results: ${passed} PASS / ${failed} FAIL ──`)
if (failed > 0) process.exit(1)
