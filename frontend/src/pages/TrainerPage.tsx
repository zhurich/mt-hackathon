import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Analytics, ScenarioSummary, TeamAnalytics, User } from '../api/types'
import { Async, ErrorBox } from '../components/ui'
import { percent } from '../labels'
import { AnalyticsView } from './ProgressPage'

const TABS = [
  { id: 'team', title: 'Бригады' },
  { id: 'employees', title: 'Сотрудники' },
  { id: 'hardest', title: 'Сложные решения' },
  { id: 'scenarios', title: 'Сценарии' },
] as const
type Tab = (typeof TABS)[number]['id']

/** Последовательная шкала одного оттенка (0 → светлый, 100 → тёмный); значение всегда подписано в ячейке. */
function heatStyle(value: number | null) {
  if (value === null) return { background: 'var(--surface-2)', color: 'var(--muted)' }
  const step = value < 40 ? 'var(--seq-100)' : value < 60 ? 'var(--seq-300)' : value < 80 ? 'var(--seq-500)' : 'var(--seq-700)'
  const darkCell = value >= 60
  return { background: step, color: darkCell ? 'var(--surface)' : 'var(--text)' }
}

function TeamTab({ data }: { data: TeamAnalytics }) {
  const codes = Object.keys(data.competency_titles)
  const rows = [
    { key: 'company', name: 'Вся компания', sub: '', values: data.company },
    ...data.brigades.map((b) => ({ key: String(b.id), name: b.name, sub: `${b.depot} · ${b.members} чел.`, values: b.competencies })),
  ]
  return (
    <section className="card">
      <h2>Среднее мастерство по компетенциям, %</h2>
      <div className="table-wrap">
        <table className="heat">
          <thead>
            <tr><th>Подразделение</th>{codes.map((code) => <th key={code}>{data.competency_titles[code]}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td><strong>{row.name}</strong><div className="small muted">{row.sub}</div></td>
                {codes.map((code) => (
                  <td key={code} className="cell" style={heatStyle(row.values[code])}
                      title={`${row.name} — ${data.competency_titles[code]}: ${row.values[code] ?? 'нет данных'}`}>
                    {row.values[code] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Светлее — ниже мастерство. Ниже 50 % — компетенция «проседает» и требует внимания.</p>
    </section>
  )
}

function EmployeeDrilldown({ userId, onClose }: { userId: number; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['analytics', 'user', userId],
    queryFn: () => api.get<Analytics & { user: User }>(`/analytics/users/${userId}`),
  })
  return (
    <div className="stack">
      <button className="btn" onClick={onClose}>← К списку сотрудников</button>
      <Async query={query}>
        {(data) => (
          <>
            <h2>{data.user.display_name} · {data.user.brigade}</h2>
            <AnalyticsView data={data} />
          </>
        )}
      </Async>
    </div>
  )
}

function EmployeesTab({ data }: { data: TeamAnalytics }) {
  const [selected, setSelected] = useState<number | null>(null)
  if (selected !== null) return <EmployeeDrilldown userId={selected} onClose={() => setSelected(null)} />
  return (
    <section className="card table-wrap">
      <table>
        <thead>
          <tr><th>Сотрудник</th><th>Уровень</th><th>Сценариев</th><th>Успех</th><th>Баллы</th><th>Проседает</th></tr>
        </thead>
        <tbody>
          {data.employees.map((row) => (
            <tr key={row.user_id} onClick={() => setSelected(row.user_id)} style={{ cursor: 'pointer' }}>
              <td><strong>{row.display_name}</strong><div className="small muted">{row.brigade}</div></td>
              <td className="small">{row.level_title}</td>
              <td className="tabular">{row.attempts}</td>
              <td className="tabular">{percent(row.success_rate)}</td>
              <td className="tabular">{row.active_points}</td>
              <td className="small">{row.weakest ? <span className="chip tone-critical">! {row.weakest.title} {row.weakest.mastery}%</span> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Нажмите на сотрудника, чтобы открыть его аналитику.</p>
    </section>
  )
}

function HardestTab({ data }: { data: TeamAnalytics }) {
  return (
    <div className="stack" style={{ gap: '0.6rem' }}>
      <p className="small secondary">Решения, в которых сотрудники чаще всего ошибаются или не успевают — кандидаты для разбора на планёрке.</p>
      {data.hardest_decisions.map((item) => (
        <div key={`${item.scenario_id}-${item.node_id}`} className="card stack" style={{ gap: '0.3rem' }}>
          <div className="spread">
            <strong>{item.scenario_title}</strong>
            <span className="chip tone-critical">ошибок {percent(item.error_rate)}</span>
          </div>
          <div className="small secondary">{item.situation}</div>
          <div className="small muted">Ответов: {item.answers} · из них таймаутов {percent(item.timeout_rate)}</div>
        </div>
      ))}
    </div>
  )
}

function ScenariosTab() {
  const queryClient = useQueryClient()
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: () => api.get<ScenarioSummary[]>('/scenarios') })
  const [content, setContent] = useState('')
  const validate = useMutation({
    mutationFn: () => api.post<{ valid: boolean; errors: string[]; scenario: ScenarioSummary | null }>('/scenarios/validate', { content }),
  })
  const publish = useMutation({
    mutationFn: () => api.post<ScenarioSummary>('/scenarios', { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  async function loadCurrent(id: string) {
    const graph = await api.get<Record<string, unknown>>(`/scenarios/${id}/graph`)
    setContent(JSON.stringify({ ...graph, version: Number(graph.version) + 1 }, null, 2))
    validate.reset()
    publish.reset()
  }

  return (
    <div className="stack">
      <section className="card stack" style={{ gap: '0.5rem' }}>
        <h2>Опубликованные сценарии</h2>
        <Async query={scenarios}>
          {(items) => (
            <div className="stack" style={{ gap: '0.4rem' }}>
              {items.map((item) => (
                <div key={item.id} className="spread small">
                  <span><strong>{item.title}</strong> <span className="muted">· {item.id} v{item.version} · {item.decisions} решений</span></span>
                  <button className="btn" onClick={() => loadCurrent(item.id)}>Новая версия</button>
                </div>
              ))}
            </div>
          )}
        </Async>
      </section>

      <section className="card stack" style={{ gap: '0.5rem' }}>
        <h2>Загрузка сценария (YAML или JSON)</h2>
        <p className="small secondary">
          Формат описан в <code>docs/scenario-format.md</code>. Новый сценарий появится у сотрудников сразу — с уведомлением,
          без перезапуска и правки кода.
        </p>
        <textarea rows={14} value={content} onChange={(e) => setContent(e.target.value)} placeholder="id: my-scenario&#10;version: 1&#10;…" />
        <div className="row">
          <button className="btn" disabled={!content || validate.isPending} onClick={() => validate.mutate()}>Проверить</button>
          <button className="btn btn-primary" disabled={!content || publish.isPending} onClick={() => publish.mutate()}>Опубликовать</button>
        </div>
        {validate.data && (validate.data.valid ? (
          <div className="alert alert-positive small">✓ Сценарий корректен: {validate.data.scenario?.title}, {validate.data.scenario?.decisions} решений.</div>
        ) : (
          <div className="alert alert-critical small">
            <strong>Ошибки:</strong>
            <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>{validate.data.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        ))}
        {validate.error && <ErrorBox error={validate.error} />}
        {publish.data && <div className="alert alert-positive small">✓ Опубликовано: {publish.data.title} v{publish.data.version}</div>}
        {publish.error && <ErrorBox error={publish.error} />}
      </section>
    </div>
  )
}

export default function TrainerPage() {
  const [tab, setTab] = useState<Tab>('team')
  const query = useQuery({ queryKey: ['analytics', 'team'], queryFn: () => api.get<TeamAnalytics>('/analytics/team') })
  return (
    <div className="stack">
      <h1>Команда</h1>
      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''}
                  onClick={() => setTab(item.id)}>{item.title}</button>
        ))}
      </div>
      {tab === 'scenarios' ? (
        <ScenariosTab />
      ) : (
        <Async query={query}>
          {(data) => (tab === 'team' ? <TeamTab data={data} /> : tab === 'employees' ? <EmployeesTab data={data} /> : <HardestTab data={data} />)}
        </Async>
      )}
    </div>
  )
}
