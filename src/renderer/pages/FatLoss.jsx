import React, { useState, useEffect } from 'react'

const STATUS_COLOR = { green: 'var(--accent-green)', yellow: 'var(--accent-amber)', red: 'var(--accent-red)' }
const STATUS_EMOJI = { green: '🟢', yellow: '🟡', red: '🔴' }
const PHASE_LABELS = { base: 'Base', build: 'Build', peak: 'Peak', race_taper: 'Race Week / Taper' }

function getMondayStr() {
  const now = new Date()
  const dow = now.getUTCDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function Tile({ title, value, unit, trend, trendLabel, trendGood, ok, noData }) {
  const dotColor = noData ? 'var(--text-muted)' : ok ? 'var(--accent-green)' : 'var(--accent-red)'
  const trendColor = noData || trendGood == null
    ? 'var(--text-muted)'
    : trendGood ? 'var(--accent-green)' : 'var(--accent-red)'
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor }} />
      </div>
      {noData ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No data</div>
      ) : (
        <>
          <div style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1 }}>
            {value}<span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '3px' }}>{unit}</span>
          </div>
          <div style={{ fontSize: '12px', color: trendColor, fontWeight: 500 }}>
            {trend} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{trendLabel}</span>
          </div>
        </>
      )}
    </div>
  )
}

export default function FatLoss() {
  const noAPI = typeof window.electronAPI === 'undefined'
  const weekStart = getMondayStr()

  const [check, setCheck] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (noAPI) { setLoading(false); return }
    const [c, h] = await Promise.all([
      window.electronAPI.stopLossWeeklyCheck(weekStart),
      window.electronAPI.stopLossHistory(12),
    ])
    setCheck(c)
    setHistory(h || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <h1>BFP Tracker</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
        Week of {weekStart} · updates automatically from Renpho and Garmin imports
      </p>

      {noAPI && <div style={{ color: 'var(--accent-amber)', marginBottom: '16px', fontSize: '13px' }}>Running outside Electron — data unavailable.</div>}

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
      ) : !check ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No data yet — import Renpho and Garmin data.</div>
      ) : (
        <>
          {/* Overall status bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 16px', borderRadius: '8px', marginBottom: '24px',
            background: check.status === 'red' ? 'rgba(239,68,68,0.08)' : check.status === 'yellow' ? 'rgba(251,191,36,0.08)' : 'rgba(34,197,94,0.08)',
            border: `1px solid ${STATUS_COLOR[check.status]}`,
          }}>
            <span style={{ fontSize: '20px' }}>{STATUS_EMOJI[check.status]}</span>
            <div>
              <span style={{ fontWeight: 700, color: STATUS_COLOR[check.status] }}>{check.statusLabel}</span>
              {check.statusReason && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>{check.statusReason}</span>}
            </div>
          </div>

          {/* 4 metric tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

            <Tile
              title="Weight"
              value={check.thisAvgWeight ?? '—'}
              unit="lb"
              trend={check.lossRate == null ? '—' : check.lossRate > 0 ? `↓ ${check.lossRate} lb/wk` : check.lossRate < 0 ? `↑ ${Math.abs(check.lossRate)} lb/wk` : '→ flat'}
              trendLabel={check.dataQuality.weightDays > 0 ? `(${check.dataQuality.weightDays}/7 days)` : ''}
              trendGood={check.lossRate == null ? null : check.lossRate > 0}
              ok={!check.signals.weight_not_losing}
              noData={check.thisAvgWeight == null}
            />

            <Tile
              title="Body Fat %"
              value={check.thisBFPAvg ?? '—'}
              unit="%"
              trend={
                check.thisBFPAvg == null || check.lastBFPAvg == null ? '—'
                : check.thisBFPAvg < check.lastBFPAvg ? `↓ ${(check.lastBFPAvg - check.thisBFPAvg).toFixed(1)}% vs last wk`
                : check.thisBFPAvg > check.lastBFPAvg ? `↑ ${(check.thisBFPAvg - check.lastBFPAvg).toFixed(1)}% vs last wk`
                : '→ flat vs last wk'
              }
              trendLabel={check.dataQuality.bfpDays > 0 ? `(${check.dataQuality.bfpDays}/7 days)` : ''}
              trendGood={check.thisBFPAvg == null || check.lastBFPAvg == null ? null : check.thisBFPAvg < check.lastBFPAvg}
              ok={!check.signals.bfp_not_losing}
              noData={check.thisBFPAvg == null}
            />

            <Tile
              title="HRV"
              value={check.thisHRVAvg ?? '—'}
              unit="ms"
              trend={
                check.thisHRVAvg == null || check.lastHRVAvg == null ? '—'
                : check.thisHRVAvg >= check.lastHRVAvg ? `↑ vs last wk`
                : `↓ ${Math.round((1 - check.thisHRVAvg / check.lastHRVAvg) * 100)}% vs last wk`
              }
              trendLabel={check.dataQuality.hrvDays > 0 ? `(${check.dataQuality.hrvDays}/7 days)` : ''}
              trendGood={check.thisHRVAvg == null || check.lastHRVAvg == null ? null : check.thisHRVAvg >= check.lastHRVAvg}
              ok={!check.signals.hrv_declining}
              noData={check.thisHRVAvg == null}
            />

            <Tile
              title="Resting HR"
              value={check.thisRHRAvg ?? '—'}
              unit="bpm"
              trend={
                check.thisRHRAvg == null || check.lastRHRAvg == null ? '—'
                : check.thisRHRAvg <= check.lastRHRAvg ? `↓ or stable vs last wk`
                : `↑ ${check.thisRHRAvg - check.lastRHRAvg} bpm vs last wk`
              }
              trendLabel={check.dataQuality.rhrDays > 0 ? `(${check.dataQuality.rhrDays}/7 days)` : ''}
              trendGood={check.thisRHRAvg == null || check.lastRHRAvg == null ? null : check.thisRHRAvg <= check.lastRHRAvg}
              ok={!check.signals.rising_fatigue}
              noData={check.thisRHRAvg == null}
            />
          </div>

          {/* Protein compliance */}
          {check.proteinAvg != null && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <h2>Protein Compliance</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                <span>7-day avg protein</span>
                <span style={{ fontWeight: 600, color: check.proteinAvg >= 150 ? 'var(--accent-green)' : check.proteinAvg >= 130 ? 'var(--accent-amber)' : 'var(--accent-red)' }}>
                  {check.proteinAvg}g / {check.proteinTarget}g target ({Math.round((check.proteinAvg / check.proteinTarget) * 100)}%)
                </span>
              </div>
              <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '4px',
                  width: `${Math.min(100, Math.round((check.proteinAvg / check.proteinTarget) * 100))}%`,
                  background: check.proteinAvg >= 150 ? 'var(--accent-green)' : check.proteinAvg >= 130 ? 'var(--accent-amber)' : 'var(--accent-red)',
                }} />
              </div>
            </div>
          )}

          {/* 12-week trend table */}
          <div className="card">
            <h2>12-Week Trend</h2>
            {history.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No history yet — import Renpho data.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>Week of</th>
                      <th style={{ padding: '6px 8px' }}>Avg Weight</th>
                      <th style={{ padding: '6px 8px' }}>Body Fat %</th>
                      <th style={{ padding: '6px 8px' }}>Loss Rate</th>
                      <th style={{ padding: '6px 8px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((w, i, arr) => {
                      const prev = arr[i + 1]
                      const bfpUp   = w.avgBFP != null && prev?.avgBFP != null && w.avgBFP > prev.avgBFP
                      const bfpDown = w.avgBFP != null && prev?.avgBFP != null && w.avgBFP < prev.avgBFP
                      const tooFast = w.lossRate != null && w.lossRate > 1
                      const gaining = w.lossRate != null && w.lossRate < 0
                      const inBand  = w.lossRate != null && w.lossRate >= w.target.min && w.lossRate <= w.target.max
                      return (
                        <tr key={w.weekStart} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{w.weekStart}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600 }}>
                            {w.avgWeight != null ? `${w.avgWeight} lb` : '—'}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600,
                            color: bfpUp ? 'var(--accent-red)' : bfpDown ? 'var(--accent-green)' : 'var(--text-primary)'
                          }}>
                            {w.avgBFP != null ? `${w.avgBFP}%` : '—'}
                            {bfpUp && <span style={{ fontSize: '10px', marginLeft: '3px' }}>↑</span>}
                            {bfpDown && <span style={{ fontSize: '10px', marginLeft: '3px' }}>↓</span>}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600,
                            color: tooFast ? 'var(--accent-red)' : gaining ? 'var(--accent-amber)' : inBand ? 'var(--accent-green)' : 'var(--text-primary)'
                          }}>
                            {w.lossRate != null ? `${w.lossRate > 0 ? '−' : '+'}${Math.abs(w.lossRate)} lb` : '—'}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '14px' }}>
                            {w.status ? STATUS_EMOJI[w.status] : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
