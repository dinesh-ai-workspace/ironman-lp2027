'use strict'

const PLAN_START_STR = '2026-09-14'
const PLAN_START = new Date(PLAN_START_STR + 'T00:00:00Z')

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateAdd(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function weekStartFor(weekNum) {
  const d = new Date(PLAN_START)
  d.setUTCDate(d.getUTCDate() + (weekNum - 1) * 7)
  return d.toISOString().slice(0, 10)
}

function dayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  return DAY_NAMES[d.getUTCDay()]
}

function todayStr() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString().slice(0, 10)
}

// Weeks excluded from "build week" h/wk computation.
// Cutback weeks (every 4th), race weeks, and Dress Rehearsal week.
const EXCLUDED_WEEKS = new Set([4,8,12,16,18,20,24,28,32,36,38,40,45])

function computePhaseHours(planId, weekStart, weekEnd, db) {
  const endSunDate = dateAdd(weekStartFor(weekEnd), 6)
  const sessions = db.prepare(
    'SELECT date, target_duration FROM planned_sessions WHERE plan_id=? AND date>=? AND date<=?'
  ).all(planId, weekStartFor(weekStart), endSunDate)

  const byWeek = {}
  for (const s of sessions) {
    const d = new Date(s.date + 'T00:00:00Z')
    const wk = Math.floor((d - PLAN_START) / (7 * 24 * 60 * 60 * 1000)) + 1
    byWeek[wk] = (byWeek[wk] || 0) + s.target_duration
  }

  const vals = []
  for (let w = weekStart; w <= weekEnd; w++) {
    if (!EXCLUDED_WEEKS.has(w)) vals.push((byWeek[w] || 0) / 60)
  }
  if (vals.length === 0) return null

  const mn = Math.min(...vals).toFixed(1)
  const mx = Math.max(...vals).toFixed(1)
  return `${mn}–${mx}`
}

function generatePlanDoc(db) {
  const today = todayStr()

  // Active plan
  const activePlan = db.prepare(
    "SELECT * FROM plans WHERE status='active' ORDER BY version DESC LIMIT 1"
  ).get()

  if (!activePlan) {
    return '# IM_LP2027 Training Plan\n\nNo active plan found.\n'
  }

  const planId = activePlan.id
  const planVersion = activePlan.version

  // Phase structure
  const blocks = db.prepare(
    'SELECT * FROM plan_blocks WHERE plan_id=? ORDER BY week_start ASC'
  ).all(planId)

  // Compute planned h/wk (build weeks) for each phase block
  const phaseHoursMap = {}
  for (const b of blocks) {
    phaseHoursMap[b.id] = computePhaseHours(planId, b.week_start, b.week_end, db)
  }

  const phaseRows = blocks.map(b =>
    `| ${b.phase_name} | ${b.week_start}–${b.week_end} | ${b.start_date}–${b.end_date} | ${phaseHoursMap[b.id] || '—'} |`
  ).join('\n')

  // Tune-up race weeks — derive dates
  const week18Start = weekStartFor(18)
  const week18Race  = dateAdd(week18Start, 6) // Sunday
  const week28Start = weekStartFor(28)
  const week28Race  = dateAdd(week28Start, 5) // Saturday

  // Readiness gates
  const gates = db.prepare(
    'SELECT * FROM readiness_gates WHERE plan_id=? ORDER BY week_num ASC, discipline ASC'
  ).all(planId)

  const gateHeader = '| Wk | Discipline | Metric | Target | Status |\n|---|---|---|---|---|'
  const gateRows = gates.map(g =>
    `| ${g.week_num} | ${g.discipline} | ${g.metric} | ${g.target_value} | ${g.status} |`
  ).join('\n')

  // All planned sessions (all 45 weeks)
  const allSessions = db.prepare(
    `SELECT ps.*, pb.phase_name, pb.week_start, pb.week_end, pb.target_weekly_hours_min, pb.target_weekly_hours_max
     FROM planned_sessions ps
     JOIN plan_blocks pb ON ps.block_id = pb.id
     WHERE ps.plan_id=?
     ORDER BY ps.date ASC, ps.discipline ASC`
  ).all(planId)

  // Build a map: weekNum → sessions
  const sessionsByWeek = {}
  for (const s of allSessions) {
    const wk = Math.floor(
      (new Date(s.date + 'T00:00:00Z') - PLAN_START) / (7 * 24 * 60 * 60 * 1000)
    ) + 1
    if (!sessionsByWeek[wk]) sessionsByWeek[wk] = []
    sessionsByWeek[wk].push({ ...s, weekNum: wk })
  }

  // Weekly Summary table
  const weeklySummaryHeader =
    '| Wk | Phase | Mon Date | Swim min | Bike min | Run min | Str min | Total min | Total h |\n' +
    '|---|---|---|---|---|---|---|---|---|'

  const weeklySummaryRows = []
  for (let wk = 1; wk <= 45; wk++) {
    const monDate = weekStartFor(wk)
    const wkSessions = sessionsByWeek[wk] || []

    const phaseName = wkSessions.length > 0 ? wkSessions[0].phase_name : '—'

    function discMin(disc) {
      return wkSessions
        .filter(s => s.discipline === disc)
        .reduce((sum, s) => sum + (s.target_duration || 0), 0)
    }

    const swimMin  = discMin('swim')
    const bikeMin  = discMin('bike')
    const runMin   = discMin('run')
    const strMin   = discMin('strength')
    const totalMin = wkSessions.reduce((sum, s) => sum + (s.target_duration || 0), 0)
    const totalH   = (totalMin / 60).toFixed(1)

    weeklySummaryRows.push(
      `| ${wk} | ${phaseName} | ${monDate} | ${swimMin} | ${bikeMin} | ${runMin} | ${strMin} | ${totalMin} | ${totalH} |`
    )
  }

  // Full schedule — week by week
  const weekSections = []
  for (let wk = 1; wk <= 45; wk++) {
    const monDate = weekStartFor(wk)
    const sunDate = dateAdd(monDate, 6)
    const wkSessions = sessionsByWeek[wk] || []

    // Get phase info from first session, or from blocks
    let phaseName = '—'
    let phaseHoursRange = '—'
    if (wkSessions.length > 0) {
      phaseName = wkSessions[0].phase_name
      const blk = blocks.find(b => wk >= b.week_start && wk <= b.week_end)
      phaseHoursRange = blk ? (phaseHoursMap[blk.id] || '—') : '—'
    } else {
      // Fall back to block lookup
      const blk = blocks.find(b => wk >= b.week_start && wk <= b.week_end)
      if (blk) {
        phaseName = blk.phase_name
        phaseHoursRange = phaseHoursMap[blk.id] || '—'
      }
    }

    const sessionTableHeader =
      '| Day | Date | Discipline | Type | Tier | Target min | Zone | Purpose | Target m | Note |\n' +
      '|---|---|---|---|---|---|---|---|---|---|'

    const sessionRows = wkSessions
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        return a.discipline.localeCompare(b.discipline)
      })
      .map(s =>
        `| ${dayName(s.date)} | ${s.date} | ${s.discipline} | ${s.type} | ${s.importance} | ${s.target_duration} | Z${s.target_intensity_zone} | ${(s.purpose || '').slice(0, 60)} | ${s.target_distance_m ?? '—'} | ${(s.notes || '').slice(0, 50) || '—'} |`
      ).join('\n')

    weekSections.push([
      `### Week ${wk} (${monDate}–${sunDate}) — ${phaseName} [${phaseHoursRange} h/wk]`,
      sessionTableHeader,
      sessionRows || '| — | — | — | — | — | — | — | No sessions |',
    ].join('\n'))
  }

  // Assemble
  const lines = [
    '# IM_LP2027 Training Plan',
    `Generated: ${today} from DB | Plan ID: ${planId} | Version: ${planVersion}`,
    '',
    '## Phase Structure',
    '| Phase | Weeks | Dates | Planned h/wk (build weeks) |',
    '|---|---|---|---|',
    phaseRows || '| — | — | — | — |',
    '',
    '## Tune-Up Races',
    `- Week 18 (${week18Race}): Sprint/Olympic (indoor pool tri)`,
    `- Week 28 (${week28Race}): Half-Ironman`,
    '',
    '## Readiness Gates',
    gateHeader,
    gateRows || '| — | — | — | — | — |',
    '',
    '## Weekly Summary',
    weeklySummaryHeader,
    weeklySummaryRows.join('\n'),
    '',
    '## Full Schedule — Week by Week',
    '',
    weekSections.join('\n\n'),
    '',
  ]

  return lines.join('\n')
}

module.exports = { generatePlanDoc }
