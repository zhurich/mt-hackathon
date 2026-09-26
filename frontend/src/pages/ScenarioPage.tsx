import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { AttemptView, ScenarioDetail } from '../api/types'
import { Async, Button, Card, Chip, Difficulty, ErrorBox, OutcomeChip } from '../components/ui'
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
        <>
          <div className="row" style={{ gap: 6 }}>
            <Chip icon={CATEGORY_ICON[scenario.category]}>{scenario.category_title}</Chip>
            <Chip>Класс: {scenario.service_class_title}</Chip>
            <Difficulty level={scenario.difficulty} showLabel />
            {scenario.my_best_outcome && <OutcomeChip outcome={scenario.my_best_outcome} />}
          </div>
          <h1>{scenario.title}</h1>
          <Card as="section" gap={6}>
            <h2 className="h3">Вводная</h2>
            <p className="pre-line">{scenario.briefing}</p>
          </Card>
          <Card as="section">
            <h2 className="h3">Как это работает</h2>
            <p className="small secondary">
              Каждое решение меняет две шкалы: <strong>лояльность пассажира</strong> и <strong>рейтинг безопасности</strong>.
              От них зависит, как будет развиваться ситуация.
              {scenario.has_timer && ' В критические моменты работает таймер — если не успеть, ситуация развивается сама, и обычно не в Вашу пользу.'}
            </p>
            <p className="small secondary">
              Старт: лояльность {scenario.initial_loyalty}, безопасность {scenario.initial_safety}. Решений в сценарии: {scenario.decisions}.
              Подробный разбор с объяснениями — после финала.
            </p>
          </Card>
          {scenario.sources.length > 0 && (
            <Card as="section" gap={6}>
              <h2 className="h3">Основано на регламентах</h2>
              <ul className="small secondary">
                {scenario.sources.map((source) => <li key={source}>{source}</li>)}
              </ul>
            </Card>
          )}
          {start.error && <ErrorBox error={start.error} />}
          <Button size="lg" block loading={start.isPending} onClick={() => start.mutate()}>
            {scenario.active_attempt_id ? 'Начать заново' : 'Начать сценарий'}
          </Button>
          {scenario.active_attempt_id && (
            <Button variant="secondary" size="lg" block to={`/play/${scenario.active_attempt_id}`}>
              Продолжить незавершённую попытку
            </Button>
          )}
        </>
      )}
    </Async>
  )
}
