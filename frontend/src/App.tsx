import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from './api/client'
import type { Notification } from './api/types'
import { useAuth } from './auth'
import { Icon, IconButton, Loader, TopBar, type IconName } from './components/ui'
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

interface NavItem {
  to: string
  label: string
  icon: IconName
}

const NAV: NavItem[] = [
  { to: '/', label: 'Главная', icon: 'house' },
  { to: '/scenarios', label: 'Сценарии', icon: 'train-front' },
  { to: '/progress', label: 'Развитие', icon: 'trending-up' },
  { to: '/leaderboard', label: 'Рейтинг', icon: 'trophy' },
  { to: '/profile', label: 'Профиль', icon: 'user-round' },
]
const TRAINER_NAV: NavItem = { to: '/trainer', label: 'Команда', icon: 'users' }

/** Вложенные экраны: заголовок в верхней панели и куда вести «назад», если истории нет. */
const NESTED: { prefix: string; title: string; parent: string }[] = [
  { prefix: '/scenarios/', title: 'Сценарий', parent: '/scenarios' },
  { prefix: '/attempts/', title: 'Разбор решений', parent: '/profile' },
  { prefix: '/notifications', title: 'Уведомления', parent: '/' },
]

function NotificationBell() {
  const { pathname } = useLocation()
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ unread: number; items: Notification[] }>('/notifications'),
    refetchInterval: 30_000,
  })
  const unread = data?.unread ?? 0
  return (
    <IconButton icon="bell" to="/notifications" badge={unread} label={`Уведомления, непрочитанных: ${unread}`}
                className={pathname === '/notifications' ? 'active' : undefined} />
  )
}

function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { pathname, key } = useLocation()
  const navigate = useNavigate()
  const items = user?.role === 'trainer' ? [...NAV, TRAINER_NAV] : NAV
  // Прохождение сценария и редактор — без навигации, чтобы ничего не отвлекало.
  const immersive = pathname.startsWith('/play/')
  const wide = pathname.startsWith('/trainer/editor')

  if (wide) return <div className="shell"><main className="content-wide">{children}</main></div>

  const nested = NESTED.find((item) => pathname.startsWith(item.prefix))
  const root = items.find((item) => item.to === pathname)
  const topnav = (
    <nav className="topnav" aria-label="Основная навигация">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}>{item.label}</NavLink>
      ))}
    </nav>
  )

  return (
    <div className="shell">
      {!immersive && (
        nested ? (
          <TopBar title={nested.title} onBack={() => (key !== 'default' ? navigate(-1) : navigate(nested.parent))}
                  nav={topnav} actions={<NotificationBell />} />
        ) : (
          <TopBar brand={pathname === '/' || !root ? true : 'desktop'} title={root?.label} nav={topnav} actions={<NotificationBell />} />
        )
      )}
      <main className={immersive ? 'content content-immersive' : 'content'}>{children}</main>
      {!immersive && (
        <nav className="bottomnav" aria-label="Основная навигация">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <Icon name={item.icon} size={24} />
              <span className="bottomnav-label">{item.label}</span>
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
  if (loading) return <div className="center-screen"><Loader /></div>
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
          <RequireTrainer><Suspense fallback={<div className="center-screen"><Loader label="Загрузка редактора" /></div>}><EditorPage /></Suspense></RequireTrainer>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
