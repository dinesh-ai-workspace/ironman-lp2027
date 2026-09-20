import React, { useState } from 'react'

const STATUS_COLOR = {
  green:  'var(--accent-green)',
  amber:  'var(--accent-amber)',
  red:    'var(--accent-red)',
  nodata: 'var(--text-muted)',
  na:     'var(--text-muted)',
}

const OVERALL_BG = {
  green: 'rgba(34,197,94,0.08)',
  amber: 'rgba(251,191,36,0.08)',
  red:   'rgba(239,68,68,0.08)',
}

function statusBadge(gate, isAtCheckpoint) {
  if (gate.status === 'nodata') return 'NO DATA'
  if (gate.status === 'na')     return 'N/A'
  if (!isAtCheckpoint && gate.trajectoryLabel) return gate.trajectoryLabel.toUpperCase()
  if (!isAtCheckpoint && gate.mode === 'trajectory') {
    return gate.status === 'green' ? 'ON TRACK' : gate.status === 'amber' ? 'AT RISK' : 'BEHIND'
  }
  return gate.status === 'green' ? 'PASS' : gate.status === 'amber' ? 'BORDERLINE' : 'FAIL'
}

function capacityDetail(gate, unit, isAtCheckpoint) {
  if (gate.status === 'nodata') {
    const fmt = v => unit === 'min' ? `${v}min` : unit === 'km' ? `${v}km` : `${v}mi`
    return `No sessions in last 6 weeks — need ${fmt(gate.greenTarget)} by W${gate.gapCpWeek}`
  }
  const fmt = v => unit === 'min' ? `${v}min` : unit === 'km' ? `${v}km` : `${v}mi`
  const actual = fmt(gate.actual)
  const evalTarget = fmt(gate.greenTarget)
  const gapTarget  = fmt(gate.gapTarget)
  const gapStr     = gate.gap > 0 ? fmt(gate.gap) : null

  if (isAtCheckpoint || gate.mode === 'checkpoint') {
    if (gate.status === 'green') {
      return gapStr
        ? `${actual} ✓ — ${gapStr} to W${gate.gapCpWeek} target (${gapTarget})`
        : `${actual} ✓`
    }
    return `${actual} — need ${evalTarget} to pass${gapStr ? `; ${gapStr} to W${gate.gapCpWeek} Green` : ''}`
  }

  if (gate.status === 'green') {
    return `${actual} — ${(gate.trajectoryLabel || 'on track').toLowerCase()} for W${gate.gapCpWeek} (${gapTarget})`
  }
  return gapStr
    ? `${actual} — ${gapStr} to W${gate.gapCpWeek} Green (${gapTarget})`
    : `${actual} — target ${evalTarget}`
}

function OverridePanel({ gateName, gate, onSave, onClear, onCancel }) {
  const [status, setStatus] = useState(gate.isOverridden ? gate.status : '')
  const [note, setNote] = useState(gate.isOverridden ? (gate.overrideNote || '') : '')

  return (
    <div style={{
      marginTop: '8px', padding: '10px 12px', borderRadius: '6px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Manual Override
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">— select status —</option>
          <option value="green">Green (Pass)</option>
          <option value="amber">Amber (Borderline)</option>
          <option value="red">Red (Fail)</option>
        </select>
        <input
          type="text"
          placeholder="Reason (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', flex: 1, minWidth: '120px' }}
        />
        <button
          onClick={() => status && onSave(gateName, status, note)}
          disabled={!status}
          style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '4px', background: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: status ? 'pointer' : 'not-allowed', opacity: status ? 1 : 0.5 }}
        >
          Apply
        </button>
        {gate.isOverridden && (
          <button
            onClick={() => onClear(gateName)}
            style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
        <button
          onClick={onCancel}
          style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '4px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function GateRow({ label, gate, isAtCheckpoint, badge, detail, onOverride }) {
  const [showOverride, setShowOverride] = useState(false)
  const color = STATUS_COLOR[gate.status]

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
          {gate.isOverridden && (
            <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-amber)', border: '1px solid var(--bg-card)' }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
            {gate.isOverridden && (
              <span style={{ fontSize: '10px', color: 'var(--accent-amber)', fontWeight: 600, letterSpacing: '0.04em' }}>MANUAL</span>
            )}
          </div>
          {detail && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{detail}</div>}
          {gate.isOverridden && gate.overrideNote && (
            <div style={{ fontSize: '11px', color: 'var(--accent-amber)', marginTop: '2px' }}>Note: {gate.overrideNote}</div>
          )}
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color, flexShrink: 0 }}>
          {badge}
        </span>
        <button
          onClick={() => setShowOverride(v => !v)}
          title="Manual override"
          style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
            background: showOverride ? 'var(--bg-elevated)' : 'transparent',
            color: 'var(--text-muted)', border: '1px solid var(--border)',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          {showOverride ? '✕' : '⚙'}
        </button>
      </div>
      {showOverride && (
        <OverridePanel
          gateName={gate.gateKey}
          gate={gate}
          onSave={async (g, s, n) => { await onOverride(g, s, n); setShowOverride(false) }}
          onClear={async (g) => { await onOverride(g, null, null); setShowOverride(false) }}
          onCancel={() => setShowOverride(false)}
        />
      )}
    </div>
  )
}

export default function ReadinessWidget({ gates, onRefresh }) {
  if (!gates || typeof gates.overall === 'undefined') {
    return (
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2>Readiness Gates</h2>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          No data — log training sessions to track readiness.
        </div>
      </div>
    )
  }

  const { weekNum, checkpointWeek, isAtCheckpoint, phaseQuestion, gates: g, overall, overallReason } = gates
  const overallColor = STATUS_COLOR[overall]

  const gateKeys = ['swim', 'bike', 'run', 'durability', 'raceSpecific']
  gateKeys.forEach(k => { if (g[k]) g[k].gateKey = k })

  async function handleOverride(gateName, status, note) {
    if (typeof window.electronAPI === 'undefined') return
    if (status === null) {
      await window.electronAPI.clearReadinessOverride(gateName)
    } else {
      await window.electronAPI.setReadinessOverride(gateName, status, note || '')
    }
    if (onRefresh) onRefresh()
  }

  return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '4px' }}>
        <h2 style={{ margin: 0 }}>Readiness Gates</h2>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {isAtCheckpoint
            ? `Week ${weekNum} checkpoint`
            : `Week ${weekNum} → W${checkpointWeek} checkpoint`}
        </span>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', fontStyle: 'italic' }}>
        {phaseQuestion}
      </div>

      <GateRow
        label="Swim Capacity"
        gate={g.swim}
        isAtCheckpoint={isAtCheckpoint}
        badge={statusBadge(g.swim, isAtCheckpoint)}
        detail={capacityDetail(g.swim, 'km', isAtCheckpoint)}
        onOverride={handleOverride}
      />
      <GateRow
        label="Bike Capacity"
        gate={g.bike}
        isAtCheckpoint={isAtCheckpoint}
        badge={statusBadge(g.bike, isAtCheckpoint)}
        detail={capacityDetail(g.bike, 'min', isAtCheckpoint)}
        onOverride={handleOverride}
      />
      <GateRow
        label="Run Capacity"
        gate={g.run}
        isAtCheckpoint={isAtCheckpoint}
        badge={statusBadge(g.run, isAtCheckpoint)}
        detail={capacityDetail(g.run, 'mi', isAtCheckpoint)}
        onOverride={handleOverride}
      />
      <GateRow
        label="Durability"
        gate={g.durability}
        isAtCheckpoint={isAtCheckpoint}
        badge={statusBadge(g.durability, isAtCheckpoint)}
        detail={g.durability.detail}
        onOverride={handleOverride}
      />
      <GateRow
        label={weekNum >= 37 ? 'Final Readiness' : 'Race Specific'}
        gate={g.raceSpecific}
        isAtCheckpoint={isAtCheckpoint}
        badge={statusBadge(g.raceSpecific, isAtCheckpoint)}
        detail={g.raceSpecific.detail}
        onOverride={handleOverride}
      />

      <div style={{
        marginTop: '14px', padding: '10px 14px', borderRadius: '8px',
        background: OVERALL_BG[overall], border: `1px solid ${overallColor}`,
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: overallColor, flexShrink: 0 }} />
        <div>
          <span style={{ fontWeight: 700, fontSize: '13px', color: overallColor }}>
            {overall === 'green'
              ? 'On track for LPIM'
              : overall === 'amber'
              ? 'Possible — deficiency must be corrected'
              : 'Not currently on track'}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            {overallReason}
          </span>
        </div>
      </div>
    </div>
  )
}
