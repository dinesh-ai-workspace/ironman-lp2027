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

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function emptyForm() {
  return {
    date: todayISO(),
    bedtime: '',
    sleep_hours: '',
    resting_hr: '',
    hrv: '',
    soreness_1_5: '',
    stress_1_5: '',
    notes: '',
  }
}

const inputStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  padding: '6px 10px',
  fontSize: '13px',
  width: '100%',
  boxSizing: 'border-box',
}

const labelStyle = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '4px',
  display: 'block',
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

export default function Wellness() {
  const noAPI = typeof window.electronAPI === 'undefined'
  const [range, setRange] = useState(defaultRange())
  const [history, setHistory] = useState([])
  const [sleepTier, setSleepTier] = useState('OK')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

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

  function handleFormChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (noAPI) { setSaveMsg('Not available outside Electron.'); return }
    setSaving(true)
    setSaveMsg('')
    try {
      const entry = {
        date: form.date,
        bedtime: form.bedtime || null,
        sleep_hours: form.sleep_hours !== '' ? parseFloat(form.sleep_hours) : null,
        resting_hr: form.resting_hr !== '' ? parseInt(form.resting_hr) : null,
        hrv: form.hrv !== '' ? parseInt(form.hrv) : null,
        soreness_1_5: form.soreness_1_5 !== '' ? parseInt(form.soreness_1_5) : null,
        stress_1_5: form.stress_1_5 !== '' ? parseInt(form.stress_1_5) : null,
        notes: form.notes || '',
      }
      await window.electronAPI.saveWellness(entry)
      setSaveMsg('Saved.')
      setForm(emptyForm())
      load(range)
    } catch (err) {
      setSaveMsg('Error: ' + err.message)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  const avgHours = history.filter(h => h.sleep_hours != null).length > 0
    ? (history.reduce((s, h) => s + (h.sleep_hours || 0), 0) / history.filter(h => h.sleep_hours != null).length).toFixed(1)
    : null

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div>
      <h1>Wellness Tracker</h1>

      {noAPI && (
        <div style={{ color: 'var(--accent-amber)', marginBottom: '16px', fontSize: '13px' }}>
          Running outside Electron — data unavailable.
        </div>
      )}

      {/* Sleep tier status */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
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

      {/* Manual entry form */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Log Daily Wellness
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <Field label="Date">
              <input type="date" name="date" value={form.date} onChange={handleFormChange} style={inputStyle} required />
            </Field>
            <Field label="Bedtime">
              <input type="time" name="bedtime" value={form.bedtime} onChange={handleFormChange} style={inputStyle} />
            </Field>
            <Field label="Sleep hours">
              <input type="number" name="sleep_hours" value={form.sleep_hours} onChange={handleFormChange}
                style={inputStyle} min="0" max="24" step="0.1" placeholder="e.g. 7.5" />
            </Field>
            <Field label="Resting HR (bpm)">
              <input type="number" name="resting_hr" value={form.resting_hr} onChange={handleFormChange}
                style={inputStyle} min="30" max="120" placeholder="e.g. 52" />
            </Field>
            <Field label="HRV (ms)">
              <input type="number" name="hrv" value={form.hrv} onChange={handleFormChange}
                style={inputStyle} min="0" max="300" placeholder="e.g. 68" />
            </Field>
            <Field label="Soreness 1–5">
              <select name="soreness_1_5" value={form.soreness_1_5} onChange={handleFormChange} style={inputStyle}>
                <option value="">—</option>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Stress 1–5">
              <select name="stress_1_5" value={form.stress_1_5} onChange={handleFormChange} style={inputStyle}>
                <option value="">—</option>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" value={form.notes} onChange={handleFormChange}
              style={{ ...inputStyle, height: '64px', resize: 'vertical' }}
              placeholder="Optional notes…" />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
            <button type="submit" className="btn-primary" disabled={saving} style={{ fontSize: '13px', padding: '7px 18px' }}>
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
            {saveMsg && (
              <span style={{ fontSize: '12px', color: saveMsg.startsWith('Error') ? '#f97316' : 'var(--accent-green)' }}>
                {saveMsg}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* History range picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <input type="date" value={range.start} onChange={e => setStart(e.target.value)} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>to</span>
        <input type="date" value={range.end} onChange={e => setEnd(e.target.value)} />
      </div>

      {/* History table */}
      {history.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No wellness data for this range.</div>
      ) : (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Date</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Bedtime</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Sleep h</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>RHR</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>HRV</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Soreness</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Stress</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map(h => {
                  const poor = (h.sleep_hours != null && h.sleep_hours < 6)
                  return (
                    <tr key={h.id || h.date} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 12px', color: 'var(--text-muted)' }}>{h.date}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'center' }}>{h.bedtime ?? '—'}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'center', color: poor ? '#f97316' : 'var(--text-primary)', fontWeight: poor ? 600 : 400 }}>
                        {h.sleep_hours != null ? h.sleep_hours : '—'}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'center' }}>{h.resting_hr ?? '—'}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'center' }}>{h.hrv ?? '—'}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'center' }}>{h.soreness_1_5 ?? '—'}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'center' }}>{h.stress_1_5 ?? '—'}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.notes ? h.notes.slice(0, 60) + (h.notes.length > 60 ? '…' : '') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
