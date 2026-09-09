import React, { useState, useEffect } from 'react'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function Toast({ msg, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className={`toast toast-${type}`}>
      {type === 'success' ? '✓' : '✗'} {msg}
    </div>
  )
}

const PRESETS = [
  { value: 'garmin', label: 'Garmin Connect' },
  { value: 'other', label: 'Other / Generic' },
]

export default function Logger() {
  const noAPI = typeof window.electronAPI === 'undefined'

  // ─── Session form state ──────────────────────────────────────────────────
  const [form, setForm] = useState({
    date: today(),
    discipline: 'run',
    duration: '',
    distance: '',
    avg_hr: '',
    rpe: '',
    notes: '',
    planned_session_id: '',
    // Bike-specific
    avg_power: '',
    normalized_power: '',
    avg_cadence: '',
    // Swim-specific
    environment: 'pool',
    pool_length_m: '25',
    wetsuit_used: false,
  })

  const [plannedOptions, setPlannedOptions] = useState([])
  const [toast, setToast] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // ─── Import state ────────────────────────────────────────────────────────
  const [importFile, setImportFile] = useState(null)
  const [importPreset, setImportPreset] = useState('garmin')
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  // Load planned sessions for current date + discipline
  useEffect(() => {
    if (noAPI || !form.date || !form.discipline) return
    window.electronAPI.getPlannedSessions({ date: form.date, discipline: form.discipline })
      .then(sessions => setPlannedOptions(sessions || []))
      .catch(() => setPlannedOptions([]))
  }, [form.date, form.discipline])

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (noAPI) { setToast({ msg: 'Running outside Electron', type: 'error' }); return }
    if (!form.date || !form.discipline || !form.duration) {
      setToast({ msg: 'Date, discipline, and duration are required', type: 'error' })
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        date: form.date,
        discipline: form.discipline,
        duration: parseInt(form.duration),
        distance: form.distance ? parseFloat(form.distance) : null,
        avg_hr: form.avg_hr ? parseInt(form.avg_hr) : null,
        rpe: form.rpe ? parseInt(form.rpe) : null,
        notes: form.notes,
        planned_session_id: form.planned_session_id ? parseInt(form.planned_session_id) : null,
        source: 'manual',
      }

      if (form.discipline === 'bike') {
        payload.avg_power = form.avg_power ? parseInt(form.avg_power) : null
        payload.normalized_power = form.normalized_power ? parseInt(form.normalized_power) : null
        payload.avg_cadence = form.avg_cadence ? parseInt(form.avg_cadence) : null
      }

      if (form.discipline === 'swim') {
        payload.environment = form.environment
        payload.pool_length_m = form.pool_length_m ? parseInt(form.pool_length_m) : null
        payload.wetsuit_used = form.wetsuit_used ? 1 : 0
      }

      await window.electronAPI.logSession(payload)
      setToast({ msg: 'Session logged successfully!', type: 'success' })
      setForm(f => ({ ...f, duration: '', distance: '', avg_hr: '', rpe: '', notes: '', planned_session_id: '', avg_power: '', normalized_power: '', avg_cadence: '' }))
    } catch (err) {
      setToast({ msg: err.message || 'Failed to log session', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleChooseFile() {
    if (noAPI) return
    const path = await window.electronAPI.openFileDialog()
    if (path) {
      setImportFile(path)
      setPreview(null)
      setImportResult(null)
    }
  }

  async function handlePreview() {
    if (!importFile) return
    try {
      const result = await window.electronAPI.previewCSV(importFile, importPreset)
      setPreview(result)
    } catch (err) {
      setToast({ msg: err.message, type: 'error' })
    }
  }

  async function handleImport() {
    if (!importFile || !preview) return
    setImporting(true)
    try {
      const result = await window.electronAPI.importCSV(importFile, importPreset, {})
      setImportResult(result)
      setPreview(null)
      setImportFile(null)
      setToast({ msg: `Imported ${result.imported} sessions`, type: 'success' })
    } catch (err) {
      setToast({ msg: err.message, type: 'error' })
    } finally {
      setImporting(false)
    }
  }

  const distLabel = form.discipline === 'swim' ? 'Distance (km)' : form.discipline === 'run' ? 'Distance (mi)' : 'Distance (mi)'

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {noAPI && <div className="warning-banner">Running outside Electron — logging is unavailable.</div>}

      <h1>Log Session</h1>

      {/* Session form */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <h2>New Session</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={form.date} onChange={e => setField('date', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Discipline</label>
              <select value={form.discipline} onChange={e => setField('discipline', e.target.value)}>
                <option value="swim">Swim</option>
                <option value="bike">Bike</option>
                <option value="run">Run</option>
                <option value="strength">Strength</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Duration (minutes) *</label>
              <input type="number" min="1" placeholder="e.g. 60" value={form.duration} onChange={e => setField('duration', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{distLabel} (optional)</label>
              <input type="number" step="0.01" min="0" placeholder="optional" value={form.distance} onChange={e => setField('distance', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Average HR (bpm, optional)</label>
              <input type="number" min="60" max="220" placeholder="optional" value={form.avg_hr} onChange={e => setField('avg_hr', e.target.value)} />
            </div>
            <div className="form-group">
              <label>RPE 1–10 (optional)</label>
              <select value={form.rpe} onChange={e => setField('rpe', e.target.value)}>
                <option value="">— select —</option>
                {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Bike-specific fields */}
          {form.discipline === 'bike' && (
            <div style={{ background: 'var(--bg-base)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bike Metrics</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Avg Power (watts)</label>
                  <input type="number" min="0" placeholder="optional" value={form.avg_power} onChange={e => setField('avg_power', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Normalized Power (watts)</label>
                  <input type="number" min="0" placeholder="optional" value={form.normalized_power} onChange={e => setField('normalized_power', e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ maxWidth: '200px' }}>
                <label>Avg Cadence (rpm)</label>
                <input type="number" min="0" max="200" placeholder="optional" value={form.avg_cadence} onChange={e => setField('avg_cadence', e.target.value)} />
              </div>
            </div>
          )}

          {/* Swim-specific fields */}
          {form.discipline === 'swim' && (
            <div style={{ background: 'var(--bg-base)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Swim Details</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Environment</label>
                  <select value={form.environment} onChange={e => setField('environment', e.target.value)}>
                    <option value="pool">Pool</option>
                    <option value="open_water">Open Water</option>
                  </select>
                </div>
                {form.environment === 'pool' && (
                  <div className="form-group">
                    <label>Pool Length</label>
                    <select value={form.pool_length_m} onChange={e => setField('pool_length_m', e.target.value)}>
                      <option value="25">25m</option>
                      <option value="50">50m</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', flexDirection: 'row', cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={form.wetsuit_used} onChange={e => setField('wetsuit_used', e.target.checked)} />
                  Wetsuit used
                </label>
              </div>
            </div>
          )}

          {/* Link to planned session */}
          {plannedOptions.length > 0 && (
            <div className="form-group">
              <label>Link to Planned Session (optional)</label>
              <select value={form.planned_session_id} onChange={e => setField('planned_session_id', e.target.value)}>
                <option value="">— auto-match or none —</option>
                {plannedOptions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.type} — {s.target_duration}min ({s.importance})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Notes (optional)</label>
            <textarea rows="3" placeholder="How did it feel?" value={form.notes} onChange={e => setField('notes', e.target.value)} />
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Logging...' : 'Log Session'}
          </button>
        </form>
      </div>

      {/* Import section */}
      <div className="card">
        <h2>Import from CSV</h2>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
          <button className="btn btn-secondary" onClick={handleChooseFile} disabled={noAPI}>
            Choose CSV File
          </button>
          {importFile && (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {importFile.split('/').pop()}
            </span>
          )}
        </div>

        {importFile && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ flex: 1, maxWidth: '240px' }}>
              <label>Preset</label>
              <select value={importPreset} onChange={e => setImportPreset(e.target.value)}>
                {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <button className="btn btn-secondary" onClick={handlePreview} style={{ marginTop: '20px' }}>
              Preview Import
            </button>
          </div>
        )}

        {/* Sleep file warning */}
        {preview && !preview.error && preview.detected && preview.detected[0] === 'Sleep Score 7 Days' && (
          <div style={{
            background: 'rgba(245,158,11,0.1)', border: '1px solid var(--accent-amber)',
            borderRadius: '8px', padding: '12px', marginBottom: '16px',
            fontSize: '13px', color: 'var(--accent-amber)',
          }}>
            ⚠ This looks like a Garmin Sleep file. Use the <strong>Wellness tab → Import Sleep from Garmin</strong> instead — sleep data doesn't import here.
          </div>
        )}

        {/* Preview results */}
        {preview && !preview.error && preview.detected && preview.detected[0] !== 'Sleep Score 7 Days' && (
          <div style={{ background: 'var(--bg-base)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <span className="badge badge-blue">{preview.rows_total} total rows</span>
              <span className="badge badge-green">{preview.rows_valid} valid</span>
              {preview.rows_invalid > 0 && <span className="badge badge-red">{preview.rows_invalid} invalid</span>}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Detected columns: {(preview.detected || []).slice(0, 6).join(', ')}{preview.detected && preview.detected.length > 6 ? '...' : ''}
            </div>
            {preview.sample && preview.sample.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      {Object.keys(preview.sample[0]).slice(0, 6).map(k => <th key={k}>{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        {Object.keys(preview.sample[0]).slice(0, 6).map(k => (
                          <td key={k} style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {String(row[k] !== undefined ? row[k] : '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ marginTop: '16px' }}>
              <button className="btn btn-success" onClick={handleImport} disabled={importing}>
                {importing ? 'Importing...' : `Import ${preview.rows_valid} Sessions`}
              </button>
            </div>
          </div>
        )}

        {preview && !preview.error && preview.detected && preview.detected[0] === 'Sleep Score 7 Days' && null}

        {preview && preview.error && (
          <div className="badge badge-red" style={{ display: 'block', padding: '8px 12px', borderRadius: '8px', marginBottom: '16px' }}>
            Error: {preview.error}
          </div>
        )}

        {importResult && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--accent-green)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-green)', marginBottom: '8px' }}>Import Complete</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <span>Imported: <strong style={{ color: 'var(--text-primary)' }}>{importResult.imported}</strong></span>
              <span>Skipped (duplicates): <strong style={{ color: 'var(--text-primary)' }}>{importResult.skipped_duplicates}</strong></span>
              <span>Skipped (invalid): <strong style={{ color: 'var(--text-primary)' }}>{importResult.skipped_invalid}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
