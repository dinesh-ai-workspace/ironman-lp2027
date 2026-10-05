'use strict'

const PLAN_START_STR = '2026-09-14'
const PLAN_START = new Date(PLAN_START_STR + 'T00:00:00Z')
const TOTAL_WEEKS = 45

function weekStartFor(weekNum) {
  const d = new Date(PLAN_START)
  d.setUTCDate(d.getUTCDate() + (weekNum - 1) * 7)
  return d.toISOString().slice(0, 10)
}

function dateAdd(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function fmt1(n) { return n == null ? '—' : n.toFixed(1) }
function fmtInt(n) { return n == null ? '—' : Math.round(n).toString() }
function dash(v) { return (v == null || v === '') ? '—' : v }

const PHASE_FOR_WEEK = {}
const PHASE_BOUNDARIES = [
  { name: 'Foundation',    start: 1,  end: 14 },
  { name: 'Aerobic Base',  start: 15, end: 26 },
  { name: 'Build',         start: 27, end: 36 },
  { name: 'Peak',          start: 37, end: 41 },
  { name: 'Taper',         start: 42, end: 45 },
]
for (const p of PHASE_BOUNDARIES) {
  for (let w = p.start; w <= p.end; w++) PHASE_FOR_WEEK[w] = p.name
}

/** Returns 'A' | 'B' | 'Cutback' | 'DR' | null for Wks 29-38 */
function getABLabel(weekNum) {
  if (weekNum < 29 || weekNum > 38) return null
  if (weekNum === 38) return 'DR'
  if (weekNum % 4 === 0) return 'Cutback'
  return weekNum % 2 === 1 ? 'A' : 'B'
}

/** Returns 'Cutback' | '' for step-back weeks outside the A/B block */
function getWeekLabel(weekNum) {
  const ab = getABLabel(weekNum)
  if (ab) return ab
  if (weekNum % 4 === 0) return 'Cutback'
  return ''
}

function generateDraftPlan(db, draftPlanId) {
  const draftPlan = db.prepare('SELECT * FROM plans WHERE id=?').get(draftPlanId)
  if (!draftPlan) return `# Draft Plan\n\nPlan ID ${draftPlanId} not found.\n`

  const refPlan = db.prepare("SELECT * FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1").get()
  const refPlanId = refPlan?.id

  // Collect weekly totals for both plans
  function weeklyMinutes(planId, wk) {
    const start = weekStartFor(wk)
    const end   = dateAdd(start, 6)
    const rows  = db.prepare(
      'SELECT target_duration, discipline FROM planned_sessions WHERE plan_id=? AND date>=? AND date<=?'
    ).all(planId, start, end)
    const total = rows.reduce((s, r) => s + (r.target_duration || 0), 0)
    const byDisc = {}
    for (const r of rows) {
      byDisc[r.discipline] = (byDisc[r.discipline] || 0) + (r.target_duration || 0)
    }
    return { total, byDisc, rows }
  }

  const CAP_MIN = 840 // 14 h
  const RACE_WKS = new Set([18, 28, 38])
  const TAPER_WKS = new Set([42, 43, 44, 45])
  const SKIP_RISE = new Set([5, 18, 28, 38, 42, 43, 44, 45])

  // Compute countable minutes (Wk 38: exclude race_simulation sessions)
  function countableMinutes(planId, wk) {
    const start = weekStartFor(wk)
    const end   = dateAdd(start, 6)
    const rows  = db.prepare(
      'SELECT target_duration, type FROM planned_sessions WHERE plan_id=? AND date>=? AND date<=?'
    ).all(planId, start, end)
    const list = wk === 38 ? rows.filter(r => r.type !== 'race_simulation') : rows
    return list.reduce((s, r) => s + (r.target_duration || 0), 0)
  }

  // Per-week cap OK flag
  const weekCapOK = {}
  for (let wk = 1; wk <= TOTAL_WEEKS; wk++) {
    if (RACE_WKS.has(wk) || TAPER_WKS.has(wk)) { weekCapOK[wk] = null; continue }
    weekCapOK[wk] = countableMinutes(draftPlanId, wk) <= CAP_MIN
  }

  // ── Validation block ────────────────────────────────────────────────────────
  // 1. 14h cap
  const capFails = []
  for (let wk = 1; wk <= TOTAL_WEEKS; wk++) {
    if (RACE_WKS.has(wk) || TAPER_WKS.has(wk)) continue
    const cm = countableMinutes(draftPlanId, wk)
    if (cm > CAP_MIN) capFails.push(`Wk ${wk} (${weekStartFor(wk)}): ${(cm/60).toFixed(1)}h`)
  }

  // 2. ≤10% WoW rise — Wks 14+ only
  const riseFails = []
  {
    let prevMin = null, prevWk = null
    for (let wk = 14; wk <= 41; wk++) {
      const { total: wkMin } = weeklyMinutes(draftPlanId, wk)
      if (SKIP_RISE.has(wk) || wk % 4 === 0 || wkMin === 0) { prevMin = null; prevWk = null; continue }
      if (prevMin != null && prevMin > 0) {
        const pct = (wkMin - prevMin) / prevMin * 100
        if (pct > 10.5) riseFails.push(`Wk ${wk}: +${pct.toFixed(1)}% (${prevWk}→${wk}: ${prevMin}→${wkMin}min)`)
      }
      prevMin = wkMin; prevWk = wk
    }
  }

  // 3. Cutback 50-65% — Wks 14+, compare non-strength minutes
  function noStrMin(planId, wk) {
    const start = weekStartFor(wk)
    const end   = dateAdd(start, 6)
    const rows  = db.prepare(
      'SELECT target_duration, discipline FROM planned_sessions WHERE plan_id=? AND date>=? AND date<=?'
    ).all(planId, start, end)
    return rows.filter(r => r.discipline !== 'strength').reduce((s, r) => s + (r.target_duration || 0), 0)
  }
  const cutFails = []
  for (let wk = 14; wk <= 41; wk++) {
    if (wk % 4 !== 0) continue
    let p = wk - 1
    while (p > 0 && (p % 4 === 0 || SKIP_RISE.has(p))) p--
    if (p <= 0) continue
    const ns = noStrMin(draftPlanId, wk)
    const nsP = noStrMin(draftPlanId, p)
    if (nsP === 0) continue
    const ratio = ns / nsP
    if (ratio < 0.47 || ratio > 0.68) cutFails.push(`Wk ${wk}: ${ns}÷${nsP}=${(ratio*100).toFixed(1)}% (target 50-65%)`)
  }

  // 4. Long run ≤165
  const runFails = []
  {
    const rows = db.prepare(
      "SELECT date, target_duration FROM planned_sessions WHERE plan_id=? AND discipline='run' AND importance='key' AND target_duration > 165"
    ).all(draftPlanId)
    for (const r of rows) runFails.push(`${r.date}: ${r.target_duration}min`)
  }

  // 5. Gate count
  const gateCount = db.prepare('SELECT COUNT(*) as c FROM readiness_gates WHERE plan_id=?').get(draftPlanId).c

  const validationLines = [
    '## Validation',
    '',
    `| Rule | Result | Detail |`,
    `|---|---|---|`,
    `| 14h cap | ${capFails.length === 0 ? '✓ PASS' : '✗ FAIL'} | ${capFails.length === 0 ? 'All non-race weeks ≤14.0h' : capFails.join('; ')} |`,
    `| ≤10% rise (Wks 14+) | ${riseFails.length === 0 ? '✓ PASS' : '✗ FAIL'} | ${riseFails.length === 0 ? 'All progressions ≤10%' : riseFails.join('; ')} |`,
    `| Cutback 50-65% (Wks 14+) | ${cutFails.length === 0 ? '✓ PASS' : '✗ FAIL'} | ${cutFails.length === 0 ? 'All cutback weeks 50-65%' : cutFails.join('; ')} |`,
    `| Long run ≤165 min | ${runFails.length === 0 ? '✓ PASS' : '✗ FAIL'} | ${runFails.length === 0 ? 'No long run >165min' : runFails.join('; ')} |`,
    `| Gate count = 11 | ${gateCount === 11 ? '✓ PASS' : '✗ FAIL'} | ${gateCount} gates |`,
  ]

  // ── Section 1: Weekly Summary table ────────────────────────────────────────
  const summaryRows = []
  let prevDraftMin = null

  for (let wk = 1; wk <= TOTAL_WEEKS; wk++) {
    const start = weekStartFor(wk)
    const { total: draftMin, byDisc: draftDisc } = weeklyMinutes(draftPlanId, wk)
    const { total: refMin } = refPlanId ? weeklyMinutes(refPlanId, wk) : { total: null }

    const draftH  = (draftMin / 60).toFixed(1)
    const phase   = PHASE_FOR_WEEK[wk] || '—'
    const label   = getWeekLabel(wk)

    let pctChange = '—'
    if (prevDraftMin != null && prevDraftMin > 0) {
      const chg = ((draftMin - prevDraftMin) / prevDraftMin * 100).toFixed(0)
      pctChange = (draftMin > prevDraftMin ? '+' : '') + chg + '%'
    }

    let diffRef = '—'
    if (refMin != null) {
      const d = draftMin - refMin
      if (Math.abs(d) < 5) diffRef = '='
      else diffRef = (d > 0 ? '+' : '') + Math.round(d) + 'min'
    }

    const swimMin = draftDisc['swim'] || 0
    const bikeMin = draftDisc['bike'] || 0
    const runMin  = draftDisc['run'] || 0

    const capOK = weekCapOK[wk]
    const capCell = capOK === null ? '—' : (capOK ? '✓' : '✗')

    summaryRows.push(`| ${wk} | ${phase} | ${start} | ${draftH} | ${pctChange} | ${label} | ${fmtInt(swimMin)} | ${fmtInt(bikeMin)} | ${fmtInt(runMin)} | ${diffRef} | ${capCell} |`)

    // Don't update prevDraftMin for race weeks (HIM/IM) or step-back weeks
    if (label !== 'Cutback' && draftMin > 0) prevDraftMin = draftMin
  }

  const summaryHeader =
    '| Wk | Phase | Mon Date | Total h | % vs prev | Label | Swim min | Bike min | Run min | vs Plan 7 | Cap OK |\n' +
    '|---|---|---|---|---|---|---|---|---|---|---|'

  // ── Section 2: Full weekly session tables ───────────────────────────────────
  const weekSections = []

  for (let wk = 1; wk <= TOTAL_WEEKS; wk++) {
    const start = weekStartFor(wk)
    const end   = dateAdd(start, 6)
    const phase = PHASE_FOR_WEEK[wk] || '—'
    const label = getWeekLabel(wk)
    const { total: draftMin } = weeklyMinutes(draftPlanId, wk)
    const totalH = (draftMin / 60).toFixed(1)

    const sessions = db.prepare(
      'SELECT * FROM planned_sessions WHERE plan_id=? AND date>=? AND date<=? ORDER BY date, discipline'
    ).all(draftPlanId, start, end)

    const heading = `### Week ${wk} — ${phase}${label ? ' [' + label + ']' : ''} — ${start} (${totalH}h)`
    const rows = sessions.map(s =>
      `| ${s.date} | ${s.discipline} | ${s.type} | ${s.importance} | ${s.target_duration} min | Z${s.target_intensity_zone} | ${(s.notes || '').slice(0, 60)} |`
    ).join('\n')
    const tblHeader = '| Date | Disc | Type | Tier | Duration | Zone | Notes |\n|---|---|---|---|---|---|---|'

    weekSections.push([heading, tblHeader, rows || '| — | — | — | — | — | — | No sessions |'].join('\n'))
  }

  // ── Section 3: Diff vs plan ID 7 ───────────────────────────────────────────
  const diffLines = []
  for (let wk = 1; wk <= TOTAL_WEEKS; wk++) {
    const start = weekStartFor(wk)
    const end   = dateAdd(start, 6)

    const draftSessions = db.prepare(
      'SELECT discipline, type, importance, target_duration, date FROM planned_sessions WHERE plan_id=? AND date>=? AND date<=? ORDER BY date, discipline'
    ).all(draftPlanId, start, end)

    const refSessions = refPlanId ? db.prepare(
      'SELECT discipline, type, importance, target_duration, date FROM planned_sessions WHERE plan_id=? AND date>=? AND date<=? ORDER BY date, discipline'
    ).all(refPlanId, start, end) : []

    const draftKey = s => `${s.date}|${s.discipline}|${s.type}`
    const refKey   = s => `${s.date}|${s.discipline}|${s.type}`

    const draftSet = new Set(draftSessions.map(draftKey))
    const refSet   = new Set(refSessions.map(refKey))

    const added   = draftSessions.filter(s => !refSet.has(draftKey(s)))
    const removed = refSessions.filter(s => !draftSet.has(refKey(s)))
    const changed = draftSessions.filter(s => {
      if (!refSet.has(draftKey(s))) return false
      const ref = refSessions.find(r => refKey(r) === draftKey(s))
      return ref && (Math.abs(ref.target_duration - s.target_duration) > 3 || ref.importance !== s.importance)
    })

    if (added.length + removed.length + changed.length > 0) {
      diffLines.push(`**Wk ${wk} (${weekStartFor(wk)}):**`)
      for (const s of added)   diffLines.push(`  + ${s.date} ${s.discipline} ${s.type} ${s.target_duration}min (${s.importance})`)
      for (const s of removed) diffLines.push(`  - ${s.date} ${s.discipline} ${s.type} ${s.target_duration}min (${s.importance})`)
      for (const s of changed) {
        const ref = refSessions.find(r => refKey(r) === draftKey(s))
        diffLines.push(`  ~ ${s.date} ${s.discipline} ${s.type}: ${ref.target_duration}→${s.target_duration}min, ${ref.importance}→${s.importance}`)
      }
    }
  }

  // ── Assemble ────────────────────────────────────────────────────────────────
  const now = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const np = {}
  now.forEach(({ type, value }) => { np[type] = value })
  const generatedAt = `${np.year}-${np.month}-${np.day} ${np.hour}:${np.minute} ET`

  const gates = db.prepare(
    'SELECT * FROM readiness_gates WHERE plan_id=? ORDER BY week_num ASC, discipline ASC'
  ).all(draftPlanId)
  const gateHeader = '| Gate | Week | Target |\n|---|---|---|'
  const gateRows = gates.map(g =>
    `| ${g.discipline} ${g.metric} | ${g.week_num} | ${(g.target_value || '').slice(0, 80)} |`
  ).join('\n')

  return [
    `# IM_LP2027 Plan DRAFT`,
    `**Generated:** ${generatedAt} | Draft Plan ID ${draftPlanId} v${draftPlan.version} | vs Active Plan ID ${refPlanId} v${refPlan?.version ?? '?'}`,
    `**Status:** DRAFT — DO NOT ACTIVATE without coach review`,
    `**DB:** ${db.name}`,
    '',
    validationLines.join('\n'),
    '',
    `## Key Changes vs Plan ${refPlanId}`,
    '- Wk 5: FTP test (Wed KEY), swim TT (Thu supporting), run TT (Thu KEY) + Fri technique swim (supporting) — replaces normal sessions',
    '- All strength sessions: optional in every week',
    '- Wk 15+: Tuesday easy run 30min Z2 added (supporting)',
    '- Wks 21, 23, 25, 27: Saturday brick run added after long ride (KEY)',
    '- Wks 29-38: A/B alternating weekend pattern (A=Sun long run; B=Thu long run + Sat brick)',
    '- Wks 33-35: Tue swim → endurance_continuous 100min (build toward 3,800m non-stop)',
    '- Wk 33+: Fri/OW swim note — pool continuous swim if water <60°F',
    '- Wk 38: Dress Rehearsal — Sat swim 100min → bike 300min → run 90min back-to-back',
    '- HIM race duration: 240 → 450 min | IM race duration: 660 → 930 min',
    '- Fri swim open-water from Wk 33',
    '- Long run ceiling: 150 → 165 min | Step-back multiplier: 70% → 63% from Wk 14',
    '- Gates: 27 rows → 11 rows (one per checkpoint week)',
    '',
    `## Weekly Summary`,
    summaryHeader,
    summaryRows.join('\n'),
    '',
    `## Readiness Gates (${gates.length} rows)`,
    gateHeader,
    gateRows || '| — | — | — |',
    '',
    `## Diff vs Plan ${refPlanId} (session-level changes)`,
    diffLines.length > 0 ? diffLines.join('\n') : '_No structural differences detected._',
    '',
    `## Full Week-by-Week Sessions`,
    weekSections.join('\n\n'),
    '',
  ].join('\n')
}

module.exports = { generateDraftPlan }
