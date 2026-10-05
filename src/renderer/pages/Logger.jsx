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

// A3 swap validation — mirrors validateSwap in src/core/scoring/index.js
const _IMP_ORDER = { key: 0, supporting: 1, optional: 2 }
function validateSwapUI(replacedPlan, loggedDate, loggedDisc, weekPlans) {
  function weekStart(ds) {
    const d = new Date(ds + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7)
    return d.toISOString().slice(0, 10)
  }
  if (weekStart(loggedDate) !== weekStart(replacedPlan.date)) {
    return 'Swaps must stay within the same week.'
  }
  const sameDayPlan = weekPlans.find(p =>
    p.discipline === loggedDisc && p.date === loggedDate &&
    p.importance !== 'optional' && p.id !== replacedPlan.id
  )
  if (sameDayPlan && (_IMP_ORDER[sameDayPlan.importance] ?? 3) <= (_IMP_ORDER[replacedPlan.importance] ?? 3)) {
    return 'A session exists for this discipline on the same day with equal or higher priority than the replaced session.'
  }
  if (replacedPlan.importance === 'key') {
    const weeklyForDisc = weekPlans.filter(p =>
      p.discipline === loggedDisc && p.importance !== 'optional' && p.id !== replacedPlan.id
    )
    if (weeklyForDisc.length > 0) {
      return 'A KEY session can only be replaced by a KEY-tier effort in the same discipline or an equivalent KEY session.'
    }
  }
  return null
}

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
    is_brick: false,
    reason: 'completed',
    swap_planned_id: '',
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
  const [weekPlans, setWeekPlans] = useState([])
  const [toast, setToast] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Load planned sessions for current date + discipline
  useEffect(() => {
    if (noAPI || !form.date || !form.discipline) return
    window.electronAPI.getPlannedSessions({ date: form.date, discipline: form.discipline })
      .then(sessions => setPlannedOptions(sessions || []))
      .catch(() => setPlannedOptions([]))
  }, [form.date, form.discipline])

  // Load all week plans when reason = 'swapped'
  useEffect(() => {
    if (noAPI || form.reason !== 'swapped') { setWeekPlans([]); return }
    window.electronAPI.getWeekPlannedSessions(form.date)
      .then(plans => setWeekPlans(plans || []))
      .catch(() => setWeekPlans([]))
  }, [form.reason, form.date])

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

    // A3: swap validation
    if (form.reason === 'swapped') {
      if (!form.swap_planned_id) {
        setToast({ msg: 'Select the planned session being replaced.', type: 'error' })
        return
      }
      const replacedPlan = weekPlans.find(p => p.id === parseInt(form.swap_planned_id))
      if (!replacedPlan) {
        setToast({ msg: 'Selected planned session not found.', type: 'error' })
        return
      }
      const swapErr = validateSwapUI(replacedPlan, form.date, form.discipline, weekPlans)
      if (swapErr) {
        setToast({ msg: swapErr, type: 'error' })
        return
      }
    }

    setSubmitting(true)
    try {
      const dur = parseInt(form.duration) || 0
      const selectedPlan = plannedOptions.find(s => s.id === parseInt(form.planned_session_id))
      const isSwap = form.reason === 'swapped'
      const effectiveReason = isSwap
        ? 'swapped'
        : (dur === 0 || !form.duration || (selectedPlan && dur < selectedPlan.target_duration))
          ? (form.reason || 'completed')
          : 'completed'

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
        reason: (effectiveReason !== 'completed') ? effectiveReason : null,
      }

      if (isSwap && form.swap_planned_id) {
        const replacedPlan = weekPlans.find(p => p.id === parseInt(form.swap_planned_id))
        payload.swap_planned_id = parseInt(form.swap_planned_id)
        payload.swap_planned_discipline = replacedPlan?.discipline || null
        payload.planned_session_id = null
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

      payload.is_brick = form.is_brick ? 1 : 0

      await window.electronAPI.logSession(payload)
      setToast({ msg: 'Session logged successfully!', type: 'success' })
      setForm(f => ({ ...f, duration: '', distance: '', avg_hr: '', rpe: '', notes: '', planned_session_id: '', swap_planned_id: '', avg_power: '', normalized_power: '', avg_cadence: '', is_brick: false, reason: 'completed' }))
    } catch (err) {
      setToast({ msg: err.message || 'Failed to log session', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }


  const distLabel = form.discipline === 'swim' ? 'Distance (km)' : form.discipline === 'run' ? 'Distance (mi)' : 'Distance (km)'

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

          {/* Brick flag */}
          {(form.discipline === 'bike' || form.discipline === 'run') && (
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', flexDirection: 'row', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={form.is_brick} onChange={e => setField('is_brick', e.target.checked)} />
                Brick session (bike + run same day)
              </label>
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

          {/* Reason */}
          <div className="form-group">
            <label>Reason</label>
            <select value={form.reason} onChange={e => setField('reason', e.target.value)}>
              <option value="completed">completed</option>
              <option value="life">life (schedule / travel / work)</option>
              <option value="equipment">equipment (gear failure / pool closed / weather)</option>
              <option value="illness">illness</option>
              <option value="pain">pain</option>
              <option value="coach-adjusted">coach-adjusted</option>
              <option value="swapped">swapped (different discipline)</option>
              <option value="other">other</option>
            </select>
          </div>

          {/* Swap replacement picker — A1 */}
          {form.reason === 'swapped' && (
            <div className="form-group">
              <label>Replaced Planned Session *</label>
              <select value={form.swap_planned_id} onChange={e => setField('swap_planned_id', e.target.value)}>
                <option value="">— select session being replaced —</option>
                {weekPlans.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.date} {s.discipline} ({s.importance}) {s.target_duration} min
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

    </div>
  )
}
