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

  useEffect(() => {
    if (typeof window.electronAPI === 'undefined') return
    window.electronAPI.getPlan().then(p => {
      if (p?.race_date) setRaceDateStr(p.race_date)
    }).catch(() => {})
  }, [])

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
