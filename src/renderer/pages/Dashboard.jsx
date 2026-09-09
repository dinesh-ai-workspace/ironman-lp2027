import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import ReadinessWidget from '../components/ReadinessWidget'
import SessionCard from '../components/SessionCard'

const RACE_DATE = new Date('2027-07-25T00:00:00Z')

function getDaysToRace() {
  const today = new Date()
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  const diff = Math.ceil((RACE_DATE.getTime() - todayUTC.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : 0
}

function computeStreak(logged) {
  if (!logged || !logged.length) return 0
  const dates = [...new Set(logged.map(s => s.date))].sort().reverse()
  let streak = 0
  const today = new Date()
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i] + 'T00:00:00Z')
    const diffDays = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === i) streak++
    else break
  }
  return streak
}

const CHART_COLORS = { swim: '#38bdf8', bike: '#a78bfa', run: '#fb923c' }

const TIER_COLOR = { green: 'var(--accent-green)', amber: 'var(--accent-amber)', red: '#f87171' }
const TIER_BG = { green: 'rgba(34,197,94,0.08)', amber: 'rgba(251,191,36,0.08)', red: 'rgba(248,113,113,0.08)' }
const TIER_LABEL = { green: 'Good to go', amber: 'Moderate', red: 'Rest day' }

function BreakdownBar({ label, pts, max }) {
  const pct = Math.round((pts / max) * 100)
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>
        <span>{label}</span>
        <span>{pts}/{max}</span>
      </div>
      <div style={{ height: '4px', borderRadius: '2px', background: 'var(--border)' }}>
        <div style={{ height: '100%', borderRadius: '2px', width: `${pct}%`, background: 'var(--accent-blue)', transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

function ReadinessScoreCard({ readiness }) {
  const { score, tier, advice, hasData, breakdown } = readiness
  const color = TIER_COLOR[tier]
  return (
    <div className="card" style={{ marginBottom: '24px', borderColor: color, background: TIER_BG[tier] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
        <div style={{ textAlign: 'center', minWidth: '64px' }}>
          <div style={{ fontSize: '36px', fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>/ 100</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color }}>Today's Readiness</span>
            <span style={{ fontSize: '11px', background: color, color: '#0f172a', borderRadius: '4px', padding: '1px 6px', fontWeight: 600 }}>
              {TIER_LABEL[tier]}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{advice}</div>
          {!hasData && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Log wellness &amp; sleep in the Wellness tab to improve accuracy.
            </div>
          )}
        </div>
        <div style={{ minWidth: '160px' }}>
          <BreakdownBar label="Sleep" pts={breakdown.sleep} max={40} />
          <BreakdownBar label="Fatigue / Soreness" pts={breakdown.wellness} max={40} />
          <BreakdownBar label="Nutrition" pts={breakdown.nutrition} max={20} />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [progress, setProgress] = useState(null)
  const [weeklyVolume, setWeeklyVolume] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [gates, setGates] = useState([])
  const [recentLogged, setRecentLogged] = useState([])
  const [readiness, setReadiness] = useState(null)
  const noAPI = typeof window.electronAPI === 'undefined'

  useEffect(() => {
    if (noAPI) { setLoading(false); return }
    Promise.all([
      window.electronAPI.getPlan(),
      window.electronAPI.getProgressStats(),
      window.electronAPI.getWeeklyVolume(8),
      window.electronAPI.getUpcomingSessions(7),
      window.electronAPI.getReadinessGates(),
      window.electronAPI.getLoggedSessions({ startDate: fourWeeksAgoStr() }),
      window.electronAPI.getReadinessScore(),
    ]).then(([p, prog, vol, up, g, logged, rs]) => {
      setPlan(p)
      setProgress(prog)
      setWeeklyVolume(vol || [])
      setUpcoming(up || [])
      setGates(g || [])
      setRecentLogged(logged || [])
      setReadiness(rs || null)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  function fourWeeksAgoStr() {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 28)
    return d.toISOString().slice(0, 10)
  }

  const completedCount = recentLogged.length
  const plannedCount = progress ? progress.completedVsPlanned4wk.planned : 0
  const streak = computeStreak(recentLogged)
  const daysToRace = getDaysToRace()
  const todayStr = new Date().toISOString().slice(0, 10)

  // Format chart data
  const chartData = weeklyVolume.map(w => ({
    week: w.weekStart ? w.weekStart.slice(5) : '?',
    Swim: w.swim ? Math.round(w.swim.hours * 10) / 10 : 0,
    Bike: w.bike ? Math.round(w.bike.hours * 10) / 10 : 0,
    Run: w.run ? Math.round(w.run.hours * 10) / 10 : 0,
  }))

  const hasChartData = chartData.some(w => w.Swim > 0 || w.Bike > 0 || w.Run > 0)

  if (noAPI) {
    return (
      <div>
        <div className="warning-banner">Running outside Electron — dashboard data is unavailable.</div>
        <h1>Dashboard</h1>
      </div>
    )
  }

  if (loading) {
    return <div className="loading">Loading dashboard...</div>
  }

  return (
    <div>
      <h1>Dashboard</h1>

      {/* Top stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Days to Race</div>
          <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>{daysToRace}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Jul 25, 2027</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Sessions (4 wk)</div>
          <div className="stat-value">
            {completedCount}
            <span style={{ fontSize: '16px', color: 'var(--text-muted)' }}>/{plannedCount}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {plannedCount > 0 ? Math.round(completedCount / plannedCount * 100) : 0}% completed
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Current Phase</div>
          <div className="stat-value" style={{ fontSize: '16px', paddingTop: '6px' }}>
            {progress && progress.currentPhase ? progress.currentPhase : 'N/A'}
          </div>
          {plan && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>v{plan.version}</div>}
        </div>

        <div className="stat-card">
          <div className="stat-label">Current Streak</div>
          <div className="stat-value" style={{ color: streak > 0 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
            {streak}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>consecutive days</div>
        </div>
      </div>

      {/* Daily readiness score */}
      {readiness && (
        <ReadinessScoreCard readiness={readiness} />
      )}

      {/* Readiness gates */}
      <ReadinessWidget gates={gates} />

      {/* Weekly volume chart */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2>Weekly Volume</h2>
        {hasChartData ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="h" />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#f1f5f9' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Swim" stackId="a" fill={CHART_COLORS.swim} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Bike" stackId="a" fill={CHART_COLORS.bike} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Run" stackId="a" fill={CHART_COLORS.run} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state">No data yet — start logging sessions</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Upcoming sessions */}
        <div className="card">
          <h2>Upcoming 7 Days</h2>
          {upcoming.length === 0 ? (
            <div className="empty-state">No upcoming sessions</div>
          ) : (
            upcoming.slice(0, 8).map(s => (
              <SessionCard
                key={s.id}
                session={s}
                showDate={true}
                readinessTier={s.date === todayStr && readiness ? readiness.tier : null}
              />
            ))
          )}
        </div>

        {/* Progress milestones */}
        <div className="card">
          <h2>Personal Bests</h2>
          {progress ? (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>Longest Swim</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--swim)' }}>
                  {progress.longestSwim != null ? `${Math.round(progress.longestSwim * 10) / 10} km` : '—'}
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>Longest Bike</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--bike)' }}>
                  {progress.longestBike != null ? `${progress.longestBike} hrs` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>Longest Run</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--run)' }}>
                  {progress.longestRun != null ? `${Math.round(progress.longestRun * 10) / 10} mi` : '—'}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">No sessions logged yet</div>
          )}
        </div>
      </div>
    </div>
  )
}
