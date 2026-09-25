import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ScenarioSummary } from '../api/types'
import { Async, OutcomeChip } from '../components/ui'
import { CATEGORY_ICON } from '../labels'

export default function ScenariosPage() {
  const query = useQuery({ queryKey: ['scenarios'], queryFn: () => api.get<ScenarioSummary[]>('/scenarios') })
  const [category, setCategory] = useState<string | null>(null)

  return (
    <div className="stack">
      <h1>Сценарии</h1>
      <Async query={query}>
        {(scenarios) => {
          const categories = [...new Map(scenarios.map((s) => [s.category, s.category_title])).entries()]
          const visible = category ? scenarios.filter((s) => s.category === category) : scenarios
          return (
            <>
              <div className="row">
                <button className={`chip ${category === null ? 'tone-good' : ''}`} style={{ border: 0, cursor: 'pointer' }}
                        onClick={() => setCategory(null)}>Все</button>
                {categories.map(([code, title]) => (
                  <button key={code} className={`chip ${category === code ? 'tone-good' : ''}`}
                          style={{ border: 0, cursor: 'pointer' }} onClick={() => setCategory(code)}>
                    {CATEGORY_ICON[code]} {title}
                  </button>
                ))}
              </div>
              <div className="grid grid-2">
                {visible.map((scenario) => (
                  <Link key={scenario.id} to={`/scenarios/${scenario.id}`} className="card card-link stack" style={{ gap: '0.5rem' }}>
                    <div className="spread">
                      <span className="chip">{CATEGORY_ICON[scenario.category]} {scenario.category_title}</span>
                      <span className="small muted" aria-label={`Сложность ${scenario.difficulty} из 3`}>
                        {'●'.repeat(scenario.difficulty)}{'○'.repeat(3 - scenario.difficulty)}
                      </span>
                    </div>
                    <strong>{scenario.title}</strong>
                    <div className="small secondary">{scenario.summary}</div>
                    <div className="row small muted">
                      <span>Класс: {scenario.service_class_title}</span>
                      <span>· {scenario.decisions} решений</span>
                      {scenario.has_timer && <span>· ⏱ таймер</span>}
                    </div>
                    <div className="row">
                      {scenario.my_best_outcome ? <OutcomeChip outcome={scenario.my_best_outcome} /> : <span className="chip">Не пройден</span>}
                      {scenario.my_attempts > 0 && <span className="small muted">попыток: {scenario.my_attempts}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )
        }}
      </Async>
    </div>
  )
}
