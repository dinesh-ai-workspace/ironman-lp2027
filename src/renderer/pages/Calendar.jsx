import React, { useState, useEffect } from 'react'

const DISC_COLOR = {
  swim: 'var(--swim)',
  bike: 'var(--bike)',
  run: 'var(--run)',
  strength: 'var(--strength)',
  other: 'var(--text-muted)',
}

const DISC_LABEL = { swim: 'Swim', bike: 'Bike', run: 'Run', strength: 'Strength', other: 'Other' }

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px' }}>
          {days.map(({ date, dateStr, planned, done, isToday }) => (
            <div
              key={dateStr}
              className="card"
              style={{
                minHeight: '160px',
                borderColor: isToday ? 'var(--accent-blue)' : 'var(--border)',
                padding: '12px',
                cursor: planned.length > 0 ? 'pointer' : 'default',
              }}
              onClick={() => setExpanded(expanded === dateStr ? null : dateStr)}
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
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}>
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
                      <div style={{ fontSize: '10px', color: 'var(--accent-blue)', marginLeft: '14px' }}>KEY</div>
                    )}
                  </div>
                ))
              )}

              {/* Expanded detail */}
              {expanded === dateStr && planned.length > 0 && (
                <div style={{
                  marginTop: '10px',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border)',
                }}>
                  {planned.map(s => (
                    <div key={`exp-${s.id}`} style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {s.purpose}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Zone {s.target_intensity_zone} · {s.type}
                      </div>
                    </div>
                  ))}
                  {done.length > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--accent-green)' }}>
                      ✓ {done.length} session{done.length > 1 ? 's' : ''} logged
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
