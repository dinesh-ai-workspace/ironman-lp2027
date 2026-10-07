'use strict'

const Database = require('better-sqlite3')
const path = require('path')
const { generateSnapshot } = require('../src/exporter/snapshot-generator')
const { generateBuildSpec } = require('../src/exporter/build-spec-generator')

const DB_PATH = path.join(__dirname, '../data/ironman.db')

let db
beforeAll(() => { db = new Database(DB_PATH, { readonly: true }) })
afterAll(() => { db.close() })

function snapLines(today) {
  return generateSnapshot(db, { today }).split('\n')
}

function weeklyRow(lines, wk) {
  return lines.find(l => l.startsWith(`| ${wk} |`) && l.includes('–20'))
}

// ─── CN-6 #1: Pass 4 — Str done/pl from match result ────────────────────────

test('CN6-1-T1: Wk 2 Str done/pl = 1/2', () => {
  const row = weeklyRow(snapLines('2026-10-06'), 2)
  expect(row).toBeTruthy()
  expect(row).toContain('| 1/2 |')
})

test('CN6-1-T2: Wk 3 Str done/pl = 2/2', () => {
  const row = weeklyRow(snapLines('2026-10-06'), 3)
  expect(row).toBeTruthy()
  expect(row).toContain('| 2/2 |')
})

test('CN6-1-T3: Wk 1 Str done/pl = 2/2 (unchanged)', () => {
  const row = weeklyRow(snapLines('2026-10-06'), 1)
  expect(row).toBeTruthy()
  expect(row).toContain('| 2/2 |')
})

test('CN6-1-T4a: Wk 1 score = 35, grade D', () => {
  const row = weeklyRow(snapLines('2026-10-06'), 1)
  expect(row).toMatch(/\| 35 \|/)
  expect(row).toMatch(/\| D \|/)
})

test('CN6-1-T4b: Wk 2 score = 68, grade C', () => {
  const row = weeklyRow(snapLines('2026-10-06'), 2)
  expect(row).toMatch(/\| 68 \|/)
  expect(row).toMatch(/\| C \|/)
})

test('CN6-1-T4c: Wk 3 score = 64, grade C', () => {
  const row = weeklyRow(snapLines('2026-10-06'), 3)
  expect(row).toMatch(/\| 64 \|/)
  expect(row).toMatch(/\| C \|/)
})

test('CN6-1-T5a: session log 2026-09-30 strength shows matched (+1d)', () => {
  const lines = snapLines('2026-10-06')
  const slIdx = lines.findIndex(l => l.includes('Session Log'))
  const extraIdx = lines.findIndex((l, i) => i > slIdx && l.includes('Extra Sessions'))
  const sessionLogLines = lines.slice(slIdx, extraIdx > slIdx ? extraIdx : lines.length)
  const row = sessionLogLines.find(l => l.includes('2026-09-30') && l.includes('strength'))
  expect(row).toBeTruthy()
  expect(row).toContain('matched (+1d)')
})

test('CN6-1-T5b: session log 2026-09-25 strength shows missed', () => {
  const lines = snapLines('2026-10-06')
  const row = lines.find(l => l.includes('2026-09-25') && l.includes('strength'))
  expect(row).toBeTruthy()
  expect(row).toContain('missed')
})

test('CN6-1-T6: 2026-10-06 run appears in Extra Sessions, not matched', () => {
  const lines = snapLines('2026-10-06')
  const extraIdx = lines.findIndex(l => l.includes('Extra Sessions'))
  expect(extraIdx).toBeGreaterThan(-1)
  const extraSection = lines.slice(extraIdx)
  expect(extraSection.some(l => l.includes('2026-10-06') && l.includes('run'))).toBe(true)
})

// ─── CN-6 #2: Plan version from plans table ───────────────────────────────────

test('CN6-2-T1: snapshot header contains Plan ID 10 v8', () => {
  const header = snapLines('2026-10-06').find(l => l.startsWith('Generated:'))
  expect(header).toContain('Plan ID 10 v8')
})

test('CN6-2-T2: snapshot header does not contain v7', () => {
  const header = snapLines('2026-10-06').find(l => l.startsWith('Generated:'))
  expect(header).not.toContain('v7')
})

// ─── CN-6 #3: Swim continuity fallback ───────────────────────────────────────

// DB has swims through 2026-09-29; last swim ages out after 2026-10-28
test('CN6-3-T1: forced date 2026-10-30 → fallback string (all swims aged out of 30-day window)', () => {
  const line = snapLines('2026-10-30').find(l => l.startsWith('Swim continuity'))
  expect(line).toBe('Swim continuity: no unbroken swim recorded in last 30 days | Week 12 gate: 1,000m | On track: UNKNOWN')
})

test('CN6-3-T2: date 2026-10-06 → shows 1167m and On track: YES', () => {
  const line = snapLines('2026-10-06').find(l => l.startsWith('Swim continuity'))
  expect(line).toMatch(/1167m/)
  expect(line).toMatch(/On track: YES/)
})

// ─── CN-7 #1: Weekly scores and Str done/pl unchanged after Pass 1 fix ────────

test('CN7-1-T4: Wk 1=35D, Wk 2=68C, Wk 3=64C; Str done/pl 2/2, 1/2, 2/2 — unchanged', () => {
  const lines = snapLines('2026-10-06')
  const wk1 = weeklyRow(lines, 1)
  const wk2 = weeklyRow(lines, 2)
  const wk3 = weeklyRow(lines, 3)
  expect(wk1).toMatch(/\| 35 \|/)
  expect(wk1).toMatch(/\| D \|/)
  expect(wk1).toContain('| 2/2 |')
  expect(wk2).toMatch(/\| 68 \|/)
  expect(wk2).toMatch(/\| C \|/)
  expect(wk2).toContain('| 1/2 |')
  expect(wk3).toMatch(/\| 64 \|/)
  expect(wk3).toMatch(/\| C \|/)
  expect(wk3).toContain('| 2/2 |')
})

// ─── CN-7 #2: Score Breakdown optional rows ──────────────────────────────────

test('CN7-2-T1: Wk3 Sep-30 strength optional breakdown row has — for Weight, Credit%, Points', () => {
  const lines = snapLines('2026-10-06')
  const w3Start = lines.findIndex(l => l === '### Week 3 (2026-09-28–2026-10-04)')
  expect(w3Start).toBeGreaterThan(-1)
  const nextSecIdx = lines.findIndex((l, i) => i > w3Start && l.startsWith('## '))
  const w3Lines = lines.slice(w3Start, nextSecIdx > w3Start ? nextSecIdx : lines.length)
  const bdRow = w3Lines.find(l => l.includes('2026-09-30') && l.includes('strength'))
  expect(bdRow).toBe('| 2026-09-30 | strength | optional | — | 50 | 111 | 222% | — | — | optional |')
})

test('CN7-2-T2: Wk3 Score Breakdown total line unchanged: 24.4 ÷ 38 = 64', () => {
  const lines = snapLines('2026-10-06')
  const w3Start = lines.findIndex(l => l === '### Week 3 (2026-09-28–2026-10-04)')
  const nextSecIdx = lines.findIndex((l, i) => i > w3Start && l.startsWith('## '))
  const w3Lines = lines.slice(w3Start, nextSecIdx > w3Start ? nextSecIdx : lines.length)
  const totalLine = w3Lines.find(l => l.startsWith('**Total:'))
  expect(totalLine).toBe('**Total: 24.4 ÷ 38 = 64**')
})

// ─── CN-7 #3: Spec date stamps ───────────────────────────────────────────────

test('CN7-3-T1: Build Spec Last changed = 2026-10-06', () => {
  const spec = generateBuildSpec()
  expect(spec).toContain('**Last changed:** 2026-10-06')
})

test('CN7-3-T2: snapshot header contains Spec changed: 2026-10-06', () => {
  const header = snapLines('2026-10-06').find(l => l.startsWith('Generated:'))
  expect(header).toContain('Spec changed: 2026-10-06')
})

test('CN7-3-T3: Build Spec changelog contains CN-7 #1, #2, #3 rows', () => {
  const spec = generateBuildSpec()
  expect(spec).toContain('CN-7 #1')
  expect(spec).toContain('CN-7 #2')
  expect(spec).toContain('CN-7 #3')
})

// ─── CN-8 #1: Session log derives from computeScore (no matching duplication) ─

test('CN8-1-T3a: session log 2026-09-30 strength still shows matched (+1d) after computeScore refactor', () => {
  const lines = snapLines('2026-10-06')
  const slIdx = lines.findIndex(l => l.includes('Session Log'))
  const extraIdx = lines.findIndex((l, i) => i > slIdx && l.includes('Extra Sessions'))
  const slLines = lines.slice(slIdx, extraIdx > slIdx ? extraIdx : lines.length)
  const row = slLines.find(l => l.includes('2026-09-30') && l.includes('strength'))
  expect(row).toBeTruthy()
  expect(row).toContain('matched (+1d)')
})

test('CN8-1-T3b: session log 2026-09-25 strength still shows missed after computeScore refactor', () => {
  const lines = snapLines('2026-10-06')
  const slIdx = lines.findIndex(l => l.includes('Session Log'))
  const extraIdx = lines.findIndex((l, i) => i > slIdx && l.includes('Extra Sessions'))
  const slLines = lines.slice(slIdx, extraIdx > slIdx ? extraIdx : lines.length)
  const row = slLines.find(l => l.includes('2026-09-25') && l.includes('strength'))
  expect(row).toBeTruthy()
  expect(row).toContain('missed')
})
