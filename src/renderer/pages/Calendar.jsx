import React, { useState, useEffect } from 'react'

const DISC_COLOR = {
  swim: 'var(--swim)',
  bike: 'var(--bike)',
  run: 'var(--run)',
  strength: 'var(--strength)',
  other: 'var(--text-muted)',
}

const DISC_LABEL = { swim: 'Swim', bike: 'Bike', run: 'Run', strength: 'Strength', race: 'Race', other: 'Other' }

const WORKOUT_DESCRIPTIONS = {
  // ── Swim ──────────────────────────────────────────────────────────────────
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
  // ── Bike ──────────────────────────────────────────────────────────────────
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
  // ── Run ───────────────────────────────────────────────────────────────────
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
  // ── Strength ──────────────────────────────────────────────────────────────
  'strength:foundation_strength': {
    goal: 'Build injury-resistant base strength and hip/core stability',
    execution: 'Focus: glute bridges, single-leg deadlifts, clamshells, plank variations, hip flexor mobility. 2–3 sets × 10–15 reps. Slow and controlled. No heavy loading yet.',
  },
  'strength:in_season_maintenance': {
    goal: 'Maintain neuromuscular strength without adding fatigue',
    execution: 'Short, targeted session. Single-leg squats, Romanian deadlifts, lateral band walks, core stability. 2 sets × 8–10 reps, moderate load. Done in 30–35 min — get in, get out.',
  },
  // ── Race ──────────────────────────────────────────────────────────────────
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

export default function Calendar() {
  const [weekOffset, setWeekOffset] = useState(null)
  const [sessions, setSessions] = useState([])
  const [logged, setLogged] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)
  const noAPI = typeof window.electronAPI === 'undefined'

  const today = new Date()
  const baseMonday = getMondayOf(today)

  // On first load, jump to the plan's first week if today is before plan start
  useEffect(() => {
    if (noAPI) { setWeekOffset(0); return }
    window.electronAPI.getPlan().then(plan => {
      if (plan && plan.plan_start_date) {
        const planStart = new Date(plan.plan_start_date + 'T00:00:00Z')
        const planMonday = getMondayOf(planStart)
        const diffMs = planMonday.getTime() - baseMonday.getTime()
        const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
        // If today is before plan start, jump to plan's first week
        setWeekOffset(diffWeeks > 0 ? diffWeeks : 0)
      } else {
        setWeekOffset(0)
      }
    }).catch(() => setWeekOffset(0))
  }, [])

  const displayMonday = weekOffset !== null ? addDays(baseMonday, weekOffset * 7) : baseMonday
  const displaySunday = addDays(displayMonday, 6)
  const weekStartStr = toISO(displayMonday)
  const weekEndStr = toISO(displaySunday)

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

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <h1 style={{ marginBottom: 0 }}>Training Calendar</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={() => setWeekOffset(o => o - 1)}>← Prev</button>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)', minWidth: '180px', textAlign: 'center' }}>
            {weekStartStr} – {weekEndStr}
          </span>
          <button className="btn btn-secondary" onClick={() => setWeekOffset(o => o + 1)}>Next →</button>
          {weekOffset !== 0 && (
            <button className="btn btn-secondary" onClick={() => setWeekOffset(0)}>Today</button>
          )}
        </div>
      </div>

      {noAPI && (
        <div style={{ color: 'var(--accent-amber)', marginBottom: '16px', fontSize: '13px' }}>
          Running outside Electron — calendar data unavailable.
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        <>
          {/* 7-day grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px' }}>
            {days.map(({ date, dateStr, planned, done, isToday }) => (
              <div
                key={dateStr}
                className="card"
                style={{
                  minHeight: '160px',
                  borderColor: expanded === dateStr ? 'var(--accent-blue)' : isToday ? 'var(--accent-blue)' : 'var(--border)',
                  borderWidth: expanded === dateStr ? '2px' : '1px',
                  padding: '12px',
                  cursor: planned.length > 0 ? 'pointer' : 'default',
                }}
                onClick={() => planned.length > 0 && setExpanded(expanded === dateStr ? null : dateStr)}
              >
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: isToday ? 'var(--accent-blue)' : 'var(--text-muted)',
                  marginBottom: '8px',
                }}>
                  {formatHeaderDate(date)}
                  {done.length > 0 && (
                    <span style={{ marginLeft: '6px', color: 'var(--accent-green)' }}>✓</span>
                  )}
                </div>

                {planned.length === 0 ? (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rest</div>
                ) : (
                  planned.map(s => (
                    <div key={s.id} style={{ marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500 }}>
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: DISC_COLOR[s.discipline] || 'var(--text-muted)',
                          flexShrink: 0,
                        }} />
                        <span style={{ color: DISC_COLOR[s.discipline] }}>
                          {DISC_LABEL[s.discipline] || s.discipline}
                        </span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          {s.target_duration}m
                        </span>
                      </div>
                      {s.importance === 'key' && (
                        <div style={{ fontSize: '10px', color: 'var(--accent-blue)', marginLeft: '14px' }}>Priority</div>
                      )}
                      {s.importance === 'supporting' && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '14px' }}>Base</div>
                      )}
                      {s.importance === 'optional' && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '14px', opacity: 0.6 }}>Optional</div>
                      )}
                    </div>
                  ))
                )}

                {planned.length > 0 && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', opacity: 0.5 }}>
                    {expanded === dateStr ? '▲ close' : '▼ details'}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Full-width detail panel */}
          {expanded && (() => {
            const day = days.find(d => d.dateStr === expanded)
            if (!day || day.planned.length === 0) return null
            return (
              <div className="card" style={{ marginTop: '16px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>{formatHeaderDate(day.date)} — Workout Detail</h3>
                  <button className="btn btn-secondary" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={() => setExpanded(null)}>Close</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                  {day.planned.map(s => {
                    const desc = WORKOUT_DESCRIPTIONS[`${s.discipline}:${s.type}`]
                    const color = DISC_COLOR[s.discipline] || 'var(--text-muted)'
                    return (
                      <div key={`detail-${s.id}`} style={{
                        padding: '14px 16px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '10px',
                        borderLeft: `4px solid ${color}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color }}>
                            {DISC_LABEL[s.discipline] || s.discipline}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {s.target_duration} min · Zone {s.target_intensity_zone}
                          </span>
                          {s.importance === 'key' && <span className="badge badge-blue">Priority</span>}
                          {s.importance === 'supporting' && <span className="badge" style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--text-muted)' }}>Base</span>}
                          {s.importance === 'optional' && <span className="badge" style={{ background: 'rgba(148,163,184,0.08)', color: 'var(--text-muted)' }}>Optional</span>}
                        </div>
                        {desc ? (
                          <>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                              🎯 {desc.goal}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                              {desc.execution}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {s.purpose}
                          </div>
                        )}
                        {day.done.length > 0 && (
                          <div style={{ fontSize: '11px', color: 'var(--accent-green)', marginTop: '10px' }}>
                            ✓ Logged
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
