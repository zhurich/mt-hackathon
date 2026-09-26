import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Analytics, Profile, ScenarioSummary } from '../api/types'
import { Async, Button, Card, Chip, Icon, ProgressBar, StatCard } from '../components/ui'
import { experience, formatDate } from '../labels'

export default function HomePage() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api.get<Profile>('/profile') })
  const analytics = useQuery({ queryKey: ['analytics', 'me'], queryFn: () => api.get<Analytics>('/analytics/me') })
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: () => api.get<ScenarioSummary[]>('/scenarios') })
  const active = scenarios.data?.find((scenario) => scenario.active_attempt_id !== null)

  return (
    <>
      <Async query={profile}>
        {(data) => (
          <>
            <Card gap={10}>
              <div className="spread spread-top">
                <div>
                  <div className="small muted">{data.user.brigade} · {data.user.depot}</div>
                  <h1 style={{ marginTop: 2 }}>Здравствуйте, {data.user.display_name}</h1>
                </div>
                {data.streak_days > 0 && <Chip tone="warning" icon="flame" title="Дней тренировок подряд">{data.streak_days} дн.</Chip>}
              </div>
              <div className="spread small">
                <strong>{data.level.title}</strong>
                <span className="muted tabular">
                  {data.level.next_xp ? `${data.total_xp} / ${experience(data.level.next_xp)}` : `${experience(data.total_xp)} · максимум`}
                </span>
              </div>
              <ProgressBar value={data.level.progress} label="Прогресс до следующего уровня" />
              {data.level.next_title && <div className="small muted">Следующий уровень: {data.level.next_title}</div>}
            </Card>

            {active && (
              <Card to={`/play/${active.active_attempt_id}`}>
                <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
                  <span className="tile-icon tone-accent"><Icon name="play" size={20} /></span>
                  <div className="grow">
                    <div className="caption muted">Продолжить незавершённую попытку</div>
                    <div className="strong">{active.title}</div>
                  </div>
                  <Icon name="chevron-right" size={20} className="chevron" />
                </div>
              </Card>
            )}

            <div className="grid-halves">
              <StatCard label="Баллы рейтинга за 30 дней" value={data.active_points}
                        hint={<Link to="/leaderboard">Смотреть рейтинг</Link>} />
              {data.expiring ? (
                <StatCard tone="warning" icon="hourglass" label="Сгорают баллы" value={data.expiring.points}
                          hint={`${formatDate(data.expiring.expires_at)} — пройдите сценарий, чтобы удержать позицию.`} />
              ) : (
                <StatCard label="Пройдено сценариев" value={data.finished_attempts} />
              )}
            </div>

            {data.challenges.length > 0 && (
              <>
                <h2 className="section-title">Челленджи</h2>
                {data.challenges.map((challenge) => (
                  <Card key={challenge.id}>
                    <div className="spread spread-top">
                      <h3>{challenge.title}</h3>
                      <Chip tone="info">+{experience(challenge.reward_xp)}</Chip>
                    </div>
                    <div className="small secondary">{challenge.description}</div>
                    <ProgressBar value={challenge.progress / challenge.target} tone={challenge.completed_at ? 'good' : 'info'}
                                 size="sm" label={challenge.title} />
                    {challenge.completed_at ? (
                      <div><Chip tone="good" icon="check">Выполнен</Chip></div>
                    ) : (
                      <div className="small muted">{challenge.progress} из {challenge.target} · до {formatDate(challenge.ends)}</div>
                    )}
                  </Card>
                ))}
              </>
            )}
          </>
        )}
      </Async>

      <h2 className="section-title">Рекомендуем потренировать</h2>
      <Async query={analytics}>
        {(data) => (
          <div className="grid grid-3">
            {data.recommendations.map((item) => (
              <Card key={item.scenario_id} to={`/scenarios/${item.scenario_id}`} gap={4}>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <strong className="grow">{item.title}</strong>
                  <Icon name="chevron-right" size={20} className="chevron" />
                </div>
                <div className="small muted">{item.reason}</div>
              </Card>
            ))}
          </div>
        )}
      </Async>
      <Button variant="secondary" block to="/scenarios">Все сценарии</Button>
    </>
  )
}
