import React from 'react'

const DISCIPLINE_COLORS = {
  swim: 'var(--swim)',
  bike: 'var(--bike)',
  run: 'var(--run)',
  strength: 'var(--strength)',
  other: 'var(--text-muted)',
}

const DISCIPLINE_LABELS = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  strength: 'Strength',
  other: 'Other',
}

function importanceBadge(importance) {
  if (importance === 'key') return <span className="badge badge-blue">Priority</span>
  if (importance === 'supporting') return <span className="badge" style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--text-muted)' }}>Base</span>
  if (importance === 'optional') return <span className="badge" style={{ background: 'rgba(148,163,184,0.08)', color: 'var(--text-muted)' }}>Optional</span>
  return null
}

function formatDuration(minutes) {
  if (!minutes) return '--'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h}h ${m > 0 ? m + 'm' : ''}`
  return `${m}m`
}

const READINESS_COLOR = { green: '#22c55e', amber: '#fbbf24', red: '#f87171' }

export default function SessionCard({ session, showDate = true, readinessTier = null }) {
  const disc = session.discipline || 'other'
  const color = DISCIPLINE_COLORS[disc] || 'var(--text-muted)'
  const importanceClass = `importance-${session.importance || 'supporting'}`

  return (
    <div className={`session-card ${importanceClass}`}>
      <div className="session-discipline-dot" style={{ background: color }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ fontWeight: 600, color, fontSize: '13px' }}>
            {DISCIPLINE_LABELS[disc] || disc}
          </span>
          {readinessTier && (
            <span
              title={`Readiness: ${readinessTier}`}
              style={{
                display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                background: READINESS_COLOR[readinessTier], flexShrink: 0,
              }}
            />
          )}
          {importanceBadge(session.importance)}
          {session.is_brick ? <span className="badge badge-amber">BRICK</span> : null}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {showDate && session.date && <span style={{ marginRight: '8px' }}>{session.date}</span>}
          {formatDuration(session.target_duration || session.duration)}
          {session.purpose && <span style={{ marginLeft: '8px' }}>· {session.purpose}</span>}
        </div>
      </div>
    </div>
  )
}
