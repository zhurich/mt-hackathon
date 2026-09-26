import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Leaderboard } from '../api/types'
import { Async, Card, Chip, Icon, Tabs } from '../components/ui'

const SCOPES = [
  { id: 'brigade', label: 'Бригада' },
  { id: 'depot', label: 'Депо' },
  { id: 'company', label: 'Компания' },
] as const

export default function LeaderboardPage() {
  const [scope, setScope] = useState<Leaderboard['scope']>('brigade')
  const query = useQuery({
    queryKey: ['leaderboard', scope],
    queryFn: () => api.get<Leaderboard>(`/leaderboard?scope=${scope}`),
  })

  return (
    <>
      <Tabs items={SCOPES} value={scope} onChange={setScope} label="Уровень рейтинга" />
      <p className="small muted">
        Места определяются баллами за последние 30 дней. Старые баллы сгорают, поэтому важно тренироваться регулярно.
      </p>
      <Async query={query}>
        {(board) => (
          <Card as="section">
            <div className="spread">
              <h2 className="h3">{board.scope_name}</h2>
              {board.me && <Chip tone="accent">Вы на {board.me.rank} месте</Chip>}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th style={{ width: 48 }}>Место</th><th>Проводник</th><th>Уровень</th><th className="num">Баллы</th></tr>
                </thead>
                <tbody>
                  {board.entries.map((entry) => (
                    <tr key={entry.user_id} className={entry.is_me ? 'is-me' : undefined}>
                      <td>
                        <span className="rank">
                          {entry.rank}
                          {entry.rank <= 3 && <Icon name="trophy" size={14} label={`${entry.rank} место`} />}
                        </span>
                      </td>
                      <td>
                        {entry.display_name}{entry.is_me && ' (Вы)'}
                        {scope !== 'brigade' && <div className="caption muted">{entry.brigade}</div>}
                      </td>
                      <td className="secondary">{entry.level_title}</td>
                      <td className="num">{entry.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Async>
    </>
  )
}
