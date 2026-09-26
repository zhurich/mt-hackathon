import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from './api/client'
import type { Notification } from './api/types'
import { useAuth } from './auth'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ScenariosPage from './pages/ScenariosPage'
import ScenarioPage from './pages/ScenarioPage'
import PlayPage from './pages/PlayPage'
import DebriefPage from './pages/DebriefPage'
import ProfilePage from './pages/ProfilePage'
import ProgressPage from './pages/ProgressPage'
import LeaderboardPage from './pages/LeaderboardPage'
import NotificationsPage from './pages/NotificationsPage'
import TrainerPage from './pages/TrainerPage'

// Редактор (с React Flow) нужен только тренерам — грузится отдельным чанком по требованию.
const EditorPage = lazy(() => import('./editor/EditorPage'))

const NAV = [
  { to: '/', label: 'Главная', icon: '🏠' },
  { to: '/scenarios', label: 'Сценарии', icon: '🚄' },
  { to: '/progress', label: 'Развитие', icon: '📈' },
  { to: '/leaderboard', label: 'Рейтинг', icon: '🏆' },
  { to: '/profile', label: 'Профиль', icon: '👤' },
]

function NotificationBell() {
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ unread: number; items: Notification[] }>('/notifications'),
    refetchInterval: 30_000,
  })
  const unread = data?.unread ?? 0
  return (
    <NavLink to="/notifications" className="bell" aria-label={`Уведомления, непрочитанных: ${unread}`}>
      🔔{unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
    </NavLink>
  )
}

function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const immersive = pathname.startsWith('/play/')
  const wide = pathname.startsWith('/trainer/editor')
  const items = user?.role === 'trainer' ? [...NAV, { to: '/trainer', label: 'Команда', icon: '👥' }] : NAV

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span aria-hidden>🚄</span> ВСМ Тренажёр
        </NavLink>
        <nav className="topnav" aria-label="Основная навигация">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <NotificationBell />
      </header>
      <main className={wide ? 'content-wide' : 'content'}>{children}</main>
      {!immersive && !wide && (
        <nav className="bottomnav" aria-label="Основная навигация">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}

function RequireTrainer({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user?.role === 'trainer' ? children : <Navigate to="/" replace />
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="center-screen">Загрузка…</div>
  if (!user) return <LoginPage />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/scenarios" element={<ScenariosPage />} />
        <Route path="/scenarios/:id" element={<ScenarioPage />} />
        <Route path="/play/:attemptId" element={<PlayPage />} />
        <Route path="/attempts/:attemptId/debrief" element={<DebriefPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/trainer" element={<RequireTrainer><TrainerPage /></RequireTrainer>} />
        <Route path="/trainer/editor/:id" element={
          <RequireTrainer><Suspense fallback={<div className="center-screen">Загрузка редактора…</div>}><EditorPage /></Suspense></RequireTrainer>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
