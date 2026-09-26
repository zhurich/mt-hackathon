import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Analytics } from '../api/types'
import { Alert, Async, Card, CompetencyBars, Icon, Meter, StatCard, XpBars } from '../components/ui'
import { percent } from '../labels'

/** Аналитика компетенций. Переиспользуется на странице тренера для просмотра сотрудника. */
export function AnalyticsView({ data }: { data: Analytics }) {
  const { stats } = data
  return (
    <>
      {data.insights.length > 0 && (
        <section className="stack">
          <h2 className="section-title">Выводы</h2>
          {data.insights.map((insight) => <Alert key={insight.text} tone={insight.kind}>{insight.text}</Alert>)}
        </section>
      )}

      <div className="stats-grid">
        <StatCard label="Пройдено" value={stats.attempts} />
        <StatCard label="Успешных" value={percent(stats.success_rate)} />
        <StatCard label="Таймаутов" value={percent(stats.timeout_rate)} />
        <StatCard label="Средняя лояльность" value={stats.avg_loyalty ?? '—'} />
        <StatCard label="Средняя безопасность" value={stats.avg_safety ?? '—'} />
        <StatCard label="Время реакции" value={stats.avg_reaction_ms ? `${(stats.avg_reaction_ms / 1000).toFixed(1)} с` : '—'} />
      </div>

      <Card as="section" gap={16}>
        <h2 className="h3">Мастерство по компетенциям</h2>
        <CompetencyBars items={data.competencies} />
      </Card>

      <Card as="section" gap={16}>
        <h2 className="h3">Ролевая модель: как часто используется шаг</h2>
        <div className="meters">
          {data.role_model.map((step) => (
            <Meter key={step.code} title={step.title} value={step.share * 100} display={percent(step.share)} />
          ))}
        </div>
        <p className="small muted">Доля пройденных сценариев, в которых шаг использован хотя бы раз.</p>
      </Card>

      {data.categories.length > 0 && (
        <Card as="section">
          <h2 className="h3">По категориям ситуаций</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Категория</th><th className="num">Попыток</th><th className="num">Успех</th></tr></thead>
              <tbody>
                {data.categories.map((row) => (
                  <tr key={row.category}><td>{row.title}</td><td className="num">{row.attempts}</td><td className="num">{percent(row.success_rate)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card as="section" gap={12}>
        <h2 className="h3">Очки опыта за 30 дней</h2>
        <XpBars series={data.xp_by_day} />
      </Card>

      {data.recommendations.length > 0 && (
        <section className="stack">
          <h2 className="section-title">Что тренировать дальше</h2>
          {data.recommendations.map((item) => (
            <Card key={item.scenario_id} to={`/scenarios/${item.scenario_id}`} gap={4}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <strong className="grow">{item.title}</strong>
                <Icon name="chevron-right" size={20} className="chevron" />
              </div>
              <div className="small muted">{item.reason}</div>
            </Card>
          ))}
        </section>
      )}
    </>
  )
}

export default function ProgressPage() {
  const query = useQuery({ queryKey: ['analytics', 'me'], queryFn: () => api.get<Analytics>('/analytics/me') })
  return <Async query={query}>{(data) => <AnalyticsView data={data} />}</Async>
}
