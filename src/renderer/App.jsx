import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Logger from './pages/Logger'
import Calendar from './pages/Calendar'
import Wellness from './pages/Wellness'
import Nutrition from './pages/Nutrition'

export default function App() {
  const [page, setPage] = useState('dashboard')

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />
      case 'logger': return <Logger />
      case 'calendar': return <Calendar />
      case 'wellness': return <Wellness />
      case 'nutrition': return <Nutrition />
      default: return <Dashboard />
    }
  }

  return (
    <div className="app-shell">
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="main-content">{renderPage()}</main>
    </div>
  )
}
