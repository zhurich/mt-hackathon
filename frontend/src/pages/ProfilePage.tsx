import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { AttemptHistoryItem, Profile } from '../api/types'
import { useAuth } from '../auth'
import { Async, OutcomeChip, ProgressBar } from '../components/ui'
import { ACHIEVEMENT_ICON, experience, formatDate, formatDateTime } from '../labels'

export default function ProfilePage() {
  const { logout } = useAuth()
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api.get<Profile>('/profile') })
  const history = useQuery({ queryKey: ['attempts'], queryFn: () => api.get<AttemptHistoryItem[]>('/attempts?limit=20') })

  return (
    <div className="stack">
      <Async query={profile}>
        {(data) => {
          const earned = data.achievements.filter((a) => a.earned_at).length
          return (
            <>
              <section className="card stack" style={{ gap: '0.4rem' }}>
                <h1 style={{ margin: 0 }}>{data.user.display_name}</h1>
                <div className="small muted">
                  Табельный № {data.user.employee_code} · {data.user.brigade ?? 'без бригады'} · {data.user.depot ?? ''}
                </div>
                <div className="spread small" style={{ marginTop: 8 }}>
                  <strong>{data.level.title}</strong>
                  <span className="muted tabular">{experience(data.total_xp)}</span>
                </div>
                <ProgressBar value={data.level.progress} label="Прогресс уровня" />
                <div className="row small muted">
                  <span>Баллы рейтинга: <strong>{data.active_points}</strong></span>
                  <span>· Серия: {data.streak_days} дн.</span>
                  <span>· Сценариев: {data.finished_attempts}</span>
                </div>
              </section>

              <section className="stack" style={{ gap: '0.6rem' }}>
                <h2>Достижения · {earned} из {data.achievements.length}</h2>
                <div className="grid grid-2">
                  {data.achievements.map((item) => (
                    <div key={item.code} className="card row" style={{ opacity: item.earned_at ? 1 : 0.6, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                      <span style={{ fontSize: '1.8rem', filter: item.earned_at ? 'none' : 'grayscale(1)' }} aria-hidden>
                        {ACHIEVEMENT_ICON[item.icon] ?? '🏅'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <strong>{item.title}</strong>
                        <div className="small secondary">{item.description}</div>
                        {item.earned_at ? (
                          <div className="small muted">✓ Получено {formatDate(item.earned_at)}</div>
                        ) : (
                          <div style={{ marginTop: 6 }}>
                            <ProgressBar value={item.progress / item.target} label={item.title} />
                            <div className="small muted tabular">{item.progress} / {item.target}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )
        }}
      </Async>

      <section className="stack" style={{ gap: '0.6rem' }}>
        <h2>История прохождений</h2>
        <Async query={history}>
          {(items) =>
            items.length === 0 ? (
              <p className="muted">Пока пусто — <Link to="/scenarios">пройдите первый сценарий</Link>.</p>
            ) : (
              <div className="stack" style={{ gap: '0.5rem' }}>
                {items.map((item) => (
                  <Link key={item.id} to={`/attempts/${item.id}/debrief`} className="card card-link spread">
                    <div>
                      <strong>{item.scenario_title}</strong>
                      <div className="small muted">
                        {formatDateTime(item.finished_at)} · лояльность {item.final_loyalty} · безопасность {item.final_safety}
                      </div>
                    </div>
                    <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                      <OutcomeChip outcome={item.outcome} />
                      <span className="small muted">+{experience(item.xp)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )
          }
        </Async>
      </section>

      <button className="btn" onClick={logout}>Выйти из аккаунта</button>
    </div>
  )
}
