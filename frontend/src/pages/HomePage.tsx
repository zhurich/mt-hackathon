import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Analytics, Profile, ScenarioSummary } from '../api/types'
import { Async, ProgressBar } from '../components/ui'
import { experience, formatDate } from '../labels'

export default function HomePage() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api.get<Profile>('/profile') })
  const analytics = useQuery({ queryKey: ['analytics', 'me'], queryFn: () => api.get<Analytics>('/analytics/me') })
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: () => api.get<ScenarioSummary[]>('/scenarios') })
  const active = scenarios.data?.find((scenario) => scenario.active_attempt_id !== null)

  return (
    <div className="stack">
      <Async query={profile}>
        {(data) => (
          <>
            <section className="card stack" style={{ gap: '0.6rem' }}>
              <div className="spread">
                <div>
                  <div className="muted small">{data.user.brigade} · {data.user.depot}</div>
                  <h1 style={{ margin: 0 }}>Здравствуйте, {data.user.display_name}</h1>
                </div>
                {data.streak_days > 0 && <span className="chip" title="Дней тренировок подряд">🔥 {data.streak_days} дн.</span>}
              </div>
              <div className="spread small">
                <strong>{data.level.title}</strong>
                <span className="muted tabular">
                  {data.level.next_xp ? `${data.total_xp} / ${experience(data.level.next_xp)}` : `${experience(data.total_xp)} · максимум`}
                </span>
              </div>
              <ProgressBar value={data.level.progress} label="Прогресс до следующего уровня" />
              {data.level.next_title && <div className="small muted">Следующий уровень: {data.level.next_title}</div>}
            </section>

            <div className="grid grid-2">
              <section className="card">
                <div className="muted small">Баллы рейтинга (за 30 дней)</div>
                <div className="big-number">{data.active_points}</div>
                <Link to="/leaderboard" className="small">Смотреть рейтинг →</Link>
              </section>
              {data.expiring ? (
                <section className="card alert alert-warning">
                  <div className="small">⏳ Сгорают баллы</div>
                  <div className="big-number">{data.expiring.points}</div>
                  <div className="small">{formatDate(data.expiring.expires_at)} — пройдите сценарий, чтобы удержать позицию в рейтинге.</div>
                </section>
              ) : (
                <section className="card">
                  <div className="muted small">Пройдено сценариев</div>
                  <div className="big-number">{data.finished_attempts}</div>
                </section>
              )}
            </div>

            {data.challenges.length > 0 && (
              <section className="stack" style={{ gap: '0.6rem' }}>
                <h2>🎯 Челленджи</h2>
                {data.challenges.map((challenge) => (
                  <div key={challenge.id} className="card stack" style={{ gap: '0.4rem' }}>
                    <div className="spread">
                      <strong>{challenge.title}</strong>
                      <span className="chip">+{experience(challenge.reward_xp)}</span>
                    </div>
                    <div className="small secondary">{challenge.description}</div>
                    <ProgressBar value={challenge.progress / challenge.target} label={challenge.title} />
                    <div className="small muted">
                      {challenge.completed_at ? '✓ Выполнен' : `${challenge.progress} из ${challenge.target} · до ${formatDate(challenge.ends)}`}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </Async>

      {active && (
        <Link to={`/play/${active.active_attempt_id}`} className="card card-link alert alert-warning">
          ▶ Продолжить: <strong>{active.title}</strong>
        </Link>
      )}

      <section className="stack" style={{ gap: '0.6rem' }}>
        <h2>Рекомендуем потренировать</h2>
        <Async query={analytics}>
          {(data) => (
            <div className="grid grid-3">
              {data.recommendations.map((item) => (
                <Link key={item.scenario_id} to={`/scenarios/${item.scenario_id}`} className="card card-link">
                  <strong>{item.title}</strong>
                  <div className="small muted">{item.reason}</div>
                </Link>
              ))}
            </div>
          )}
        </Async>
        <Link to="/scenarios" className="btn btn-primary">Все сценарии</Link>
      </section>
    </div>
  )
}
