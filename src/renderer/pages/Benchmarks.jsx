import React, { useState } from 'react'

const inputStyle = {
  width: '100%',
  padding: '7px 10px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  fontSize: '13px',
}

const labelStyle = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  marginBottom: '4px',
  display: 'block',
}

function Field({ label, type = 'number', placeholder, value, onChange, step }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        step={step}
        style={inputStyle}
      />
    </div>
  )
}

export default function Benchmarks() {
  const [status, setStatus] = useState(null)  // null | 'saving' | 'ok' | 'error'
  const [errMsg, setErrMsg] = useState('')

  // Bike FTP test fields
  const [bikeDate,   setBikeDate]   = useState('')
  const [power20,    setPower20]    = useState('')
  const [hr20Bike,   setHr20Bike]   = useState('')

  // Run 30-min TT fields
  const [runDate,    setRunDate]    = useState('')
  const [runDist,    setRunDist]    = useState('')
  const [lastHr20,   setLastHr20]   = useState('')

  // Swim 400m TT fields
  const [swimDate,   setSwimDate]   = useState('')
  const [time400m,   setTime400m]   = useState('')

  async function save(payload) {
    if (typeof window.electronAPI === 'undefined') {
      setErrMsg('electronAPI not available'); setStatus('error'); return
    }
    setStatus('saving')
    try {
      const res = await window.electronAPI.saveTestResults(payload)
      if (res?.ok) {
        setStatus('ok')
        setTimeout(() => setStatus(null), 3000)
      } else {
        setErrMsg(res?.error || 'Unknown error'); setStatus('error')
      }
    } catch (e) {
      setErrMsg(e.message); setStatus('error')
    }
  }

  function saveBike(e) {
    e.preventDefault()
    if (!bikeDate || !power20 || !hr20Bike) { setErrMsg('All bike fields required'); setStatus('error'); return }
    save({ type: 'bike', date: bikeDate, power20: Number(power20), hr20: Number(hr20Bike) })
  }

  function saveRun(e) {
    e.preventDefault()
    if (!runDate || !lastHr20) { setErrMsg('Date and last-20-min HR required'); setStatus('error'); return }
    save({ type: 'run', date: runDate, lastHr20: Number(lastHr20), distance: runDist ? Number(runDist) : null })
  }

  function saveSwim(e) {
    e.preventDefault()
    if (!swimDate || !time400m) { setErrMsg('Date and time required'); setStatus('error'); return }
    if (!/^\d+:\d{2}$/.test(time400m)) { setErrMsg('Time format must be mm:ss (e.g. 7:30)'); setStatus('error'); return }
    save({ type: 'swim', date: swimDate, time400m })
  }

  const section = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '20px',
  }

  const btnStyle = {
    padding: '8px 18px',
    background: 'var(--accent-blue)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  }

  return (
    <div style={{ padding: '24px', maxWidth: '560px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>Benchmarks</h2>

      {status === 'ok' && <div style={{ color: 'var(--accent-green)', marginBottom: '12px', fontSize: '13px' }}>Saved ✓</div>}
      {status === 'error' && <div style={{ color: '#f97316', marginBottom: '12px', fontSize: '13px' }}>Error: {errMsg}</div>}

      {/* Bike FTP Test */}
      <div style={section}>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Bike FTP Test</div>
        <form onSubmit={saveBike}>
          <Field label="Date" type="date" value={bikeDate} onChange={setBikeDate} />
          <Field label="20-min avg power (W)" placeholder="e.g. 200" value={power20} onChange={setPower20} step="1" />
          <Field label="20-min avg HR (bpm)" placeholder="e.g. 160" value={hr20Bike} onChange={setHr20Bike} step="1" />
          <button type="submit" style={btnStyle} disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save & Derive Zones'}
          </button>
        </form>
      </div>

      {/* Run 30-min TT */}
      <div style={section}>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Run 30-min TT</div>
        <form onSubmit={saveRun}>
          <Field label="Date" type="date" value={runDate} onChange={setRunDate} />
          <Field label="Distance (mi)" placeholder="e.g. 3.52" value={runDist} onChange={setRunDist} step="0.01" />
          <Field label="Avg HR — last 20 min (bpm)" placeholder="e.g. 160" value={lastHr20} onChange={setLastHr20} step="1" />
          <button type="submit" style={btnStyle} disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save & Derive Zones'}
          </button>
        </form>
      </div>

      {/* Swim 400m TT */}
      <div style={section}>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Swim 400m TT</div>
        <form onSubmit={saveSwim}>
          <Field label="Date" type="date" value={swimDate} onChange={setSwimDate} />
          <Field label="Time (mm:ss)" type="text" placeholder="e.g. 7:30" value={time400m} onChange={setTime400m} />
          <button type="submit" style={btnStyle} disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  )
}
