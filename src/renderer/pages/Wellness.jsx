import React, { useState, useEffect } from 'react'
// Sleep tier evaluation — inline to avoid renderer importing Node-only modules
function evaluateSleepTier(history, today) {
  const isSleepPoor = (w) => !w || (w.sleep_hours != null && w.sleep_hours < 6) || (w.sleep_quality_1_5 != null && w.sleep_quality_1_5 <= 2)
  const recentSeven = history.slice(-7)
  const poorCount = recentSeven.filter(isSleepPoor).length
  const lastTwo = history.slice(-2)
  const consecutivePoor = lastTwo.length === 2 && lastTwo.every(isSleepPoor)
  const todayPoor = isSleepPoor(today)
  const hasPain = today && today.pain_flag
  if (poorCount >= 4 && hasPain) return 'SEVERE'
  if (poorCount >= 4) return 'AMBER'
  if (consecutivePoor) return 'REDUCE'
  if (todayPoor) return 'CAUTION'
  return 'OK'
}

const TIER_COLOR = {
  OK: 'var(--accent-green)',
  CAUTION: 'var(--accent-amber)',
  REDUCE: 'var(--accent-amber)',
  AMBER: '#f97316',
  SEVERE: 'var(--accent-red)',
}

const TIER_DESC = {
  OK: 'Sleep is good — proceed as planned.',
  CAUTION: 'One poor night. Reduce intensity only on high-intensity sessions.',
  REDUCE: '2+ consecutive poor nights. Reduce volume and intensity.',
  AMBER: 'Persistent sleep debt. Hold progression; key sessions at 80%.',
  SEVERE: 'Severe sleep debt + pain flag. Recovery day recommended.',
}

function today() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function RatingSelect({ value, onChange, name }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value ? parseInt(e.target.value) : null)} name={name}>
      <option value="">—</option>
      {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  )
}

export default function Wellness() {
  const noAPI = typeof window.electronAPI === 'undefined'
  const todayStr = today()

  const [form, setForm] = useState({
    date: todayStr,
    sleep_hours: '',
    sleep_quality_1_5: null,
    fatigue_1_5: null,
    soreness_1_5: null,
    pain_flag: false,
    pain_notes: '',
    motivation_1_5: null,
    notes: '',
  })

  const [history, setHistory] = useState([])
  const [sleepTier, setSleepTier] = useState('OK')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sleepImportResult, setSleepImportResult] = useState(null)
  const [sleepImporting, setSleepImporting] = useState(false)

  useEffect(() => {
    if (noAPI) { setLoading(false); return }
    Promise.all([
      window.electronAPI.getWellness(todayStr),
      window.electronAPI.getWellnessHistory(14),
    ]).then(([todayEntry, hist]) => {
      if (todayEntry) {
        setForm({
          date: todayEntry.date,
          sleep_hours: todayEntry.sleep_hours ?? '',
          sleep_quality_1_5: todayEntry.sleep_quality_1_5,
          fatigue_1_5: todayEntry.fatigue_1_5,
          soreness_1_5: todayEntry.soreness_1_5,
          pain_flag: !!todayEntry.pain_flag,
          pain_notes: todayEntry.pain_notes || '',
          motivation_1_5: todayEntry.motivation_1_5,
          notes: todayEntry.notes || '',
        })
      }
      setHistory(hist || [])
      // Compute sleep tier from history + today
      try {
        const tier = evaluateSleepTier(hist || [], todayEntry || form)
        setSleepTier(tier)
      } catch {
        setSleepTier('OK')
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSleepImport() {
    if (noAPI) return
    setSleepImporting(true)
    setSleepImportResult(null)
    try {
      const filePath = await window.electronAPI.openFileDialog()
      if (!filePath) { setSleepImporting(false); return }
      const result = await window.electronAPI.importSleep(filePath)
      setSleepImportResult(result)
      if (!result.error) {
        const hist = await window.electronAPI.getWellnessHistory(14)
        setHistory(hist || [])
        try {
          const tier = evaluateSleepTier(hist || [], form)
          setSleepTier(tier)
        } catch { setSleepTier('OK') }
      }
    } catch (err) {
      setSleepImportResult({ error: err.message })
    } finally {
      setSleepImporting(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (noAPI) return
    const entry = {
      ...form,
      sleep_hours: form.sleep_hours !== '' ? parseFloat(form.sleep_hours) : null,
    }
    await window.electronAPI.saveWellness(entry)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)

    const hist = await window.electronAPI.getWellnessHistory(14)
    setHistory(hist || [])
    try {
      const tier = evaluateSleepTier(hist || [], entry)
      setSleepTier(tier)
    } catch { setSleepTier('OK') }
  }

  return (
    <div>
      <h1>Daily Wellness</h1>

      {noAPI && (
        <div style={{ color: 'var(--accent-amber)', marginBottom: '16px', fontSize: '13px' }}>
          Running outside Electron — wellness data unavailable.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Check-in form */}
        <div className="card">
          <h2>Today's Check-in</h2>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>

            <div className="form-group">
              <label>Sleep Hours</label>
              <input
                type="number" min="0" max="12" step="0.5"
                value={form.sleep_hours}
                onChange={e => set('sleep_hours', e.target.value)}
                placeholder="e.g. 7.5"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label>Sleep Quality (1–5)</label>
                <RatingSelect value={form.sleep_quality_1_5} onChange={v => set('sleep_quality_1_5', v)} />
              </div>
              <div className="form-group">
                <label>Fatigue (1–5)</label>
                <RatingSelect value={form.fatigue_1_5} onChange={v => set('fatigue_1_5', v)} />
              </div>
              <div className="form-group">
                <label>Soreness (1–5)</label>
                <RatingSelect value={form.soreness_1_5} onChange={v => set('soreness_1_5', v)} />
              </div>
              <div className="form-group">
                <label>Motivation (1–5)</label>
                <RatingSelect value={form.motivation_1_5} onChange={v => set('motivation_1_5', v)} />
              </div>
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox" id="pain_flag"
                checked={form.pain_flag}
                onChange={e => set('pain_flag', e.target.checked)}
                style={{ width: 'auto' }}
              />
              <label htmlFor="pain_flag" style={{ marginBottom: 0, cursor: 'pointer', color: form.pain_flag ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                Pain or injury concern
              </label>
            </div>

            {form.pain_flag && (
              <div className="form-group">
                <label>Pain Notes</label>
                <textarea
                  value={form.pain_notes}
                  onChange={e => set('pain_notes', e.target.value)}
                  placeholder="Where, severity, what makes it worse..."
                  rows={2}
                />
              </div>
            )}

            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="How are you feeling overall?"
                rows={2}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              {saved ? '✓ Saved' : 'Save Check-in'}
            </button>
          </form>
        </div>

        {/* Sleep tier + history */}
        <div>
          <div className="card" style={{ marginBottom: '16px' }}>
            <h2>Recovery Status</h2>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px',
            }}>
              <div style={{
                width: '14px', height: '14px', borderRadius: '50%',
                background: TIER_COLOR[sleepTier] || 'var(--text-muted)',
              }} />
              <span style={{ fontWeight: 700, fontSize: '18px', color: TIER_COLOR[sleepTier] }}>
                {sleepTier}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {TIER_DESC[sleepTier]}
            </p>
          </div>

          <div className="card">
            <h2>Last 14 Days</h2>
            {history.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No wellness history yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 4px' }}>Date</th>
                      <th style={{ padding: '6px 4px' }}>Sleep</th>
                      <th style={{ padding: '6px 4px' }}>Qual</th>
                      <th style={{ padding: '6px 4px' }}>Fat</th>
                      <th style={{ padding: '6px 4px' }}>Sor</th>
                      <th style={{ padding: '6px 4px' }}>Mot</th>
                      <th style={{ padding: '6px 4px' }}>Pain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 4px', color: 'var(--text-muted)' }}>{h.date}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center' }}>{h.sleep_hours ?? '—'}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center' }}>{h.sleep_quality_1_5 ?? '—'}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center' }}>{h.fatigue_1_5 ?? '—'}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center' }}>{h.soreness_1_5 ?? '—'}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center' }}>{h.motivation_1_5 ?? '—'}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                          {h.pain_flag ? <span style={{ color: 'var(--accent-red)' }}>⚠</span> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Garmin sleep import */}
      <div className="card" style={{ marginTop: '24px' }}>
        <h2>Import Sleep from Garmin</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Export from Garmin Connect → Health Stats → Sleep → Export. Supports 7-day and 1-day formats.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleSleepImport}
            disabled={noAPI || sleepImporting}
          >
            {sleepImporting ? 'Importing...' : 'Choose Garmin Sleep CSV'}
          </button>
        </div>

        {sleepImportResult && !sleepImportResult.error && (
          <div style={{
            marginTop: '12px', background: 'rgba(34,197,94,0.1)',
            border: '1px solid var(--accent-green)', borderRadius: '8px', padding: '12px',
          }}>
            <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
              ✓ Imported {sleepImportResult.imported} day{sleepImportResult.imported !== 1 ? 's' : ''}
            </span>
            {sleepImportResult.dates && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '12px' }}>
                {sleepImportResult.dates.join(', ')}
              </span>
            )}
          </div>
        )}

        {sleepImportResult && sleepImportResult.error && (
          <div style={{
            marginTop: '12px', background: 'rgba(239,68,68,0.1)',
            border: '1px solid var(--accent-red)', borderRadius: '8px', padding: '12px',
            color: 'var(--accent-red)', fontSize: '13px',
          }}>
            ✗ {sleepImportResult.error}
          </div>
        )}
      </div>
    </div>
  )
}
