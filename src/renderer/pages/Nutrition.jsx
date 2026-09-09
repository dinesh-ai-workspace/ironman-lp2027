import React, { useState, useEffect } from 'react'

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Pre-Workout', 'During Workout', 'Post-Workout', 'Other']

function today() { return new Date().toISOString().slice(0, 10) }

function MacroBar({ label, value, target, color }) {
  const pct = target ? Math.min((value / target) * 100, 100) : 0
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span>{Math.round(value || 0)}{target ? ` / ${target}g` : 'g'}</span>
      </div>
      <div style={{ height: '6px', background: 'var(--bg-base)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

function NumInput({ label, value, onChange, unit, placeholder }) {
  return (
    <div className="form-group">
      <label>{label}{unit ? ` (${unit})` : ''}</label>
      <input type="number" min="0" step="1" placeholder={placeholder || '0'}
        value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

export default function Nutrition() {
  const noAPI = typeof window.electronAPI === 'undefined'
  const todayStr = today()

  const [activeTab, setActiveTab] = useState('log')
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [dayEntries, setDayEntries] = useState([])
  const [history, setHistory] = useState([])
  const [targets, setTargets] = useState({ calories: '', protein_g: '', carbs_g: '', fat_g: '' })
  const [racePlan, setRacePlan] = useState({ carbs_per_hour_g: 60, fluids_ml_per_hour: 500, sodium_mg_per_hour: 500, gel_every_min: 45, notes: '' })
  const [form, setForm] = useState({ meal: 'Breakfast', food_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '', sodium_mg: '' })
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const [saved, setSaved] = useState('')

  function flash(msg) { setSaved(msg); setTimeout(() => setSaved(''), 2000) }

  async function loadDay(date) {
    if (noAPI) return
    const entries = await window.electronAPI.getNutritionDay(date)
    setDayEntries(entries || [])
  }

  async function loadAll() {
    if (noAPI) return
    const [hist, tgt, rp] = await Promise.all([
      window.electronAPI.getNutritionHistory(14),
      window.electronAPI.getNutritionTargets(),
      window.electronAPI.getRacePlan(),
    ])
    setHistory(hist || [])
    if (tgt) setTargets({ calories: tgt.calories || '', protein_g: tgt.protein_g || '', carbs_g: tgt.carbs_g || '', fat_g: tgt.fat_g || '' })
    if (rp) setRacePlan({ carbs_per_hour_g: rp.carbs_per_hour_g, fluids_ml_per_hour: rp.fluids_ml_per_hour, sodium_mg_per_hour: rp.sodium_mg_per_hour, gel_every_min: rp.gel_every_min, notes: rp.notes || '' })
  }

  useEffect(() => { loadAll(); loadDay(selectedDate) }, [])
  useEffect(() => { loadDay(selectedDate) }, [selectedDate])

  const totals = dayEntries.reduce((acc, e) => ({
    calories: acc.calories + (e.calories || 0),
    protein_g: acc.protein_g + (e.protein_g || 0),
    carbs_g: acc.carbs_g + (e.carbs_g || 0),
    fat_g: acc.fat_g + (e.fat_g || 0),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })

  async function handleAddEntry(e) {
    e.preventDefault()
    if (noAPI) return
    await window.electronAPI.logNutrition({ ...form, date: selectedDate, source: 'manual' })
    setForm(f => ({ ...f, food_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '', sodium_mg: '' }))
    loadDay(selectedDate)
    loadAll()
  }

  async function handleDelete(id) {
    if (noAPI) return
    await window.electronAPI.deleteNutrition(id)
    loadDay(selectedDate)
    loadAll()
  }

  async function handleSaveTargets(e) {
    e.preventDefault()
    if (noAPI) return
    await window.electronAPI.saveNutritionTargets(targets)
    flash('Targets saved')
  }

  async function handleSaveRacePlan(e) {
    e.preventDefault()
    if (noAPI) return
    await window.electronAPI.saveRacePlan(racePlan)
    flash('Race plan saved')
  }

  async function handleImportMFP() {
    if (noAPI) return
    setImporting(true)
    setImportResult(null)
    try {
      const filePath = await window.electronAPI.openFileDialog()
      if (!filePath) { setImporting(false); return }
      const result = await window.electronAPI.importMFP(filePath)
      setImportResult(result)
      if (!result.error) { loadDay(selectedDate); loadAll() }
    } catch (err) {
      setImportResult({ error: err.message })
    } finally {
      setImporting(false)
    }
  }

  const tabs = [
    { key: 'log', label: 'Daily Log' },
    { key: 'targets', label: 'Targets' },
    { key: 'race', label: 'Race Plan' },
  ]

  return (
    <div>
      <h1>Nutrition</h1>

      {noAPI && <div style={{ color: 'var(--accent-amber)', marginBottom: '16px', fontSize: '13px' }}>Running outside Electron.</div>}
      {saved && <div style={{ color: 'var(--accent-green)', marginBottom: '12px', fontSize: '13px' }}>✓ {saved}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px 16px',
              fontSize: '14px', fontWeight: 500,
              color: activeTab === t.key ? 'var(--accent-blue)' : 'var(--text-muted)',
              borderBottom: activeTab === t.key ? '2px solid var(--accent-blue)' : '2px solid transparent',
              marginBottom: '-1px',
            }}>{t.label}</button>
        ))}
      </div>

      {/* ── DAILY LOG TAB ─────────────────────────────────────────────── */}
      {activeTab === 'log' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
          <div>
            {/* Date selector + macro summary */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px' }}>Date</label>
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                    style={{ marginTop: '4px' }} />
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: targets.calories && totals.calories > targets.calories ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
                    {Math.round(totals.calories)}
                    {targets.calories ? <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>/ {targets.calories} kcal</span> : <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}> kcal</span>}
                  </div>
                </div>
              </div>
              <MacroBar label="Protein" value={totals.protein_g} target={targets.protein_g} color="#a78bfa" />
              <MacroBar label="Carbs" value={totals.carbs_g} target={targets.carbs_g} color="#fb923c" />
              <MacroBar label="Fat" value={totals.fat_g} target={targets.fat_g} color="#38bdf8" />
            </div>

            {/* Entries list */}
            {dayEntries.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '8px 0' }}>No entries for this date.</div>
            ) : (
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Meal</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px' }}>Food</th>
                      <th style={{ textAlign: 'right', padding: '10px 8px' }}>kcal</th>
                      <th style={{ textAlign: 'right', padding: '10px 8px' }}>Protein</th>
                      <th style={{ textAlign: 'right', padding: '10px 8px' }}>Carbs</th>
                      <th style={{ textAlign: 'right', padding: '10px 8px' }}>Fat</th>
                      <th style={{ padding: '10px 8px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayEntries.map(e => (
                      <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>{e.meal}</td>
                        <td style={{ padding: '8px 8px' }}>{e.food_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{e.calories != null ? Math.round(e.calories) : '—'}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'right', color: '#a78bfa' }}>{e.protein_g != null ? `${Math.round(e.protein_g)}g` : '—'}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'right', color: '#fb923c' }}>{e.carbs_g != null ? `${Math.round(e.carbs_g)}g` : '—'}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'right', color: '#38bdf8' }}>{e.fat_g != null ? `${Math.round(e.fat_g)}g` : '—'}</td>
                        <td style={{ padding: '8px 8px' }}>
                          <button onClick={() => handleDelete(e.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', padding: '2px 6px' }}>✕</button>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                      <td colSpan={2} style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>Total</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>{Math.round(totals.calories)}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: '#a78bfa' }}>{Math.round(totals.protein_g)}g</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: '#fb923c' }}>{Math.round(totals.carbs_g)}g</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: '#38bdf8' }}>{Math.round(totals.fat_g)}g</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right column: add form + import */}
          <div>
            <div className="card" style={{ marginBottom: '16px' }}>
              <h3>Add Entry</h3>
              <form onSubmit={handleAddEntry}>
                <div className="form-group">
                  <label>Meal</label>
                  <select value={form.meal} onChange={e => setForm(f => ({ ...f, meal: e.target.value }))}>
                    {MEALS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Food / Description</label>
                  <input type="text" placeholder="e.g. Oatmeal with banana" value={form.food_name}
                    onChange={e => setForm(f => ({ ...f, food_name: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <NumInput label="Calories" unit="kcal" value={form.calories} onChange={v => setForm(f => ({ ...f, calories: v }))} />
                  <NumInput label="Protein" unit="g" value={form.protein_g} onChange={v => setForm(f => ({ ...f, protein_g: v }))} />
                  <NumInput label="Carbs" unit="g" value={form.carbs_g} onChange={v => setForm(f => ({ ...f, carbs_g: v }))} />
                  <NumInput label="Fat" unit="g" value={form.fat_g} onChange={v => setForm(f => ({ ...f, fat_g: v }))} />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Add</button>
              </form>
            </div>

            <div className="card">
              <h3>Import from MyFitnessPal</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
                Export from MFP: More → Nutrition → Weekly Report → Export, then select the Nutrition-Summary CSV.
              </p>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleImportMFP} disabled={importing || noAPI}>
                {importing ? 'Importing...' : 'Choose MFP Nutrition CSV'}
              </button>
              {importResult && !importResult.error && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--accent-green)' }}>
                  ✓ Imported {importResult.imported} entries, skipped {importResult.skipped}
                </div>
              )}
              {importResult && importResult.error && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--accent-red)' }}>✗ {importResult.error}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TARGETS TAB ───────────────────────────────────────────────── */}
      {activeTab === 'targets' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '24px' }}>
          <div className="card">
            <h2>Daily Macro Targets</h2>
            <form onSubmit={handleSaveTargets}>
              <NumInput label="Calories" unit="kcal/day" value={targets.calories} onChange={v => setTargets(t => ({ ...t, calories: v }))} />
              <NumInput label="Protein" unit="g/day" value={targets.protein_g} onChange={v => setTargets(t => ({ ...t, protein_g: v }))} />
              <NumInput label="Carbohydrates" unit="g/day" value={targets.carbs_g} onChange={v => setTargets(t => ({ ...t, carbs_g: v }))} />
              <NumInput label="Fat" unit="g/day" value={targets.fat_g} onChange={v => setTargets(t => ({ ...t, fat_g: v }))} />
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Save Targets</button>
            </form>
          </div>

          <div className="card">
            <h2>14-Day History</h2>
            {history.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No nutrition history yet.</div>
            ) : (
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Date</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>kcal</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#a78bfa' }}>Protein</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#fb923c' }}>Carbs</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#38bdf8' }}>Fat</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.date} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{h.date}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600,
                        color: targets.calories && h.total_calories > targets.calories ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
                        {Math.round(h.total_calories || 0)}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#a78bfa' }}>{Math.round(h.total_protein || 0)}g</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#fb923c' }}>{Math.round(h.total_carbs || 0)}g</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#38bdf8' }}>{Math.round(h.total_fat || 0)}g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── RACE PLAN TAB ─────────────────────────────────────────────── */}
      {activeTab === 'race' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '24px' }}>
          <div className="card">
            <h2>Race-Day Fueling Plan</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
              Target: 60–90g carbs/hr for Ironman. Start conservative and increase through training. Fluids separate from calories.
            </p>
            <form onSubmit={handleSaveRacePlan}>
              <NumInput label="Carbs per hour" unit="g/hr" value={racePlan.carbs_per_hour_g}
                onChange={v => setRacePlan(p => ({ ...p, carbs_per_hour_g: v }))} placeholder="60" />
              <NumInput label="Fluids per hour" unit="ml/hr" value={racePlan.fluids_ml_per_hour}
                onChange={v => setRacePlan(p => ({ ...p, fluids_ml_per_hour: v }))} placeholder="500" />
              <NumInput label="Sodium per hour" unit="mg/hr" value={racePlan.sodium_mg_per_hour}
                onChange={v => setRacePlan(p => ({ ...p, sodium_mg_per_hour: v }))} placeholder="500" />
              <NumInput label="Fuel every" unit="min" value={racePlan.gel_every_min}
                onChange={v => setRacePlan(p => ({ ...p, gel_every_min: v }))} placeholder="45" />
              <div className="form-group">
                <label>Notes</label>
                <textarea rows={3} value={racePlan.notes} placeholder="Gel brand, drink mix, special foods..."
                  onChange={e => setRacePlan(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Save Race Plan</button>
            </form>
          </div>

          <div className="card">
            <h2>Ironman LP Fueling Reference</h2>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
              <p style={{ marginBottom: '12px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Bike (5.5–6 hrs):</strong><br />
                {racePlan.carbs_per_hour_g}g carbs/hr = ~{Math.round(racePlan.carbs_per_hour_g * 5.75)} total carbs on bike<br />
                Every {racePlan.gel_every_min} min = {Math.round(360 / racePlan.gel_every_min)} fueling stops<br />
                Fluids: {racePlan.fluids_ml_per_hour}ml/hr = ~{Math.round(racePlan.fluids_ml_per_hour * 5.75 / 500)} bottles
              </p>
              <p style={{ marginBottom: '12px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Run (26.2 mi):</strong><br />
                {racePlan.carbs_per_hour_g}g carbs/hr (reduce slightly vs bike if GI sensitive)<br />
                Aid stations every ~1 mi — grab fluids at each, gels/food at alternates<br />
                Sodium: {racePlan.sodium_mg_per_hour}mg/hr → watch cramping in heat
              </p>
              <p>
                <strong style={{ color: 'var(--accent-amber)' }}>Practice your exact plan on long training sessions</strong> — nothing new on race day.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
