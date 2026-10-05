import React, { useState, useEffect } from 'react'
import { LayoutDashboard, PlusCircle, CalendarDays, Moon, UtensilsCrossed, TrendingDown, Upload } from 'lucide-react'

const FALLBACK_RACE_DATE = '2027-07-25'

function getDaysToRace(dateStr) {
  const raceDate = new Date(dateStr + 'T00:00:00Z')
  const today = new Date()
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  const diff = Math.ceil((raceDate.getTime() - todayUTC.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : 0
}

function formatRaceDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const navItems = [
  { key: 'dashboard', label: 'Command Center', Icon: LayoutDashboard },
  { key: 'calendar', label: 'Training Planner', Icon: CalendarDays },
  { key: 'wellness', label: 'Sleep Tracker', Icon: Moon },
  { key: 'nutrition', label: 'Nutrition', Icon: UtensilsCrossed },
  { key: 'fatloss', label: 'BFP Tracker', Icon: TrendingDown },
  { key: 'import', label: 'Import Data', Icon: Upload },
  { key: 'logger', label: 'Log Session', Icon: PlusCircle },
]

export default function Sidebar({ currentPage, onNavigate }) {
  const [raceDateStr, setRaceDateStr] = useState(FALLBACK_RACE_DATE)
  const [syncStatus, setSyncStatus] = useState(null) // null | 'syncing' | 'ok' | 'fail'
  const [syncResult, setSyncResult] = useState(null)

  useEffect(() => {
    if (typeof window.electronAPI === 'undefined') return
    window.electronAPI.getPlan().then(p => {
      if (p?.race_date) setRaceDateStr(p.race_date)
    }).catch(() => {})
  }, [])

  async function handleSync() {
    if (typeof window.electronAPI === 'undefined') return
    setSyncStatus('syncing')
    try {
      const result = await window.electronAPI.syncToDrive()
      setSyncStatus(result?.ok ? 'ok' : result?.blocked ? 'blocked' : 'fail')
      setSyncResult(result)
    } catch (e) {
      setSyncStatus('fail')
      setSyncResult({ ok: false, errors: [e.message] })
    } finally {
      setTimeout(() => setSyncStatus(null), 8000)
    }
  }

  const daysToRace = getDaysToRace(raceDateStr)

  return (
    <nav className="sidebar">
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
          Ironman LP '27
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Training Dashboard</div>
      </div>

      {navItems.map(({ key, label, Icon }) => (
        <div
          key={key}
          className={`nav-item ${currentPage === key ? 'active' : ''}`}
          onClick={() => onNavigate(key)}
        >
          <Icon size={16} />
          {label}
        </div>
      ))}

      <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
        {/* Sync to Drive button */}
        <button
          onClick={handleSync}
          disabled={syncStatus === 'syncing'}
          style={{
            width: '100%',
            marginBottom: '8px',
            padding: '7px 12px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: syncStatus === 'ok' ? 'var(--accent-green)' : (syncStatus === 'fail' || syncStatus === 'blocked') ? '#f97316' : 'var(--bg-card)',
            color: syncStatus === 'ok' || syncStatus === 'fail' || syncStatus === 'blocked' ? '#0f172a' : 'var(--text-muted)',
            cursor: syncStatus === 'syncing' ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'ok' ? 'Synced ✓' : syncStatus === 'blocked' ? 'Blocked ✗' : syncStatus === 'fail' ? 'Failed ✗' : 'Sync to Drive'}
        </button>

        {syncStatus && syncResult && (
          <div style={{ fontSize: '10px', color: syncResult.ok ? 'var(--accent-green)' : '#f97316', marginBottom: '8px', lineHeight: '1.4' }}>
            {syncResult.ok ? (
              <>
                {syncResult.files?.snapshot?.fileId && <div>Snapshot: {syncResult.files.snapshot.fileId.slice(0,12)}…</div>}
                {syncResult.files?.currentPlan?.fileId && <div>Plan: {syncResult.files.currentPlan.fileId.slice(0,12)}…</div>}
                {syncResult.files?.buildSpec?.fileId && <div>Spec: {syncResult.files.buildSpec.fileId.slice(0,12)}…</div>}
              </>
            ) : (
              <div style={{ color: '#f97316' }}>
                {(syncResult.errors || ['Unknown error']).map((e, i) => <div key={i}>&#x2717; {e.slice(0, 60)}</div>)}
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
          Race Countdown
        </div>
        <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-blue)' }}>
          {daysToRace}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>days to go</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{formatRaceDate(raceDateStr)}</div>
      </div>
    </nav>
  )
}
