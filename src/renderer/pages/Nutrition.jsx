import React, { useState, useEffect } from 'react'

function toDateStr(d) { return d.toISOString().slice(0, 10) }

function defaultRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 13)
  return { start: toDateStr(start), end: toDateStr(end) }
}

export default function Nutrition() {
  const noAPI = typeof window.electronAPI === 'undefined'
  const [range, setRange] = useState(defaultRange())
  const [history, setHistory] = useState([])

  async function load(r) {
    if (noAPI) return
    const hist = await window.electronAPI.getNutritionHistory(r)
    setHistory(hist || [])
  }

  useEffect(() => { load(range) }, [])

  function setStart(v) { const r = { ...range, start: v }; setRange(r); load(r) }
  function setEnd(v)   { const r = { ...range, end: v };   setRange(r); load(r) }

  const days = history.length
  const avg = (key) => days > 0 ? Math.round(history.reduce((s, h) => s + (h[key] || 0), 0) / days) : 0

  return (
    <div>
      <h1>Nutrition</h1>

      {noAPI && <div style={{ color: 'var(--accent-amber)', marginBottom: '16px', fontSize: '13px' }}>Running outside Electron.</div>}

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="date" value={range.start} onChange={e => setStart(e.target.value)} />
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>to</span>
            <input type="date" value={range.end} onChange={e => setEnd(e.target.value)} />
          </div>

          {days > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '24px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{avg('total_calories')}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>avg kcal</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#a78bfa' }}>{avg('total_protein')}g</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>avg protein</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#fb923c' }}>{avg('total_carbs')}g</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>avg carbs</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#38bdf8' }}>{avg('total_fat')}g</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>avg fat</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No data for this range — import MFP data via Import Data.</div>
      ) : (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px' }}>Date</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>kcal</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', color: '#a78bfa' }}>Protein</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', color: '#fb923c' }}>Carbs</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', color: '#38bdf8' }}>Fat</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.date} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>{h.date}</td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{Math.round(h.total_calories || 0)}</td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: '#a78bfa' }}>{Math.round(h.total_protein || 0)}g</td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: '#fb923c' }}>{Math.round(h.total_carbs || 0)}g</td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: '#38bdf8' }}>{Math.round(h.total_fat || 0)}g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
