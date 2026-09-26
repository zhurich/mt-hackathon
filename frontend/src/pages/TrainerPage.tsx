import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Analytics, ScenarioSummary, TeamAnalytics, User } from '../api/types'
import { Async, Button, Card, Chip, Tabs } from '../components/ui'
import { percent } from '../labels'
import { AnalyticsView } from './ProgressPage'

const TABS = [
  { id: 'team', label: 'Бригады' },
  { id: 'employees', label: 'Сотрудники' },
  { id: 'hardest', label: 'Сложные решения' },
  { id: 'scenarios', label: 'Сценарии' },
] as const
type Tab = (typeof TABS)[number]['id']

/** Последовательная шкала одного оттенка (0 → светлый, 100 → тёмный); значение всегда подписано в ячейке. */
function heatStyle(value: number | null) {
  if (value === null) return { background: 'var(--surface-2)', color: 'var(--muted)' }
  // Границы совпадают с порогами статусов: < 50 — «проседает», ≥ 75 — «освоена».
  const step = value < 50 ? 'var(--seq-100)' : value < 65 ? 'var(--seq-300)' : value < 75 ? 'var(--seq-500)' : 'var(--seq-700)'
  const darkCell = value >= 65
  return { background: step, color: darkCell ? 'var(--surface)' : 'var(--text)' }
}

function TeamTab({ data }: { data: TeamAnalytics }) {
  const codes = Object.keys(data.competency_titles)
  const rows = [
    { key: 'company', name: 'Вся компания', sub: '', values: data.company },
    ...data.brigades.map((b) => ({ key: String(b.id), name: b.name, sub: `${b.depot} · ${b.members} чел.`, values: b.competencies })),
  ]
  return (
    <Card as="section">
      <h2 className="h3">Среднее мастерство по компетенциям, %</h2>
      <div className="table-wrap">
        <table className="heat">
          <thead>
            <tr><th>Подразделение</th>{codes.map((code) => <th key={code}>{data.competency_titles[code]}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td><strong>{row.name}</strong>{row.sub && <div className="caption muted">{row.sub}</div>}</td>
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
      <p className="small muted">
        Светлее — ниже мастерство. Самые светлые ячейки (ниже 50 %) — компетенция «проседает» и требует внимания; самые тёмные (от 75 %) — освоена.
      </p>
    </Card>
  )
}

function EmployeeDrilldown({ userId, onClose }: { userId: number; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['analytics', 'user', userId],
    queryFn: () => api.get<Analytics & { user: User }>(`/analytics/users/${userId}`),
  })
  return (
    <>
      <div><Button variant="secondary" size="sm" icon="arrow-left" onClick={onClose}>К списку сотрудников</Button></div>
      <Async query={query}>
        {(data) => (
          <>
            <h2>{data.user.display_name} · {data.user.brigade}</h2>
            <AnalyticsView data={data} />
          </>
        )}
      </Async>
    </>
  )
}

function EmployeesTab({ data }: { data: TeamAnalytics }) {
  const [selected, setSelected] = useState<number | null>(null)
  if (selected !== null) return <EmployeeDrilldown userId={selected} onClose={() => setSelected(null)} />
  return (
    <Card as="section">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Сотрудник</th><th>Уровень</th><th className="num">Сценариев</th><th className="num">Успех</th>
              <th className="num">Баллы</th><th>Проседает</th>
            </tr>
          </thead>
          <tbody>
            {data.employees.map((row) => (
              <tr key={row.user_id} className="clickable" tabIndex={0} onClick={() => setSelected(row.user_id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelected(row.user_id) }}>
                <td><strong>{row.display_name}</strong><div className="caption muted">{row.brigade}</div></td>
                <td className="secondary">{row.level_title}</td>
                <td className="num">{row.attempts}</td>
                <td className="num">{percent(row.success_rate)}</td>
                <td className="num">{row.active_points}</td>
                <td>{row.weakest ? <Chip tone="critical" icon="circle-alert">{row.weakest.title} {row.weakest.mastery}%</Chip> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Нажмите на сотрудника, чтобы открыть его аналитику.</p>
    </Card>
  )
}

function HardestTab({ data }: { data: TeamAnalytics }) {
  return (
    <>
      <p className="small secondary">Решения, в которых сотрудники чаще всего ошибаются или не успевают — кандидаты для разбора на планёрке.</p>
      {data.hardest_decisions.map((item) => (
        <Card key={`${item.scenario_id}-${item.node_id}`} gap={6}>
          <div className="spread spread-top">
            <strong>{item.scenario_title}</strong>
            <Chip tone="critical" icon="x">Ошибок {percent(item.error_rate)}</Chip>
          </div>
          <div className="small secondary">{item.situation}</div>
          <div className="small muted">Ответов: {item.answers} · из них таймаутов {percent(item.timeout_rate)}</div>
        </Card>
      ))}
    </>
  )
}

function ScenariosTab() {
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: () => api.get<ScenarioSummary[]>('/scenarios') })
  return (
    <Card as="section" gap={12}>
      <div className="spread">
        <h2 className="h3">Сценарии</h2>
        <Button size="sm" icon="plus" to="/trainer/editor/new">Создать сценарий</Button>
      </div>
      <p className="small secondary">
        Визуальный редактор: граф решений, проверка на лету, тестовый прогон и публикация без перезапуска и правки кода.
        Сотрудники получат уведомление о новом сценарии.
      </p>
      <Async query={scenarios}>
        {(items) => (
          <div className="table-wrap">
            <table>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                      <div className="caption muted"><span className="mono">{item.id}</span> · v{item.version} · {item.decisions} решений</div>
                    </td>
                    <td className="num">
                      <Button variant="secondary" size="sm" icon="pencil" to={`/trainer/editor/${item.id}`}>Редактировать</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
    </Card>
  )
}

export default function TrainerPage() {
  const [tab, setTab] = useState<Tab>('team')
  const query = useQuery({ queryKey: ['analytics', 'team'], queryFn: () => api.get<TeamAnalytics>('/analytics/team') })
  return (
    <>
      <Tabs items={TABS} value={tab} onChange={setTab} label="Разделы панели наставника" />
      {tab === 'scenarios' ? (
        <ScenariosTab />
      ) : (
        <Async query={query}>
          {(data) => (tab === 'team' ? <TeamTab data={data} /> : tab === 'employees' ? <EmployeesTab data={data} /> : <HardestTab data={data} />)}
        </Async>
      )}
    </>
  )
}
