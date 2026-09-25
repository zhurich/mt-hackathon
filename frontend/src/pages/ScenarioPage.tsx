import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { AttemptView, ScenarioDetail } from '../api/types'
import { Async, ErrorBox, OutcomeChip } from '../components/ui'
import { CATEGORY_ICON } from '../labels'

export default function ScenarioPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['scenario', id], queryFn: () => api.get<ScenarioDetail>(`/scenarios/${id}`) })
  const start = useMutation({
    mutationFn: () => api.post<AttemptView>('/attempts', { scenario_id: id }),
    onSuccess: (attempt) => navigate(`/play/${attempt.id}`, { state: attempt }),
  })

  return (
    <Async query={query}>
      {(scenario) => (
        <div className="stack">
          <Link to="/scenarios" className="small muted">← Все сценарии</Link>
          <div className="row">
            <span className="chip">{CATEGORY_ICON[scenario.category]} {scenario.category_title}</span>
            <span className="chip">Класс: {scenario.service_class_title}</span>
            <span className="chip">Сложность {scenario.difficulty}/3</span>
            {scenario.my_best_outcome && <OutcomeChip outcome={scenario.my_best_outcome} />}
          </div>
          <h1>{scenario.title}</h1>
          <section className="card">
            <h2>Вводная</h2>
            <p style={{ whiteSpace: 'pre-line' }}>{scenario.briefing}</p>
          </section>
          <section className="card stack" style={{ gap: '0.5rem' }}>
            <h2>Как это работает</h2>
            <p className="small secondary">
              Каждое решение меняет две шкалы: <strong>лояльность пассажира</strong> и <strong>рейтинг безопасности</strong>.
              От них зависит, как будет развиваться ситуация. {scenario.has_timer && 'В критические моменты работает таймер — если не успеть, ситуация развивается сама, и обычно не в вашу пользу.'}
            </p>
            <p className="small secondary">
              Старт: лояльность {scenario.initial_loyalty}, безопасность {scenario.initial_safety}. Решений в сценарии: {scenario.decisions}.
              Подробный разбор с объяснениями — после финала.
            </p>
          </section>
          {scenario.sources.length > 0 && (
            <section className="card">
              <h3>Основано на регламентах</h3>
              <ul className="small secondary" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {scenario.sources.map((source) => <li key={source}>{source}</li>)}
              </ul>
            </section>
          )}
          {start.error && <ErrorBox error={start.error} />}
          <button className="btn btn-primary btn-block" onClick={() => start.mutate()} disabled={start.isPending}>
            {scenario.active_attempt_id ? 'Начать заново' : 'Начать сценарий'}
          </button>
          {scenario.active_attempt_id && (
            <Link to={`/play/${scenario.active_attempt_id}`} className="btn btn-block">Продолжить незавершённую попытку</Link>
          )}
        </div>
      )}
    </Async>
  )
}
