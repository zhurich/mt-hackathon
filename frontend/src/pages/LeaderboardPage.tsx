import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Leaderboard } from '../api/types'
import { Async } from '../components/ui'

const SCOPES = [
  { id: 'brigade', title: 'Бригада' },
  { id: 'depot', title: 'Депо' },
  { id: 'company', title: 'Компания' },
] as const

const MEDAL = ['🥇', '🥈', '🥉']

export default function LeaderboardPage() {
  const [scope, setScope] = useState<Leaderboard['scope']>('brigade')
  const query = useQuery({
    queryKey: ['leaderboard', scope],
    queryFn: () => api.get<Leaderboard>(`/leaderboard?scope=${scope}`),
  })

  return (
    <div className="stack">
      <h1>Рейтинг</h1>
      <div className="tabs" role="tablist">
        {SCOPES.map((item) => (
          <button key={item.id} role="tab" aria-selected={scope === item.id}
                  className={scope === item.id ? 'active' : ''} onClick={() => setScope(item.id)}>
            {item.title}
          </button>
        ))}
      </div>
      <p className="small muted">
        Места определяются баллами за последние 30 дней — старые баллы сгорают, поэтому важно тренироваться регулярно.
      </p>
      <Async query={query}>
        {(board) => (
          <section className="card">
            <div className="spread" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>{board.scope_name}</h2>
              {board.me && <span className="chip">Вы на {board.me.rank} месте</span>}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Проводник</th><th>Уровень</th><th style={{ textAlign: 'right' }}>Баллы</th></tr>
                </thead>
                <tbody>
                  {board.entries.map((entry) => (
                    <tr key={entry.user_id} style={entry.is_me ? { background: 'var(--surface-2)', fontWeight: 600 } : undefined}>
                      <td className="tabular">{MEDAL[entry.rank - 1] ?? entry.rank}</td>
                      <td>
                        {entry.display_name}{entry.is_me && ' (вы)'}
                        {scope !== 'brigade' && <div className="small muted">{entry.brigade}</div>}
                      </td>
                      <td className="small secondary">{entry.level_title}</td>
                      <td className="tabular" style={{ textAlign: 'right' }}>{entry.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Async>
    </div>
  )
}
