import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Analytics } from '../api/types'
import { Async, CompetencyBars, XpBars } from '../components/ui'
import { percent } from '../labels'

const INSIGHT_ICON = { warning: '⚠', info: 'ℹ', positive: '✓' }

/** Аналитика компетенций. Переиспользуется на странице тренера для просмотра сотрудника. */
export function AnalyticsView({ data }: { data: Analytics }) {
  const { stats } = data
  return (
    <div className="stack">
      <section className="stack" style={{ gap: '0.5rem' }}>
        <h2>Выводы</h2>
        {data.insights.map((insight) => (
          <div key={insight.text} className={`alert alert-${insight.kind}`}>
            <span aria-hidden>{INSIGHT_ICON[insight.kind]} </span>{insight.text}
          </div>
        ))}
      </section>

      <div className="grid grid-3">
        <div className="card"><div className="muted small">Пройдено</div><div className="big-number">{stats.attempts}</div></div>
        <div className="card"><div className="muted small">Успешных</div><div className="big-number">{percent(stats.success_rate)}</div></div>
        <div className="card"><div className="muted small">Таймаутов</div><div className="big-number">{percent(stats.timeout_rate)}</div></div>
        <div className="card"><div className="muted small">Средняя лояльность</div><div className="big-number">{stats.avg_loyalty ?? '—'}</div></div>
        <div className="card"><div className="muted small">Средняя безопасность</div><div className="big-number">{stats.avg_safety ?? '—'}</div></div>
        <div className="card"><div className="muted small">Время реакции</div><div className="big-number">{stats.avg_reaction_ms ? `${(stats.avg_reaction_ms / 1000).toFixed(1)} с` : '—'}</div></div>
      </div>

      <section className="card">
        <h2>Мастерство по компетенциям</h2>
        <CompetencyBars items={data.competencies} />
      </section>

      <section className="card stack" style={{ gap: '0.6rem' }}>
        <h2>Ролевая модель: как часто используется шаг</h2>
        {data.role_model.map((step) => (
          <div key={step.code} className="hbar">
            <span className="small">{step.title}</span>
            <div className="hbar-track" aria-hidden><div className="hbar-fill" style={{ width: `${step.share * 100}%` }} /></div>
            <span className="small tabular" style={{ textAlign: 'right' }}>{percent(step.share)}</span>
          </div>
        ))}
        <p className="small muted">Доля пройденных сценариев, в которых вы использовали шаг хотя бы раз.</p>
      </section>

      {data.categories.length > 0 && (
        <section className="card">
          <h2>По категориям ситуаций</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Категория</th><th>Попыток</th><th>Успех</th></tr></thead>
              <tbody>
                {data.categories.map((row) => (
                  <tr key={row.category}><td>{row.title}</td><td className="tabular">{row.attempts}</td><td className="tabular">{percent(row.success_rate)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2>XP за 30 дней</h2>
        <XpBars series={data.xp_by_day} />
      </section>

      {data.recommendations.length > 0 && (
        <section className="stack" style={{ gap: '0.5rem' }}>
          <h2>Что тренировать дальше</h2>
          {data.recommendations.map((item) => (
            <Link key={item.scenario_id} to={`/scenarios/${item.scenario_id}`} className="card card-link">
              <strong>{item.title}</strong>
              <div className="small muted">{item.reason}</div>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}

export default function ProgressPage() {
  const query = useQuery({ queryKey: ['analytics', 'me'], queryFn: () => api.get<Analytics>('/analytics/me') })
  return (
    <div className="stack">
      <h1>Развитие</h1>
      <Async query={query}>{(data) => <AnalyticsView data={data} />}</Async>
    </div>
  )
}
