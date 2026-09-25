'use strict'
import React, { useState, useEffect } from 'react'

const DISC_COLOR = {
  swim: 'var(--swim)',
  bike: 'var(--bike)',
  run: 'var(--run)',
  strength: 'var(--strength)',
  other: 'var(--text-muted)',
}

const DISC_LABEL = { swim: 'Swim', bike: 'Bike', run: 'Run', strength: 'Strength', race: 'Race', other: 'Other' }

const WORKOUT_LINKS = {
  'swim:technique':               { label: 'Watch: Swim Drills',          url: 'https://www.youtube.com/results?search_query=triathlon+swim+technique+drills' },
  'swim:aerobic_intervals':       { label: 'Watch: Swim Intervals',       url: 'https://www.youtube.com/results?search_query=triathlon+swim+aerobic+intervals+sets' },
  'swim:endurance':               { label: 'Watch: Open Water Tips',      url: 'https://www.youtube.com/results?search_query=open+water+triathlon+swim+endurance+tips' },
  'bike:technique_indoor':        { label: 'Watch: Cadence Drills',       url: 'https://www.youtube.com/results?search_query=cycling+cadence+drills+indoor+trainer+triathlon' },
  'bike:endurance_z2':            { label: 'Watch: Zone 2 Training',      url: 'https://www.youtube.com/results?search_query=zone+2+cycling+training+explanation+triathlon' },
  'bike:cadence_and_terrain':     { label: 'Watch: Low Cadence & Hills',  url: 'https://www.youtube.com/results?search_query=low+cadence+cycling+torque+hill+training' },
  'bike:hill_climbing':           { label: 'Watch: Climbing Technique',   url: 'https://www.youtube.com/results?search_query=cycling+hill+climbing+technique+seated+standing' },
  'bike:long_ride':               { label: 'Watch: Long Ride Fueling',    url: 'https://www.youtube.com/results?search_query=ironman+long+ride+fueling+nutrition+strategy' },
  'bike:race_simulation':         { label: 'Watch: Race Simulation',      url: 'https://www.youtube.com/results?search_query=ironman+bike+race+simulation+training+ride' },
  'run:easy':                     { label: 'Watch: Zone 2 Running',       url: 'https://www.youtube.com/results?search_query=zone+2+running+pace+triathlon+easy+effort' },
  'run:long_run':                 { label: 'Watch: Long Run Tips',        url: 'https://www.youtube.com/results?search_query=triathlon+long+run+training+tips+ironman' },
  'run:recovery':                 { label: 'Watch: Recovery Run',         url: 'https://www.youtube.com/results?search_query=recovery+run+triathlon+how+easy+should+it+be' },
  'run:brick_run':                { label: 'Watch: Brick Run Tips',       url: 'https://www.youtube.com/results?search_query=brick+run+triathlon+T2+transition+tips' },
  'strength:foundation_strength': { label: 'Watch: Foundation Strength',  url: 'https://www.youtube.com/results?search_query=triathlon+foundation+strength+exercises+glutes+core' },
  'strength:in_season_maintenance':{ label: 'Watch: In-Season Strength',  url: 'https://www.youtube.com/results?search_query=triathlon+in+season+strength+maintenance+workout' },
  'race:ironman':                 { label: 'Watch: Ironman Race Tips',    url: 'https://www.youtube.com/results?search_query=ironman+triathlon+race+day+strategy+tips' },
  'race:half_ironman_tune_up':    { label: 'Watch: Half Ironman Tips',    url: 'https://www.youtube.com/results?search_query=half+ironman+race+tips+pacing+nutrition' },
  'race:sprint_olympic_tune_up':  { label: 'Watch: Sprint Tri Tips',      url: 'https://www.youtube.com/results?search_query=sprint+olympic+triathlon+race+tips+pacing' },
}

const WORKOUT_DESCRIPTIONS = {
  'swim:technique': {
    goal: 'Build efficient stroke mechanics',
    execution: 'Focus on catch, pull, and rotation. Use drills: fingertip drag, catch-up, 6-kick switch. Keep effort easy (Zone 1–2). Quality over distance.',
  },
  'swim:aerobic_intervals': {
    goal: 'Build aerobic engine and pace awareness',
    execution: 'Main set: 4–6 × 200–400m at a comfortably hard effort (Zone 3) with 20–30s rest. Warm up and cool down easy. Aim for consistent splits.',
  },
  'swim:endurance': {
    goal: 'Extend time in the water at race-sustainable effort',
    execution: 'Continuous or broken swims at Zone 2 pace. Practice bilateral breathing and sighting every 10 strokes. Simulate open-water conditions where possible.',
  },
  'bike:technique_indoor': {
    goal: 'Develop pedalling efficiency and bike feel',
    execution: 'Trainer session. Alternate 5-min blocks of 90+ rpm cadence drills with single-leg pedalling. Keep power low (Zone 1–2). Focus on smooth circles, not mashing.',
  },
  'bike:endurance_z2': {
    goal: 'Build aerobic base and fat oxidation',
    execution: 'Hold Zone 2 heart rate throughout — conversational pace. Eat 40–60g carbs/hr to train the gut. No surges. This is your bread-and-butter training ride.',
  },
  'bike:cadence_and_terrain': {
    goal: "Adapt to Lake Placid's rolling terrain and build torque",
    execution: 'Include 3–4 × 8-min low-cadence (55–65 rpm) efforts on climbs at Zone 3 power. Recover on descents. Practice shifting and gear selection on varied grades.',
  },
  'bike:hill_climbing': {
    goal: "Build climbing-specific strength for LP's two loops",
    execution: "Target sustained climbs at Zone 3–4. Practise seated climbing at 70–80 rpm and standing efforts on short punchy sections. Fuel every 20 min — don't wait for hunger.",
  },
  'bike:long_ride': {
    goal: 'Build multi-hour endurance and fueling discipline',
    execution: 'Steady Zone 2 effort. Execute your full race-nutrition plan: 60–80g carbs/hr, 500–750ml fluid/hr, electrolytes. Note how your body responds — adjust on the next ride.',
  },
  'bike:race_simulation': {
    goal: 'Full dress rehearsal of race-day bike leg',
    execution: 'Ride LP course profile if possible. Execute exact race-day nutrition and pacing. Hold race power — resist the urge to push early. This is the most important training day of the plan.',
  },
  'run:easy': {
    goal: 'Aerobic maintenance and active recovery',
    execution: "Zone 2 heart rate — slow enough to hold a full conversation. If you feel the urge to speed up, slow down. This run supports the week's hard sessions, not the other way around.",
  },
  'run:long_run': {
    goal: 'Build run durability and glycogen efficiency',
    execution: "Start Zone 2, finish Zone 2. Do not drift into Zone 3 even when fatigue sets in — that's the adaptation. Fuel every 30–40 min. Walk breaks are fine early in the plan.",
  },
  'run:recovery': {
    goal: 'Flush fatigue and maintain run frequency',
    execution: "Truly easy — slower than you think necessary. Zone 1 heart rate. 20–35 min max. If legs are heavy from yesterday's long bike, shorten or skip entirely.",
  },
  'run:brick_run': {
    goal: 'Train the bike-to-run transition and overcome dead-leg sensation',
    execution: "Change shoes quickly, start running immediately. First 5–8 min will feel awful — that's normal. Settle into Zone 2. Practise your T2 nutrition cue: start fuelling within 2 min of running.",
  },
  'strength:foundation_strength': {
    goal: 'Build injury-resistant base strength and hip/core stability',
    execution: 'Focus: glute bridges, single-leg deadlifts, clamshells, plank variations, hip flexor mobility. 2–3 sets × 10–15 reps. Slow and controlled. No heavy loading yet.',
  },
  'strength:in_season_maintenance': {
    goal: 'Maintain neuromuscular strength without adding fatigue',
    execution: 'Short, targeted session. Single-leg squats, Romanian deadlifts, lateral band walks, core stability. 2 sets × 8–10 reps, moderate load. Done in 30–35 min — get in, get out.',
  },
  'race:ironman': {
    goal: 'IRONMAN Lake Placid 2027 — race day',
    execution: 'Swim 2.4mi → Bike 112mi → Run 26.2mi. Trust your training. Execute the nutrition plan you have practised all year. The first 6 hours are setup — the last 2 hours are the race.',
  },
  'race:half_ironman_tune_up': {
    goal: 'Race-effort tune-up: test pacing and nutrition under pressure',
    execution: 'Treat as a hard training day, not an all-out race. Practise race-day routine: warm-up, transitions, nutrition. Note what works and what to fix before the A-race.',
  },
  'race:sprint_olympic_tune_up': {
    goal: 'Speed work in a race context — sharpen VO2 and transitions',
    execution: 'Race hard but controlled. Use it to practise T1/T2 efficiency and open-water swimming in a race environment. Debrief your pacing and fueling afterward.',
  },
}

function getMondayOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dow = d.getUTCDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diff)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

function toISO(date) {
  return date.toISOString().slice(0, 10)
}

function formatHeaderDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function formatShortDate(isoStr) {
  const d = new Date(isoStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// ─── Compliance engine ────────────────────────────────────────────────────────

// Weights: KEY = 10, Supporting = 4, Optional = 1
const W = { key: 10, supporting: 4, optional: 1 }

// Strict thresholds: done ≥85%, partial 50–84% (25% credit), <50% = 0
function sessionCredit(pct) {
  if (pct >= 0.85) return 1.0
  if (pct >= 0.50) return 0.25
  return 0
}

function letterGrade(score) {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 45) return 'D'
  return 'F'
}

function gradeColor(score) {
  if (score >= 90) return 'var(--accent-green)'
  if (score >= 75) return '#86efac'
  if (score >= 60) return 'var(--accent-amber)'
  if (score >= 45) return '#fb923c'
  return '#ef4444'
}

function computeWeekCompliance(days, todayISO) {
  // ── Step 1: flatten all planned + logged sessions for the week ──────────────
  const allPlanned = []
  const allLogged  = []

  for (const { date, dateStr, planned, done } of days) {
    for (const p of planned) allPlanned.push({ ...p, dateStr, date })
    for (const d of done)    allLogged.push({ ...d, dateStr, date })
  }

  const pastPlanned   = allPlanned.filter(p => p.dateStr <= todayISO)
  const futurePlanned = allPlanned.filter(p => p.dateStr >  todayISO)

  // Only past/today logged sessions participate in matching — future-dated logs
  // are not yet "earned" against planned slots
  const pastLogged   = allLogged.filter(d => d.dateStr <= todayISO)
  const futureLogged = allLogged.filter(d => d.dateStr >  todayISO)

  // ── Step 2: week-wide greedy matching ──────────────────────────────────────

  // A log on day D with a same-discipline plan on D-1 defers to cross-day passes
  const hasEarlierPlan = new Set()
  for (const l of pastLogged) {
    const prev = new Date(l.dateStr + 'T00:00:00Z')
    prev.setUTCDate(prev.getUTCDate() - 1)
    const prevStr = prev.toISOString().slice(0, 10)
    if (pastPlanned.some(p => p.discipline === l.discipline && p.dateStr === prevStr)) {
      hasEarlierPlan.add(l.id)
    }
  }

  function daysDiff(a, b) {
    return Math.abs((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000)
  }

  // Pick best log: duration closeness → (cross-day: date distance) → earlier log date → smaller id
  function pickBest(plan, candidates, crossDay = false) {
    return candidates.reduce((best, d) => {
      const dd = Math.abs(d.duration - plan.target_duration)
      const bd = Math.abs(best.duration - plan.target_duration)
      if (dd !== bd) return dd < bd ? d : best
      if (crossDay) {
        const dDist = daysDiff(d.dateStr, plan.dateStr)
        const bDist = daysDiff(best.dateStr, plan.dateStr)
        if (dDist !== bDist) return dDist < bDist ? d : best
      }
      if (d.dateStr !== best.dateStr) return d.dateStr < best.dateStr ? d : best
      return String(d.id) <= String(best.id) ? d : best
    })
  }

  const impOrder = { key: 0, supporting: 1, optional: 2 }
  const usedLoggedIds = new Set()
  const matchMap = new Map() // plan object ref → matched log

  // ── Pass 1: same-day, importance-first (KEY gets first pick of same-day logs) ──
  const sortedByImp = [...pastPlanned].sort((a, b) => {
    const di = (impOrder[a.importance] ?? 3) - (impOrder[b.importance] ?? 3)
    if (di !== 0) return di
    if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr)
    return b.target_duration - a.target_duration
  })

  for (const p of sortedByImp) {
    const candidates = pastLogged.filter(d =>
      d.discipline === p.discipline && !usedLoggedIds.has(d.id)
        && d.dateStr === p.dateStr && !hasEarlierPlan.has(d.id)
    )
    if (candidates.length > 0) {
      const best = pickBest(p, candidates)
      usedLoggedIds.add(best.id)
      matchMap.set(p, best)
    }
  }

  // ── Pass 2: cross-day, KEY only, ±2 days (KEY always gets cross-day priority) ──
  const keyPlans = pastPlanned
    .filter(p => p.importance === 'key' && !matchMap.has(p))
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr))

  for (const p of keyPlans) {
    const candidates = pastLogged.filter(d =>
      d.discipline === p.discipline && !usedLoggedIds.has(d.id)
        && daysDiff(d.dateStr, p.dateStr) <= 2
    )
    if (candidates.length > 0) {
      const best = pickBest(p, candidates, true)
      usedLoggedIds.add(best.id)
      matchMap.set(p, best)
    }
  }

  // ── Pass 3: cross-day, supporting + optional, date-first, ±2 days ─────────────
  const nonKeyPlans = pastPlanned
    .filter(p => p.importance !== 'key' && !matchMap.has(p))
    .sort((a, b) => {
      if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr)
      const di = (impOrder[a.importance] ?? 3) - (impOrder[b.importance] ?? 3)
      if (di !== 0) return di
      return b.target_duration - a.target_duration
    })

  for (const p of nonKeyPlans) {
    const candidates = pastLogged.filter(d =>
      d.discipline === p.discipline && !usedLoggedIds.has(d.id)
        && daysDiff(d.dateStr, p.dateStr) <= 2
    )
    if (candidates.length > 0) {
      const best = pickBest(p, candidates, true)
      usedLoggedIds.add(best.id)
      matchMap.set(p, best)
    }
  }

  const matchedRows = []
  for (const p of pastPlanned) {
    const matched = matchMap.get(p) ?? null
    let status = 'missed', pct = 0
    if (matched) {
      pct    = matched.duration / p.target_duration
      status = pct >= 0.85 ? 'done' : pct >= 0.50 ? 'partial' : 'low'
    }
    matchedRows.push({ dateStr: p.dateStr, date: p.date, planned: p, matched, status, pct })
  }

  // ── Step 3: future sessions → pending ──────────────────────────────────────
  for (const p of futurePlanned) {
    matchedRows.push({ dateStr: p.dateStr, date: p.date, planned: p, matched: null, status: 'pending', pct: null })
  }

  // ── Step 4: unclaimed logged sessions → extras ─────────────────────────────
  for (const d of pastLogged) {
    if (!usedLoggedIds.has(d.id)) {
      matchedRows.push({ dateStr: d.dateStr, date: d.date, planned: null, matched: d, status: 'extra', pct: null })
    }
  }
  // Future-dated logged sessions shown as extras but never matched
  for (const d of futureLogged) {
    matchedRows.push({ dateStr: d.dateStr, date: d.date, planned: null, matched: d, status: 'extra', pct: null })
  }

  // Sort by planned date (or logged date for extras), then by discipline
  matchedRows.sort((a, b) => {
    const da = a.planned?.dateStr ?? a.matched?.dateStr ?? a.dateStr
    const db = b.planned?.dateStr ?? b.matched?.dateStr ?? b.dateStr
    return da.localeCompare(db)
  })

  // ── Step 5: score (past/today only) ────────────────────────────────────────
  let earned = 0, maxPts = 0, pendingPts = 0
  let keyDone = 0, keyTotal = 0, supDone = 0, supTotal = 0, optDone = 0, optTotal = 0

  for (const r of matchedRows) {
    if (!r.planned) continue
    const w = W[r.planned.importance] || 1

    if (r.status === 'pending') {
      pendingPts += w
      if (r.planned.importance === 'key') keyTotal++
      else if (r.planned.importance === 'supporting') supTotal++
      else optTotal++
      continue
    }

    maxPts += w
    const credit = sessionCredit(r.pct ?? 0)
    earned += w * credit
    const full = credit >= 1.0
    if (r.planned.importance === 'key')       { keyTotal++; if (full) keyDone++ }
    else if (r.planned.importance === 'supporting') { supTotal++; if (full) supDone++ }
    else                                       { optTotal++; if (full) optDone++ }
  }

  const score = maxPts > 0 ? Math.round(earned / maxPts * 100) : null
  const grade = score !== null ? letterGrade(score) : null
  const color = score !== null ? gradeColor(score) : 'var(--text-muted)'

  return {
    rows: matchedRows, score, grade, color,
    earned, maxPts, pendingPts, hasPending: pendingPts > 0,
    keyDone, keyTotal, supDone, supTotal, optDone, optTotal,
  }
}

function StatusBadge({ status }) {
  const styles = {
    done:    { color: 'var(--accent-green)', label: '✓ Done' },
    partial: { color: 'var(--accent-amber)', label: '~ Partial' },
    low:     { color: '#fb923c',             label: '⚠ Low' },
    missed:  { color: '#ef4444',             label: '✗ Missed' },
    pending: { color: 'var(--text-muted)',   label: '· Pending' },
    extra:   { color: 'var(--accent-blue)',  label: '+ Extra' },
  }
  const s = styles[status] || styles.extra
  return (
    <span style={{ fontSize: '12px', fontWeight: 600, color: s.color }}>{s.label}</span>
  )
}

const PLAN_START_DATE = new Date('2026-09-14T00:00:00Z')

export default function Calendar() {
  const [weekOffset, setWeekOffset] = useState(null)
  const [sessions, setSessions] = useState([])
  const [logged, setLogged] = useState([])
  const [expandedRow, setExpandedRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [heatmap, setHeatmap] = useState(null)
  const noAPI = typeof window.electronAPI === 'undefined'

  const today = new Date()
  const baseMonday = getMondayOf(today)

  useEffect(() => {
    if (noAPI) { setWeekOffset(0); return }
    window.electronAPI.getPlan().then(plan => {
      if (plan && plan.plan_start_date) {
        const planStart = new Date(plan.plan_start_date + 'T00:00:00Z')
        const planMonday = getMondayOf(planStart)
        const diffMs = planMonday.getTime() - baseMonday.getTime()
        const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
        setWeekOffset(diffWeeks > 0 ? diffWeeks : 0)
      } else {
        setWeekOffset(0)
      }
    }).catch(() => setWeekOffset(0))
  }, [])

  useEffect(() => {
    if (noAPI) return
    window.electronAPI.getHeatmap()
      .then(data => setHeatmap(data))
      .catch(console.error)
  }, [])

  const displayMonday = weekOffset !== null ? addDays(baseMonday, weekOffset * 7) : baseMonday
  const displaySunday = addDays(displayMonday, 6)
  const weekStartStr = toISO(displayMonday)
  const weekEndStr = toISO(displaySunday)

  // Which plan week number is currently shown in the week detail
  const selectedWeekNum = weekOffset !== null
    ? Math.floor((displayMonday - PLAN_START_DATE) / (7 * 24 * 60 * 60 * 1000)) + 1
    : null

  useEffect(() => {
    if (weekOffset === null) return
    if (noAPI) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      window.electronAPI.getPlannedSessions({ weekStartDate: weekStartStr, weekEndDate: weekEndStr }),
      window.electronAPI.getLoggedSessions({ startDate: weekStartStr, endDate: weekEndStr }),
    ]).then(([planned, logs]) => {
      setSessions(planned || [])
      setLogged(logs || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [weekOffset])

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(displayMonday, i)
    const dateStr = toISO(d)
    const planned = sessions.filter(s => s.date === dateStr)
    const done = logged.filter(s => s.date === dateStr)
    const isToday = dateStr === toISO(today)
    return { date: d, dateStr, planned, done, isToday }
  })

  const todayISO = toISO(today)
  const compliance = computeWeekCompliance(days, todayISO)

  return (
    <div>
      {/* ── Header with nav ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <h1 style={{ marginBottom: 0 }}>Training Planner</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={() => setWeekOffset(o => o - 1)}>← Prev</button>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)', minWidth: '200px', textAlign: 'center' }}>
            {selectedWeekNum !== null && selectedWeekNum >= 1 && selectedWeekNum <= 45
              ? `W${selectedWeekNum} · ` : ''}{weekStartStr} – {weekEndStr}
          </span>
          <button className="btn btn-secondary" onClick={() => setWeekOffset(o => o + 1)}>Next →</button>
          {weekOffset !== 0 && (
            <button className="btn btn-secondary" onClick={() => setWeekOffset(0)}>Today</button>
          )}
        </div>
      </div>

      {/* ── Season heatmap ──────────────────────────────────────────────── */}
      {heatmap && (
        <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
          <TrainingHeatmap
            data={heatmap}
            selectedWeek={selectedWeekNum}
            onWeekClick={wk => setWeekOffset(wk - heatmap.currentWeek)}
          />
        </div>
      )}

      {noAPI && (
        <div style={{ color: 'var(--accent-amber)', marginBottom: '16px', fontSize: '13px' }}>
          Running outside Electron — calendar data unavailable.
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        <div className="card" style={{ padding: '20px' }}>
          {(() => {
            // IDs already claimed by a cross-day match — don't show these again as logged_only
            const claimedIds = new Set(
              compliance.rows.filter(r => r.matched != null).map(r => r.matched.id)
            )
            // Build per-day display items — rest days always included
            const displayItems = []
            for (const day of days) {
              const dayRows = compliance.rows.filter(r => r.dateStr === day.dateStr)
              if (dayRows.length > 0) {
                for (const r of dayRows) {
                  displayItems.push({ type: 'session', row: r, dateStr: day.dateStr, isToday: day.isToday })
                }
              } else {
                // Show unclaimed logged sessions (truly unmatched extras on a rest/unplanned day)
                const unclaimed = day.done.filter(d => !claimedIds.has(d.id))
                if (unclaimed.length > 0) {
                  for (const d of unclaimed) {
                    displayItems.push({ type: 'logged_only', logged: d, dateStr: day.dateStr, isToday: day.isToday })
                  }
                } else {
                  displayItems.push({ type: 'rest', dateStr: day.dateStr, isToday: day.isToday })
                }
              }
            }
            return (
            <>
              {/* Score summary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    Week Compliance{compliance.hasPending ? ' (so far)' : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 800, color: compliance.color, lineHeight: 1 }}>
                      {compliance.score !== null ? `${compliance.score}%` : '—'}
                    </div>
                    {compliance.grade && (
                      <div style={{
                        fontSize: '24px', fontWeight: 900, color: compliance.color,
                        background: `${compliance.color}22`, borderRadius: '6px',
                        padding: '0 8px', lineHeight: '1.4',
                      }}>
                        {compliance.grade}
                      </div>
                    )}
                  </div>
                  {compliance.hasPending && compliance.score !== null && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {compliance.pendingPts} pts still available
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {compliance.keyTotal > 0 && (
                    <div style={{
                      padding: '8px 14px', borderRadius: '8px',
                      background: compliance.keyDone === compliance.keyTotal ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      border: `1px solid ${compliance.keyDone === compliance.keyTotal ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>KEY</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: compliance.keyDone === compliance.keyTotal ? 'var(--accent-green)' : '#ef4444' }}>
                        {compliance.keyDone}/{compliance.keyTotal}
                      </div>
                    </div>
                  )}
                  {compliance.supTotal > 0 && (
                    <div style={{ padding: '8px 14px', borderRadius: '8px', background: 'rgba(148,163,184,0.06)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Supporting</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{compliance.supDone}/{compliance.supTotal}</div>
                    </div>
                  )}
                  {compliance.optTotal > 0 && (
                    <div style={{ padding: '8px 14px', borderRadius: '8px', background: 'rgba(148,163,184,0.06)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Optional</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-muted)' }}>{compliance.optDone}/{compliance.optTotal}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Session table with expandable rows */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', width: '110px' }}>Day</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px' }}>Session</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px' }}>Logged</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', width: '80px' }}>Gap</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', width: '90px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item, i) => {
                    if (item.type === 'rest') {
                      return (
                        <tr key={item.dateStr} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '10px 10px', color: item.isToday ? 'var(--accent-blue)' : 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: item.isToday ? 600 : 400 }}>
                            {formatShortDate(item.dateStr)}
                          </td>
                          <td colSpan={4} style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic', opacity: 0.5 }}>
                            Rest
                          </td>
                        </tr>
                      )
                    }
                    if (item.type === 'logged_only') {
                      const d = item.logged
                      return (
                        <tr key={`lo-${d.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '10px 10px', color: item.isToday ? 'var(--accent-blue)' : 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: item.isToday ? 600 : 400 }}>
                            {formatShortDate(item.dateStr)}
                          </td>
                          <td style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic', opacity: 0.5 }}>Rest</td>
                          <td style={{ padding: '10px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: DISC_COLOR[d.discipline] || 'var(--text-muted)', fontWeight: 600 }}>
                                {DISC_LABEL[d.discipline] || d.discipline}
                              </span>
                              <span style={{ color: 'var(--text-muted)' }}>{d.duration}m</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: '12px' }}>—</td>
                          <td style={{ padding: '10px 10px' }}><StatusBadge status="extra" /></td>
                        </tr>
                      )
                    }
                    const r = item.row
                    const isKeyMiss = r.planned?.importance === 'key' && (r.status === 'missed' || r.status === 'low')
                    const isPending = r.status === 'pending'
                    const isOpen = expandedRow === i
                    const desc = r.planned ? WORKOUT_DESCRIPTIONS[`${r.planned.discipline}:${r.planned.type}`] : null
                    const hasDetail = !!desc
                    const rowBg = isOpen ? 'rgba(59,130,246,0.06)'
                      : isKeyMiss ? 'rgba(239,68,68,0.06)'
                      : isPending ? 'rgba(148,163,184,0.04)'
                      : 'transparent'
                    const plannedMin = r.planned?.target_duration ?? null
                    const loggedMin  = r.matched?.duration ?? null
                    const gap = (!isPending && plannedMin !== null && loggedMin !== null) ? loggedMin - plannedMin : null
                    const gapLabel = isPending ? '—'
                      : gap === null ? (r.status === 'missed' || r.status === 'low') ? `-${plannedMin}m` : '—'
                      : gap === 0 ? 'On target' : gap > 0 ? `+${gap}m` : `${gap}m`
                    const gapColor = isPending ? 'var(--text-muted)'
                      : gap === null ? (r.status === 'missed' ? '#ef4444' : r.status === 'low' ? '#fb923c' : 'var(--text-muted)')
                      : gap >= 0 ? 'var(--accent-green)'
                      : gap >= -plannedMin * 0.15 ? 'var(--accent-amber)' : '#ef4444'
                    const discColor = DISC_COLOR[r.planned?.discipline || r.matched?.discipline] || 'var(--text-muted)'

                    return (
                      <React.Fragment key={i}>
                        <tr
                          style={{ background: rowBg, borderBottom: isOpen ? 'none' : '1px solid rgba(255,255,255,0.04)', cursor: hasDetail ? 'pointer' : 'default' }}
                          onClick={() => hasDetail && setExpandedRow(isOpen ? null : i)}
                        >
                          <td style={{ padding: '10px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '12px' }}>
                            {formatShortDate(r.dateStr)}
                          </td>
                          <td style={{ padding: '10px 10px' }}>
                            {r.planned ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ color: discColor, fontWeight: 600 }}>
                                  {DISC_LABEL[r.planned.discipline] || r.planned.discipline}
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>{r.planned.target_duration}m</span>
                                {r.planned.target_intensity_zone && (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Z{r.planned.target_intensity_zone}</span>
                                )}
                                {r.planned.importance === 'key' && (
                                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(59,130,246,0.15)', padding: '1px 5px', borderRadius: '4px' }}>KEY</span>
                                )}
                                {hasDetail && (
                                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '2px' }}>{isOpen ? '▲' : '▼'}</span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 10px' }}>
                            {r.matched ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ color: DISC_COLOR[r.matched.discipline] || 'var(--text-muted)', fontWeight: 600 }}>
                                  {DISC_LABEL[r.matched.discipline] || r.matched.discipline}
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>{r.matched.duration}m</span>
                                {r.matched.notes ? (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                                    {r.matched.notes.length > 30 ? r.matched.notes.slice(0, 30) + '…' : r.matched.notes}
                                  </span>
                                ) : null}
                                {r.planned && r.matched.dateStr !== r.planned.dateStr && (
                                  <span style={{ fontSize: '10px', color: 'var(--accent-amber)' }}>
                                    ({formatShortDate(r.matched.dateStr)})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 10px', fontWeight: 600, color: gapColor, fontSize: '12px' }}>{gapLabel}</td>
                          <td style={{ padding: '10px 10px' }}><StatusBadge status={r.status} /></td>
                        </tr>
                        {isOpen && desc && (
                          <tr style={{ background: 'rgba(59,130,246,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td />
                            <td colSpan={4} style={{ padding: '0 10px 14px' }}>
                              <div style={{
                                borderLeft: `3px solid ${discColor}`,
                                paddingLeft: '12px',
                                marginTop: '4px',
                              }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                  {desc.goal}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '8px' }}>
                                  {desc.execution}
                                </div>
                                {WORKOUT_LINKS[`${r.planned.discipline}:${r.planned.type}`] && (
                                  <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: '11px', padding: '4px 10px' }}
                                    onClick={e => {
                                      e.stopPropagation()
                                      window.electronAPI?.openExternal(WORKOUT_LINKS[`${r.planned.discipline}:${r.planned.type}`].url)
                                    }}
                                  >
                                    ▶ {WORKOUT_LINKS[`${r.planned.discipline}:${r.planned.type}`].label}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ── Heatmap component ───────────────────────────────────────────────────────
const CHECKPOINT_WEEKS = new Set([8, 16, 24, 28, 32, 36])

function heatColor(w) {
  if (w.isFuture)  return { bg: 'var(--bg-elevated)', text: 'var(--text-muted)' }
  if (w.isCurrent) return { bg: 'rgba(59,130,246,0.25)', text: 'var(--accent-blue)' }
  if (w.score === null) return { bg: 'var(--bg-elevated)', text: 'var(--text-muted)' }
  if (w.score >= 90)  return { bg: 'rgba(34,197,94,0.25)',  text: 'var(--accent-green)' }
  if (w.score >= 70)  return { bg: 'rgba(251,191,36,0.25)', text: 'var(--accent-amber)' }
  return { bg: 'rgba(239,68,68,0.20)', text: 'var(--accent-red)' }
}

function fmtVol(min) {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`
}

function TrainingHeatmap({ data, selectedWeek, onWeekClick }) {
  const { weeks } = data
  const COLS = 9
  const rows = []
  for (let i = 0; i < weeks.length; i += COLS) rows.push(weeks.slice(i, i + COLS))

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        {[
          { bg: 'rgba(34,197,94,0.25)',  text: 'var(--accent-green)', label: '≥90%' },
          { bg: 'rgba(251,191,36,0.25)', text: 'var(--accent-amber)', label: '70–89%' },
          { bg: 'rgba(239,68,68,0.20)',  text: 'var(--accent-red)',   label: '<70%' },
          { bg: 'rgba(59,130,246,0.25)', text: 'var(--accent-blue)',  label: 'Current week' },
          { bg: 'var(--bg-elevated)',    text: 'var(--text-muted)',   label: 'Future' },
        ].map(({ bg, text, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: bg, border: `1px solid ${text}`, flexShrink: 0 }} />
            {label}
          </div>
        ))}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          CP = checkpoint &nbsp;·&nbsp; click to navigate
        </div>
      </div>

      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: '5px', marginBottom: '5px' }}>
          {row.map(w => {
            const { bg, text } = heatColor(w)
            const isCP = CHECKPOINT_WEEKS.has(w.weekNum)
            const isSelected = w.weekNum === selectedWeek
            return (
              <div
                key={w.weekNum}
                onClick={() => onWeekClick(w.weekNum)}
                style={{
                  background: bg,
                  border: isSelected
                    ? '2px solid var(--accent-blue)'
                    : isCP ? `1px solid ${text}` : '1px solid transparent',
                  boxShadow: isSelected ? '0 0 0 1px var(--accent-blue)' : 'none',
                  borderRadius: '6px',
                  padding: '6px 4px',
                  cursor: 'pointer',
                  minHeight: '64px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '2px',
                  position: 'relative',
                }}
              >
                {isCP && (
                  <div style={{
                    position: 'absolute', top: '3px', right: '5px',
                    fontSize: '8px', color: text, fontWeight: 700, letterSpacing: '0.03em',
                  }}>CP</div>
                )}
                <div style={{ fontSize: '11px', fontWeight: 700, color: text }}>
                  W{w.weekNum}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                  {w.startStr.slice(5)}
                </div>
                {!w.isFuture && (
                  <>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: text }}>
                      {w.score !== null ? `${w.score}%` : '—'}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {fmtVol(w.volumeMin)}
                    </div>
                    {w.logged > 0 && (
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {w.logged}/{w.planned || '?'} sessions
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
