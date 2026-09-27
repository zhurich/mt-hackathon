import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { AttemptHistoryItem, Profile } from '../api/types'
import { useAuth } from '../auth'
import { Async, Button, Card, ErrorBox, Icon, OutcomeChip, ProgressBar } from '../components/ui'
import { ACHIEVEMENT_ICON, experience, formatDate, formatDateTime } from '../labels'

export default function ProfilePage() {
  const { logout } = useAuth()
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api.get<Profile>('/profile') })
  const history = useQuery({ queryKey: ['attempts'], queryFn: () => api.get<AttemptHistoryItem[]>('/attempts?limit=20') })
  const queryClient = useQueryClient()
  const reset = useMutation({
    mutationFn: () => api.post('/profile/reset'),
    onSuccess: () => {
      for (const key of ['profile', 'scenarios', 'notifications', 'analytics', 'leaderboard', 'attempts']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })

  function confirmReset() {
    if (window.confirm('Сбросить статистику? Будут удалены история прохождений, очки опыта, баллы рейтинга, достижения и челленджи. Отменить сброс нельзя.')) {
      reset.mutate()
    }
  }

  return (
    <>
      <Async query={profile}>
        {(data) => {
          const earned = data.achievements.filter((a) => a.earned_at).length
          return (
            <>
              <Card as="section" gap={10}>
                <div>
                  <h1>{data.user.display_name}</h1>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    Табельный № {data.user.employee_code} · {data.user.brigade ?? 'без бригады'}{data.user.depot ? ` · ${data.user.depot}` : ''}
                  </div>
                </div>
                <div className="spread small">
                  <strong>{data.level.title}</strong>
                  <span className="muted tabular">{experience(data.total_xp)}</span>
                </div>
                <ProgressBar value={data.level.progress} label="Прогресс уровня" />
                <div className="row small muted" style={{ gap: 6 }}>
                  <span>Баллы рейтинга: <strong className="secondary">{data.active_points}</strong></span>
                  <span>·</span>
                  <span className="inline-icon" style={{ gap: 4 }}><Icon name="flame" size={14} />Серия: {data.streak_days} дн.</span>
                  <span>·</span>
                  <span>Сценариев: {data.finished_attempts}</span>
                </div>
              </Card>

              <h2 className="section-title">Достижения · {earned} из {data.achievements.length}</h2>
              <div className="grid grid-2">
                {data.achievements.map((item) => (
                  <Card key={item.code}>
                    <div className="row" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                      <span className={`tile-icon${item.earned_at ? ' tone-soft' : ''}`}>
                        <Icon name={ACHIEVEMENT_ICON[item.icon] ?? 'award'} size={20} />
                      </span>
                      <div className="grow stack" style={{ gap: 4 }}>
                        <strong>{item.title}</strong>
                        <div className="small secondary">{item.description}</div>
                        {item.earned_at ? (
                          <div className="small muted inline-icon" style={{ gap: 4 }}>
                            <Icon name="check" size={14} />Получено {formatDate(item.earned_at)}
                          </div>
                        ) : (
                          <div className="stack" style={{ gap: 4, marginTop: 4 }}>
                            <ProgressBar value={item.progress / item.target} size="sm" tone="neutral" label={item.title} />
                            <div className="caption muted tabular">{item.progress} / {item.target}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )
        }}
      </Async>

      <h2 className="section-title">История прохождений</h2>
      <Async query={history}>
        {(items) =>
          items.length === 0 ? (
            <Card tone="muted">
              <span className="small secondary">Пока нет пройденных сценариев. <Link to="/scenarios">Выберите первый сценарий</Link>.</span>
            </Card>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {items.map((item) => (
                <Card key={item.id} to={`/attempts/${item.id}/debrief`}>
                  <div className="spread spread-top">
                    <div className="grow">
                      <strong>{item.scenario_title}</strong>
                      <div className="small muted">
                        {formatDateTime(item.finished_at)} · лояльность {item.final_loyalty} · безопасность {item.final_safety}
                      </div>
                    </div>
                    <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                      <OutcomeChip outcome={item.outcome} />
                      <span className="small muted">+{experience(item.xp)}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </Async>

      <div className="stack" style={{ gap: 8 }}>
        <Button variant="secondary" block icon="rotate-ccw" loading={reset.isPending} onClick={confirmReset}>Сбросить статистику</Button>
        {reset.error && <ErrorBox error={reset.error} />}
        <Button variant="secondary" block icon="log-out" onClick={logout}>Выйти из аккаунта</Button>
      </div>
    </>
  )
}
