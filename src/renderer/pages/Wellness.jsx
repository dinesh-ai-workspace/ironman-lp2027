import React, { useState, useEffect } from 'react'

function evaluateSleepTier(history) {
  const isSleepPoor = (w) => !w || (w.sleep_hours != null && w.sleep_hours < 6) || (w.sleep_quality_1_5 != null && w.sleep_quality_1_5 <= 2)
  const recentSeven = history.slice(-7)
  const poorCount = recentSeven.filter(isSleepPoor).length
  const lastTwo = history.slice(-2)
  const consecutivePoor = lastTwo.length === 2 && lastTwo.every(isSleepPoor)
  if (poorCount >= 4) return 'AMBER'
  if (consecutivePoor) return 'REDUCE'
  if (isSleepPoor(history[history.length - 1])) return 'CAUTION'
  return 'OK'
}

const TIER_COLOR = {
  OK:      'var(--accent-green)',
  CAUTION: 'var(--accent-amber)',
  REDUCE:  'var(--accent-amber)',
  AMBER:   '#f97316',
}

const TIER_DESC = {
  OK:      'Sleep is good — proceed as planned.',
  CAUTION: 'One poor night. Reduce intensity on hard sessions today.',
  REDUCE:  '2+ consecutive poor nights. Reduce volume and intensity.',
  AMBER:   'Persistent sleep debt. Hold progression; key sessions at 80%.',
}

function defaultRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 13)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

function QualityDots({ value }) {
  if (value == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const color = value >= 4 ? 'var(--accent-green)' : value >= 3 ? 'var(--accent-amber)' : '#f97316'
  return (
    <span style={{ display: 'inline-flex', gap: '3px' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: i < value ? color : 'var(--border)',
        }} />
      ))}
    </span>
  )
}

export default function Wellness() {
  const noAPI = typeof window.electronAPI === 'undefined'
  const [range, setRange] = useState(defaultRange())
  const [history, setHistory] = useState([])
  const [sleepTier, setSleepTier] = useState('OK')
  const [loading, setLoading] = useState(true)

  async function load(r) {
    if (noAPI) { setLoading(false); return }
    const hist = await window.electronAPI.getWellnessHistory(r)
    const sorted = (hist || []).slice().sort((a, b) => a.date.localeCompare(b.date))
    setHistory(sorted)
    try { setSleepTier(evaluateSleepTier(sorted)) }
    catch { setSleepTier('OK') }
    setLoading(false)
  }

  useEffect(() => { load(range) }, [])

  function setStart(v) { const r = { ...range, start: v }; setRange(r); load(r) }
  function setEnd(v)   { const r = { ...range, end: v };   setRange(r); load(r) }

  const avgHours = history.filter(h => h.sleep_hours != null).length > 0
    ? (history.reduce((s, h) => s + (h.sleep_hours || 0), 0) / history.filter(h => h.sleep_hours != null).length).toFixed(1)
    : null

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div>
      <h1>Sleep Tracker</h1>

      {noAPI && (
        <div style={{ color: 'var(--accent-amber)', marginBottom: '16px', fontSize: '13px' }}>
          Running outside Electron — data unavailable.
        </div>
      )}

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="date" value={range.start} onChange={e => setStart(e.target.value)} />
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>to</span>
            <input type="date" value={range.end} onChange={e => setEnd(e.target.value)} />
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '32px', alignItems: 'center' }}>
            {avgHours != null && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{avgHours}h</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>avg sleep</div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: TIER_COLOR[sleepTier], flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: TIER_COLOR[sleepTier] }}>{sleepTier}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{TIER_DESC[sleepTier]}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {history.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No sleep data for this range — import Garmin data to populate.</div>
      ) : (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px' }}>Date</th>
                <th style={{ textAlign: 'center', padding: '10px 8px' }}>Sleep</th>
                <th style={{ textAlign: 'center', padding: '10px 8px' }}>Quality</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map(h => {
                const poor = (h.sleep_hours != null && h.sleep_hours < 6) || (h.sleep_quality_1_5 != null && h.sleep_quality_1_5 <= 2)
                return (
                  <tr key={h.id || h.date} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>{h.date}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'center', color: poor ? '#f97316' : 'var(--text-primary)', fontWeight: poor ? 600 : 400 }}>
                      {h.sleep_hours ?? '—'}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                      <QualityDots value={h.sleep_quality_1_5} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
