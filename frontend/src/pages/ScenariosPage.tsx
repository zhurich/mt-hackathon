import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ScenarioSummary } from '../api/types'
import { Async, Card, Chip, Difficulty, FilterChip, Icon, OutcomeChip } from '../components/ui'
import { CATEGORY_ICON } from '../labels'

export default function ScenariosPage() {
  const query = useQuery({ queryKey: ['scenarios'], queryFn: () => api.get<ScenarioSummary[]>('/scenarios') })
  const [category, setCategory] = useState<string | null>(null)

  return (
    <Async query={query}>
      {(scenarios) => {
        const categories = [...new Map(scenarios.map((s) => [s.category, s.category_title])).entries()]
        const visible = category ? scenarios.filter((s) => s.category === category) : scenarios
        return (
          <>
            <div className="filter-row" role="group" aria-label="Категория ситуаций">
              <FilterChip selected={category === null} onClick={() => setCategory(null)}>Все</FilterChip>
              {categories.map(([code, title]) => (
                <FilterChip key={code} icon={CATEGORY_ICON[code]} selected={category === code} onClick={() => setCategory(code)}>
                  {title}
                </FilterChip>
              ))}
            </div>
            <div className="grid grid-2">
              {visible.map((scenario) => (
                <Card key={scenario.id} to={`/scenarios/${scenario.id}`}>
                  <div className="spread">
                    <Chip icon={CATEGORY_ICON[scenario.category]}>{scenario.category_title}</Chip>
                    <Difficulty level={scenario.difficulty} />
                  </div>
                  <h3>{scenario.title}</h3>
                  <div className="small secondary pretty">{scenario.summary}</div>
                  <div className="row small muted" style={{ gap: 6 }}>
                    <span>Класс: {scenario.service_class_title}</span>
                    <span>·</span>
                    <span>{scenario.decisions} решений</span>
                    {scenario.has_timer && <><span>·</span><Icon name="timer" size={14} /><span>таймер</span></>}
                  </div>
                  <div className="row">
                    {scenario.my_best_outcome ? <OutcomeChip outcome={scenario.my_best_outcome} /> : <Chip>Не пройден</Chip>}
                    {scenario.my_attempts > 0 && <span className="small muted">попыток: {scenario.my_attempts}</span>}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )
      }}
    </Async>
  )
}
