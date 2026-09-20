import React, { useState } from 'react'

const GARMIN_PRESETS = [
  { value: 'garmin', label: 'Garmin Connect' },
  { value: 'other',  label: 'Other / Generic' },
]

function ResultBox({ result }) {
  if (!result) return null
  if (result.error) return (
    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px', marginTop: '14px', fontSize: '13px', color: '#ef4444' }}>
      Error: {result.error}
    </div>
  )

  const imported = result.imported ?? result.dates?.length ?? 0
  const dupes = result.skipped_duplicates ?? 0
  const invalid = result.skipped_invalid ?? 0
  const nothingNew = imported === 0

  let reason = null
  if (nothingNew) {
    if (dupes > 0 && invalid === 0) reason = `All ${dupes} records already exist in the database — nothing new to add.`
    else if (invalid > 0 && dupes === 0) reason = `${invalid} records were invalid or unreadable — check the file format.`
    else if (dupes > 0 && invalid > 0) reason = `${dupes} duplicates skipped, ${invalid} invalid records — nothing new imported.`
    else reason = 'File appears to be empty or in an unrecognised format.'
  }

  return (
    <div style={{
      background: nothingNew ? 'rgba(251,191,36,0.08)' : 'rgba(34,197,94,0.08)',
      border: `1px solid ${nothingNew ? 'var(--accent-amber)' : 'var(--accent-green)'}`,
      borderRadius: '8px', padding: '14px', marginTop: '14px',
    }}>
      <div style={{ fontWeight: 600, color: nothingNew ? 'var(--accent-amber)' : 'var(--accent-green)', marginBottom: '6px', fontSize: '13px' }}>
        {nothingNew ? 'Nothing imported' : 'Import complete'}
      </div>
      {nothingNew ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{reason}</div>
      ) : (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <span>Imported: <strong style={{ color: 'var(--text-primary)' }}>{imported}</strong></span>
          {dupes > 0 && <span>Duplicates skipped: <strong style={{ color: 'var(--text-primary)' }}>{dupes}</strong></span>}
          {invalid > 0 && <span>Invalid: <strong style={{ color: '#fb923c' }}>{invalid}</strong></span>}
        </div>
      )}
      {!nothingNew && result.sample?.[0]?.weight_lb && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Latest · {result.sample[0].weight_lb} lb · {result.sample[0].body_fat_pct}% fat · {result.sample[0].skeletal_muscle_pct}% muscle · visceral {result.sample[0].visceral_fat}
        </div>
      )}
    </div>
  )
}

function StepBadge({ n, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
      <div style={{
        width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
        background: 'var(--accent-blue)', color: '#fff',
        fontSize: '11px', fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</div>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  )
}

function ImportCard({ title, badge, description, children }) {
  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <h2 style={{ margin: 0, fontSize: '16px' }}>{title}</h2>
        {badge && (
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)' }}>
            {badge}
          </span>
        )}
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px 0' }}>{description}</p>
      {children}
    </div>
  )
}

function ReviewBox({ file, onImport, onReset, busy, importLabel }) {
  return (
    <div style={{ background: 'var(--bg-base)', borderRadius: '8px', padding: '14px', marginTop: '12px' }}>
      <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-primary)', marginBottom: '12px', wordBreak: 'break-all' }}>
        {file.split('/').pop()}
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button className="btn btn-success" onClick={onImport} disabled={busy}>
          {busy ? 'Importing…' : importLabel || 'Import'}
        </button>
        <button className="btn btn-secondary" onClick={onReset} disabled={busy}>
          Change file
        </button>
      </div>
    </div>
  )
}

export default function Import() {
  const noAPI = typeof window.electronAPI === 'undefined'

  // ── Garmin Activities ────────────────────────────────────────────────────
  const [garminFile, setGarminFile]       = useState(null)
  const [garminPreset, setGarminPreset]   = useState('garmin')
  const [garminPreview, setGarminPreview] = useState(null)
  const [garminBusy, setGarminBusy]       = useState(false)
  const [garminResult, setGarminResult]   = useState(null)

  async function handleGarminChoose() {
    if (noAPI) return
    const path = await window.electronAPI.openFileDialog()
    if (!path) return
    setGarminFile(path)
    setGarminPreview(null)
    setGarminResult(null)
  }

  async function handleGarminPreview() {
    if (!garminFile) return
    setGarminBusy(true)
    try {
      const r = await window.electronAPI.previewCSV(garminFile, garminPreset)
      setGarminPreview(r)
    } catch (e) { setGarminPreview({ error: e.message }) }
    finally { setGarminBusy(false) }
  }

  async function handleGarminImport() {
    if (!garminFile || !garminPreview) return
    setGarminBusy(true)
    try {
      const r = await window.electronAPI.importCSV(garminFile, garminPreset, {})
      setGarminResult(r)
      setGarminPreview(null)
      setGarminFile(null)
    } catch (e) { setGarminResult({ error: e.message }) }
    finally { setGarminBusy(false) }
  }

  // ── Garmin Sleep ─────────────────────────────────────────────────────────
  const [sleepFile, setSleepFile]     = useState(null)
  const [sleepBusy, setSleepBusy]     = useState(false)
  const [sleepResult, setSleepResult] = useState(null)

  async function handleSleepChoose() {
    if (noAPI) return
    const path = await window.electronAPI.openFileDialog()
    if (!path) return
    setSleepFile(path)
    setSleepResult(null)
  }

  async function handleSleepImport() {
    if (!sleepFile) return
    setSleepBusy(true)
    try {
      const r = await window.electronAPI.importSleep(sleepFile)
      setSleepResult(r)
      setSleepFile(null)
    } catch (e) { setSleepResult({ error: e.message }) }
    finally { setSleepBusy(false) }
  }

  // ── Renpho ───────────────────────────────────────────────────────────────
  const [renphoFile, setRenphoFile]     = useState(null)
  const [renphoBusy, setRenphoBusy]     = useState(false)
  const [renphoResult, setRenphoResult] = useState(null)

  async function handleRenphoChoose() {
    if (noAPI) return
    const path = await window.electronAPI.openFileDialog()
    if (!path) return
    setRenphoFile(path)
    setRenphoResult(null)
  }

  async function handleRenphoImport() {
    if (!renphoFile) return
    setRenphoBusy(true)
    try {
      const r = await window.electronAPI.importRenpho(renphoFile)
      setRenphoResult(r)
      setRenphoFile(null)
    } catch (e) { setRenphoResult({ error: e.message }) }
    finally { setRenphoBusy(false) }
  }

  // ── MyFitnessPal ─────────────────────────────────────────────────────────
  const [mfpFile, setMfpFile]     = useState(null)
  const [mfpBusy, setMfpBusy]     = useState(false)
  const [mfpResult, setMfpResult] = useState(null)

  async function handleMfpChoose() {
    if (noAPI) return
    const path = await window.electronAPI.openFileDialog()
    if (!path) return
    setMfpFile(path)
    setMfpResult(null)
  }

  async function handleMfpImport() {
    if (!mfpFile) return
    setMfpBusy(true)
    try {
      const r = await window.electronAPI.importMFP(mfpFile)
      setMfpResult(r)
      setMfpFile(null)
    } catch (e) { setMfpResult({ error: e.message }) }
    finally { setMfpBusy(false) }
  }

  return (
    <div>
      <h1 style={{ marginBottom: '6px' }}>Import Data</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '28px', marginTop: 0 }}>
        All your data sources in one place. Re-importing is safe — duplicates are always skipped.
      </p>

      {/* ── 1. Garmin Activities ── */}
      <ImportCard
        title="Garmin Activities"
        badge="Training log"
        description="Export from Garmin Connect → Activities → Export CSV. Imports swim, bike, run, and strength sessions."
      >
        <StepBadge n="1" label="Upload" />
        <button className="btn btn-secondary" onClick={handleGarminChoose} disabled={noAPI || garminBusy}>
          Choose File
        </button>

        {garminFile && !garminPreview && (
          <>
            <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: '8px' }}>
              {garminFile.split('/').pop()}
            </div>
            <div style={{ marginTop: '16px' }}>
              <StepBadge n="2" label="Review" />
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, maxWidth: '220px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Source</label>
                  <select value={garminPreset} onChange={e => setGarminPreset(e.target.value)}>
                    {GARMIN_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <button className="btn btn-secondary" onClick={handleGarminPreview} disabled={garminBusy}>
                  {garminBusy ? 'Loading…' : 'Preview'}
                </button>
              </div>
            </div>
          </>
        )}

        {garminPreview && !garminPreview.error && (
          <div style={{ marginTop: '16px' }}>
            <StepBadge n="3" label="Import" />
            <div style={{ background: 'var(--bg-base)', borderRadius: '8px', padding: '14px' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span className="badge badge-blue">{garminPreview.rows_total} rows</span>
                <span className="badge badge-green">{garminPreview.rows_valid} valid</span>
                {garminPreview.rows_invalid > 0 && <span className="badge badge-red">{garminPreview.rows_invalid} invalid</span>}
              </div>
              <button className="btn btn-success" onClick={handleGarminImport} disabled={garminBusy}>
                {garminBusy ? 'Importing…' : `Import ${garminPreview.rows_valid} sessions`}
              </button>
            </div>
          </div>
        )}

        {garminPreview?.error && (
          <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '10px' }}>Error: {garminPreview.error}</div>
        )}
        <ResultBox result={garminResult} />
      </ImportCard>

      {/* ── 2. Garmin Sleep ── */}
      <ImportCard
        title="Garmin Sleep"
        badge="Recovery"
        description="Export from Garmin Connect → Health Stats → Sleep → Export. Imports sleep duration, HRV, and resting HR."
      >
        <StepBadge n="1" label="Upload" />
        <button className="btn btn-secondary" onClick={handleSleepChoose} disabled={noAPI || sleepBusy}>
          Choose File
        </button>

        {sleepFile && (
          <>
            <div style={{ marginTop: '16px' }}>
              <StepBadge n="2" label="Review" />
              <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                {sleepFile.split('/').pop()}
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <StepBadge n="3" label="Import" />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-success" onClick={handleSleepImport} disabled={sleepBusy}>
                  {sleepBusy ? 'Importing…' : 'Import Sleep Data'}
                </button>
                <button className="btn btn-secondary" onClick={() => setSleepFile(null)} disabled={sleepBusy}>
                  Change file
                </button>
              </div>
            </div>
          </>
        )}
        <ResultBox result={sleepResult} />
      </ImportCard>

      {/* ── 3. Renpho Scale ── */}
      <ImportCard
        title="Renpho Scale"
        badge="Body composition"
        description="Export from the Renpho app → Me → Export Data → CSV. Imports weight, body fat %, skeletal muscle %, visceral fat, and more."
      >
        <StepBadge n="1" label="Upload" />
        <button className="btn btn-secondary" onClick={handleRenphoChoose} disabled={noAPI || renphoBusy}>
          Choose File
        </button>

        {renphoFile && (
          <>
            <div style={{ marginTop: '16px' }}>
              <StepBadge n="2" label="Review" />
              <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                {renphoFile.split('/').pop()}
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <StepBadge n="3" label="Import" />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-success" onClick={handleRenphoImport} disabled={renphoBusy}>
                  {renphoBusy ? 'Importing…' : 'Import Renpho Data'}
                </button>
                <button className="btn btn-secondary" onClick={() => setRenphoFile(null)} disabled={renphoBusy}>
                  Change file
                </button>
              </div>
            </div>
          </>
        )}
        <ResultBox result={renphoResult} />
      </ImportCard>

      {/* ── 4. MyFitnessPal ── */}
      <ImportCard
        title="MyFitnessPal"
        badge="Nutrition"
        description="Export from MyFitnessPal → Settings → Export Data. Imports daily calorie, protein, carb, and fat logs."
      >
        <StepBadge n="1" label="Upload" />
        <button className="btn btn-secondary" onClick={handleMfpChoose} disabled={noAPI || mfpBusy}>
          Choose File
        </button>

        {mfpFile && (
          <>
            <div style={{ marginTop: '16px' }}>
              <StepBadge n="2" label="Review" />
              <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                {mfpFile.split('/').pop()}
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <StepBadge n="3" label="Import" />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-success" onClick={handleMfpImport} disabled={mfpBusy}>
                  {mfpBusy ? 'Importing…' : 'Import MFP Data'}
                </button>
                <button className="btn btn-secondary" onClick={() => setMfpFile(null)} disabled={mfpBusy}>
                  Change file
                </button>
              </div>
            </div>
          </>
        )}
        <ResultBox result={mfpResult} />
      </ImportCard>
    </div>
  )
}
