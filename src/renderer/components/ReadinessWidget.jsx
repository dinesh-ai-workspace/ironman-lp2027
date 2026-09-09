import React from 'react'

function statusColor(status) {
  if (status === 'green') return 'var(--accent-green)'
  if (status === 'amber') return 'var(--accent-amber)'
  if (status === 'red') return 'var(--accent-red)'
  return 'var(--text-muted)'
}

function statusBadgeClass(status) {
  if (status === 'green') return 'badge badge-green'
  if (status === 'amber') return 'badge badge-amber'
  if (status === 'red') return 'badge badge-red'
  return 'badge badge-blue'
}

function latestGateForDiscipline(gates, discipline) {
  const disc = gates.filter(g => g.discipline === discipline)
  if (!disc.length) return null
  // Return the most recent non-pending gate, or the latest pending
  const assessed = disc.filter(g => g.status !== 'pending')
  if (assessed.length) return assessed[assessed.length - 1]
  return disc[disc.length - 1]
}

export default function ReadinessWidget({ gates = [] }) {
  const disciplines = [
    { key: 'swim', label: 'Swim', color: 'var(--swim)' },
    { key: 'bike', label: 'Bike', color: 'var(--bike)' },
    { key: 'run', label: 'Run', color: 'var(--run)' },
  ]

  return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <h2>Readiness Gates</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {disciplines.map(({ key, label, color }) => {
          const gate = latestGateForDiscipline(gates, key)

          return (
            <div key={key} style={{ background: 'var(--bg-base)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{
                  width: '12px', height: '12px', borderRadius: '50%',
                  background: gate ? statusColor(gate.status) : 'var(--text-muted)',
                  flexShrink: 0,
                }} />
                <span style={{ fontWeight: 600, color }}>{label}</span>
                {gate && (
                  <span className={statusBadgeClass(gate.status)} style={{ marginLeft: 'auto' }}>
                    {gate.status === 'pending' ? 'Pending' : gate.status.toUpperCase()}
                  </span>
                )}
              </div>

              {gate ? (
                <>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Week {gate.week_num} gate
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {gate.status === 'pending'
                      ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Not yet assessed</span>
                      : gate.actual_value || gate.target_value
                    }
                  </div>
                  {gate.status === 'pending' && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Target: {gate.target_value}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No gates yet
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
