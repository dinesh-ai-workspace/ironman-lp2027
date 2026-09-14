import React, { useState, useEffect } from 'react'

const SIGNAL_LABELS = {
  weight_too_fast:     'Weight dropping too fast (>1 lb/wk avg)',
  persistent_hunger:   'Persistent hunger (4+ days/week elevated/excessive)',
  rising_fatigue:      'Rising fatigue (RHR trending up 3+ days)',
  hrv_declining:       'HRV declining (>5% below prior week avg)',
  strength_declining:  'Strength declining (manual flag)',
  workouts_hard:       'Sessions unusually hard (RPE +15% above 4-wk avg)',
  motivation_declining:'Motivation low (4+ days this week ≤2/5)',
}

const SIGNAL_DOMAIN_LABEL = { A: 'Energy', B: 'Recovery', C: 'Performance' }
const SIGNAL_DOMAIN = {
  weight_too_fast: 'A', persistent_hunger: 'A',
  rising_fatigue: 'B', hrv_declining: 'B', motivation_declining: 'B',
  workouts_hard: 'C', strength_declining: 'C',
}

const PHASE_LABELS = { base: 'Base', build: 'Build', peak: 'Peak', race_taper: 'Race Week / Taper' }
const STATUS_COLOR = { green: 'var(--accent-green)', yellow: 'var(--accent-amber)', red: 'var(--accent-red)' }
const STATUS_EMOJI = { green: '🟢', yellow: '🟡', red: '🔴' }
const CONFIDENCE_COLOR = { high: 'var(--accent-green)', moderate: 'var(--accent-amber)', low: 'var(--accent-red)' }
const CONFIDENCE_LABEL = { high: 'High', moderate: 'Moderate', low: 'Low' }

function getMondayStr() {
  const now = new Date()
  const dow = now.getUTCDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function ConfidenceBadge({ confidence, availableStreams, totalStreams }) {
  if (!confidence) return null
  const color = CONFIDENCE_COLOR[confidence]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
      background: `color-mix(in srgb, ${color} 15%, transparent)`,
      color, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
    }}>
      {CONFIDENCE_LABEL[confidence]} confidence · {availableStreams}/{totalStreams} streams
    </span>
  )
}

export default function FatLoss() {
  const noAPI = typeof window.electronAPI === 'undefined'
  const weekStart = getMondayStr()

  const [check, setCheck] = useState(null)
  const [history, setHistory] = useState([])
  const [checkin, setCheckin] = useState({ waist_in: '', strength_trend: 'stable', training_phase: 'base', notes: '' })
  const [weightEntry, setWeightEntry] = useState('')
  const [weightDate, setWeightDate] = useState(todayStr())
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [weightSaved, setWeightSaved] = useState(false)

  async function load() {
    if (noAPI) { setLoading(false); return }
    const [c, h, ci] = await Promise.all([
      window.electronAPI.stopLossWeeklyCheck(weekStart),
      window.electronAPI.stopLossHistory(12),
      window.electronAPI.stopLossCheckinGet(weekStart),
    ])
    setCheck(c)
    setHistory(h || [])
    if (ci) {
      setCheckin({
        waist_in: ci.waist_in ?? '',
        strength_trend: ci.strength_trend || 'stable',
        training_phase: ci.training_phase || 'base',
        notes: ci.notes || '',
      })
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCheckinSave(e) {
    e.preventDefault()
    if (noAPI) return
    // Run the check first so we can persist the current status with the check-in
    const currentCheck = await window.electronAPI.stopLossWeeklyCheck(weekStart)
    await window.electronAPI.stopLossCheckinSave({
      week_start_date: weekStart,
      waist_in: checkin.waist_in !== '' ? parseFloat(checkin.waist_in) : null,
      strength_trend: checkin.strength_trend,
      training_phase: checkin.training_phase,
      notes: checkin.notes,
      status: currentCheck?.status || 'green',
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    const [c, h] = await Promise.all([
      window.electronAPI.stopLossWeeklyCheck(weekStart),
      window.electronAPI.stopLossHistory(12),
    ])
    setCheck(c)
    setHistory(h || [])
  }

  async function handleWeightSave(e) {
    e.preventDefault()
    if (noAPI || !weightEntry) return
    await window.electronAPI.logWeight(weightDate, parseFloat(weightEntry))
    setWeightSaved(true)
    setWeightEntry('')
    setTimeout(() => setWeightSaved(false), 2000)
    const [c, h] = await Promise.all([
      window.electronAPI.stopLossWeeklyCheck(weekStart),
      window.electronAPI.stopLossHistory(12),
    ])
    setCheck(c)
    setHistory(h || [])
  }

  const statusColor = check ? STATUS_COLOR[check.status] : 'var(--text-muted)'

  return (
    <div>
      <h1>Fat-Loss Stop-Loss</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
        Week of {weekStart} · v4 framework · signals update automatically from logged data
      </p>

      {noAPI && (
        <div style={{ color: 'var(--accent-amber)', marginBottom: '16px', fontSize: '13px' }}>
          Running outside Electron — data unavailable.
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
      ) : (
        <>
          {check?.confidence === 'low' && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '10px 14px', borderRadius: '8px', marginBottom: '20px',
              background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)',
              fontSize: '12px', color: 'var(--text-primary)',
            }}>
              <span style={{ flexShrink: 0 }}>⚠</span>
              <div>
                <strong style={{ color: 'var(--accent-amber)' }}>Low confidence</strong>
                {' — '}only {check.availableStreams} of {check.totalStreams} data streams have enough readings. Green here does not mean Green from full data.
              </div>
            </div>
          )}

          {/* Top row: Status + Signal breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

            {/* Status card */}
            <div className="card" style={{ borderColor: statusColor, borderWidth: check ? '2px' : '1px' }}>
              <h2>This Week's Status</h2>
              {check ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '48px', lineHeight: 1 }}>{STATUS_EMOJI[check.status]}</div>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: statusColor }}>
                        {check.statusLabel}
                      </div>
                      <div style={{ marginTop: '4px' }}>
                        <ConfidenceBadge confidence={check.confidence} availableStreams={check.availableStreams} totalStreams={check.totalStreams} />
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {check.activeSignals.length} of 7 signals active
                        {check.statusReason ? ` · ${check.statusReason}` : ''}
                      </div>
                    </div>
                  </div>

                  {check.status !== 'green' && (
                    <div style={{
                      padding: '10px 12px', borderRadius: '8px', marginBottom: '14px',
                      background: check.status === 'red' ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)',
                      borderLeft: `4px solid ${statusColor}`,
                      fontSize: '13px', lineHeight: 1.6, color: 'var(--text-primary)',
                    }}>
                      <strong>Action:</strong> {check.action}
                    </div>
                  )}
                  {check.status === 'green' && (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                      {check.action}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Phase</div>
                      <div style={{ fontWeight: 600 }}>{PHASE_LABELS[check.phase] || check.phase}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Target loss rate</div>
                      <div style={{ fontWeight: 600 }}>{check.target.min}–{check.target.max} lb/wk</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>This week avg weight</div>
                      <div style={{ fontWeight: 600 }}>{check.thisAvgWeight != null ? `${check.thisAvgWeight} lb` : '—'}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Weekly loss rate</div>
                      <div style={{ fontWeight: 600, color: check.lossRate != null && check.lossRate > 1 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                        {check.lossRate != null ? `${check.lossRate > 0 ? '−' : '+'}${Math.abs(check.lossRate)} lb` : '—'}
                        {check.dataQuality?.weightConfidence === 'moderate' && (
                          <span style={{ fontWeight: 400, color: 'var(--accent-amber)', marginLeft: '4px' }} title="4–5 readings this week — moderate confidence">~</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {check.gainingFlag && (
                    <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(251,191,36,0.1)', borderRadius: '6px', fontSize: '12px', color: 'var(--accent-amber)' }}>
                      ⚠ Gaining weight in {PHASE_LABELS[check.phase]} phase — check whether intake matches actual expenditure.
                    </div>
                  )}

                  {/* Data streams */}
                  <div style={{ marginTop: '14px', padding: '8px 10px', background: 'var(--background)', borderRadius: '6px', fontSize: '11px', lineHeight: 1.8 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Data streams this week</strong>
                    {[
                      { label: 'Weight', ok: check.dataStreams?.weight, detail: `${check.dataQuality.weightDays}/7 days` },
                      { label: 'HRV', ok: check.dataStreams?.hrv, detail: `${check.dataQuality.hrvDays}/7 days` },
                      { label: 'RHR', ok: check.dataStreams?.rhr, detail: `${check.dataQuality.rhrDays}/7 days` },
                      { label: 'RPE', ok: check.dataStreams?.rpe, detail: `${check.dataQuality.rpeSessions} sessions` },
                      { label: 'Motivation', ok: check.dataStreams?.motivation, detail: `${check.dataQuality.motivationDays}/7 days` },
                    ].map(s => (
                      <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', color: s.ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        <span>{s.ok ? '✓' : '✗'} {s.label}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{s.detail}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No data yet for this week.</div>
              )}
            </div>

            {/* Signal breakdown */}
            <div className="card">
              <h2>Signal Breakdown</h2>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                A = Energy deficit &nbsp;·&nbsp; B = Recovery &nbsp;·&nbsp; C = Training performance
              </p>
              {check ? (
                <div>
                  {Object.entries(check.signals).map(([key, active]) => {
                    const domain = SIGNAL_DOMAIN[key]
                    return (
                      <div key={key} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '10px',
                        padding: '7px 0', borderBottom: '1px solid var(--border)',
                        opacity: active ? 1 : 0.4,
                      }}>
                        <div style={{
                          width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
                          background: active ? (check.status === 'red' ? 'var(--accent-red)' : 'var(--accent-amber)') : 'var(--border)',
                        }} />
                        <div style={{ flex: 1, fontSize: '12px', lineHeight: 1.4 }}>
                          <div style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>
                            {SIGNAL_LABELS[key]}
                          </div>
                          {(key === 'strength_declining' || key === 'workouts_hard') && !active && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {key === 'strength_declining' ? 'Set below if declining' : 'Needs ≥3 sessions with RPE logged'}
                            </div>
                          )}
                          {key === 'hrv_declining' && !active && check.dataQuality.hrvDays < 4 && (
                            <div style={{ fontSize: '11px', color: 'var(--accent-amber)' }}>
                              Only {check.dataQuality.hrvDays} readings — needs ≥4 to fire
                            </div>
                          )}
                          {key === 'weight_too_fast' && !active && check.dataQuality.weightConfidence === 'insufficient' && (
                            <div style={{ fontSize: '11px', color: 'var(--accent-amber)' }}>
                              Only {check.dataQuality.weightDays} readings — needs ≥4 in each week
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>
                          {domain}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Log weight and complete the weekly check-in to see signals.</div>
              )}
            </div>
          </div>

          {/* Protein compliance — separate from signals */}
          {check?.proteinAvg != null && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <h2>Protein Compliance <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>(compliance metric — not a stop-loss signal)</span></h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                <span>7-day avg protein</span>
                <span style={{ fontWeight: 600, color: check.proteinAvg >= 150 ? 'var(--accent-green)' : check.proteinAvg >= 130 ? 'var(--accent-amber)' : 'var(--accent-red)' }}>
                  {check.proteinAvg}g / {check.proteinTarget}g target
                  {' '}({Math.round((check.proteinAvg / check.proteinTarget) * 100)}%)
                </span>
              </div>
              <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '4px',
                  width: `${Math.min(100, Math.round((check.proteinAvg / check.proteinTarget) * 100))}%`,
                  background: check.proteinAvg >= 150 ? 'var(--accent-green)' : check.proteinAvg >= 130 ? 'var(--accent-amber)' : 'var(--accent-red)',
                }} />
              </div>
              {check.phase === 'race_taper' && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Race taper: carb/hydration/GI comfort take priority — protein misses not penalised.
                </div>
              )}
            </div>
          )}

          {/* Bottom row: Weekly check-in + Weight entry */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

            {/* Weekly check-in */}
            <div className="card">
              <h2>Weekly Check-in</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Manual signals — set once per week. Phase drives the target loss rate.
              </p>
              <form onSubmit={handleCheckinSave}>
                <div className="form-group">
                  <label>Training Phase</label>
                  <select value={checkin.training_phase} onChange={e => setCheckin(c => ({ ...c, training_phase: e.target.value }))}>
                    <option value="base">Base</option>
                    <option value="build">Build</option>
                    <option value="peak">Peak</option>
                    <option value="race_taper">Race Week / Taper</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Waist Circumference (inches)</label>
                  <input
                    type="number" step="0.25" min="20" max="60"
                    value={checkin.waist_in}
                    onChange={e => setCheckin(c => ({ ...c, waist_in: e.target.value }))}
                    placeholder="e.g. 34.5"
                  />
                </div>
                <div className="form-group">
                  <label>Strength Trend</label>
                  <select value={checkin.strength_trend} onChange={e => setCheckin(c => ({ ...c, strength_trend: e.target.value }))}>
                    <option value="stable">Stable</option>
                    <option value="declining">Declining</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes (optional)</label>
                  <textarea
                    value={checkin.notes}
                    onChange={e => setCheckin(c => ({ ...c, notes: e.target.value }))}
                    placeholder="Anything notable this week..."
                    rows={2}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  {saved ? '✓ Saved' : 'Save Weekly Check-in'}
                </button>
              </form>
            </div>

            {/* Daily weight entry */}
            <div className="card">
              <h2>Log Body Weight</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Log daily (or as often as possible). The weight signal requires ≥4 readings per week to fire — single readings are ignored.
              </p>
              <form onSubmit={handleWeightSave}>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={weightDate} onChange={e => setWeightDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Weight (lb)</label>
                  <input
                    type="number" step="0.1" min="80" max="400"
                    value={weightEntry}
                    onChange={e => setWeightEntry(e.target.value)}
                    placeholder="e.g. 182.5"
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={!weightEntry}>
                  {weightSaved ? '✓ Logged' : 'Log Weight'}
                </button>
              </form>

              {check && check.thisAvgWeight && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'var(--background)', borderRadius: '8px', fontSize: '12px' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>
                    This week avg
                    {check.dataQuality?.weightConfidence === 'moderate' && (
                      <span style={{ color: 'var(--accent-amber)', marginLeft: '6px' }}>~ moderate confidence</span>
                    )}
                    {check.dataQuality?.weightConfidence === 'insufficient' && (
                      <span style={{ color: 'var(--accent-amber)', marginLeft: '6px' }}>⚠ insufficient readings</span>
                    )}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700 }}>{check.thisAvgWeight} lb</div>
                  {check.lastAvgWeight && (
                    <div style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                      Last week avg: {check.lastAvgWeight} lb &nbsp;·&nbsp;
                      Change: <span style={{ color: check.lossRate > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {check.lossRate > 0 ? '−' : '+'}{Math.abs(check.lossRate)} lb
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 12-week trend table */}
          <div className="card">
            <h2>12-Week Trend</h2>
            {history.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No history yet — start logging weight daily.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>Week of</th>
                      <th style={{ padding: '6px 8px' }}>Phase</th>
                      <th style={{ padding: '6px 8px' }}>Avg Weight</th>
                      <th style={{ padding: '6px 8px' }}>Loss Rate</th>
                      <th style={{ padding: '6px 8px' }}>Target Band</th>
                      <th style={{ padding: '6px 8px' }}>Waist</th>
                      <th style={{ padding: '6px 8px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(w => {
                      const inBand = w.lossRate != null && w.lossRate >= w.target.min && w.lossRate <= w.target.max
                      const tooFast = w.lossRate != null && w.lossRate > 1
                      const gaining = w.lossRate != null && w.lossRate < 0
                      return (
                        <tr key={w.weekStart} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{w.weekStart}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>{PHASE_LABELS[w.phase] || w.phase}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600 }}>
                            {w.avgWeight != null ? `${w.avgWeight} lb` : '—'}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600,
                            color: tooFast ? 'var(--accent-red)' : gaining ? 'var(--accent-amber)' : inBand ? 'var(--accent-green)' : 'var(--text-primary)'
                          }}>
                            {w.lossRate != null ? `${w.lossRate > 0 ? '−' : '+'}${Math.abs(w.lossRate)} lb` : '—'}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {w.target.min}–{w.target.max} lb/wk
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            {w.waistIn != null ? `${w.waistIn}"` : '—'}
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
