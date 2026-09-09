import React from 'react'
import { LayoutDashboard, PlusCircle, CalendarDays, Moon, UtensilsCrossed } from 'lucide-react'

const RACE_DATE = new Date('2027-07-25T00:00:00Z')

function getDaysToRace() {
  const today = new Date()
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  const diff = Math.ceil((RACE_DATE.getTime() - todayUTC.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : 0
}

const navItems = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { key: 'logger', label: 'Log Session', Icon: PlusCircle },
  { key: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { key: 'wellness', label: 'Wellness', Icon: Moon },
  { key: 'nutrition', label: 'Nutrition', Icon: UtensilsCrossed },
]

export default function Sidebar({ currentPage, onNavigate }) {
  const daysToRace = getDaysToRace()

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
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Jul 25, 2027</div>
      </div>
    </nav>
  )
}
