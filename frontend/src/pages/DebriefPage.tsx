import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Debrief, DebriefStep, Profile } from '../api/types'
import { Alert, Async, Button, Card, Chip, Meter, OutcomeChip, Stat } from '../components/ui'
import { QUALITY, experience, signed } from '../labels'

function Delta({ label, value }: { label: string; value: number }) {
  if (value === 0) return <Chip>{label}: 0</Chip>
  return (
    <Chip tone={value > 0 ? 'good' : 'critical'} icon={value > 0 ? 'trending-up' : 'trending-down'}>
      {label} {signed(value)}
    </Chip>
  )
}

function Step({ step, titles }: { step: DebriefStep; titles: Record<string, string> }) {
  const quality = QUALITY[step.quality]
  return (
    <Card as="article">
      <div className="spread">
        <span className="small muted">Решение {step.index}</span>
        <Chip tone={quality.tone} icon={quality.icon}>{quality.title}</Chip>
      </div>
      <div className="small secondary">{step.speaker_name ? `${step.speaker_name}: ` : ''}{step.situation}</div>
      <div><strong>Ваш выбор:</strong> {step.chosen}</div>
      <div className="row" style={{ gap: 6 }}>
        <Delta label="Лояльность" value={step.delta.loyalty} />
        <Delta label="Безопасность" value={step.delta.safety} />
        {step.timer && !step.timed_out && (
          <Chip icon="timer">{(step.reaction_ms / 1000).toFixed(1)} из {step.timer} с</Chip>
        )}
      </div>
      <Alert tone={step.quality === 'best' || step.quality === 'good' ? 'positive' : 'warning'}>
        <strong>Почему: </strong>{step.feedback}
      </Alert>
      {step.interrupted && <Alert tone="critical" icon="triangle-alert">После этого решения шкала упала до критического уровня.</Alert>}
      {step.better_options.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <strong className="small">Как можно было лучше:</strong>
          {step.better_options.map((option) => (
            <Alert key={option.text} tone="positive" icon={QUALITY[option.quality].icon} title={option.text}>
              {option.feedback}
            </Alert>
          ))}
        </div>
      )}
      <div className="small muted">
        Компетенции: {step.competencies.map((code) => titles[code] ?? code).join(', ')}
      </div>
    </Card>
  )
}

export default function DebriefPage() {
  const { attemptId } = useParams()
  const query = useQuery({ queryKey: ['debrief', attemptId], queryFn: () => api.get<Debrief>(`/attempts/${attemptId}/debrief`) })
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api.get<Profile>('/profile') })
  const titles = Object.fromEntries((profile.data?.competencies ?? []).map((c) => [c.code, c.title]))

  return (
    <Async query={query}>
      {(debrief) => {
        const result = debrief.result
        return (
          <>
            <h1>{debrief.title}</h1>

            <Card as="section">
              <div><OutcomeChip outcome={debrief.ending.outcome} /></div>
              <h2>{debrief.ending.title}</h2>
              <p className="secondary">{debrief.ending.text}</p>
              <div className="stats-row" style={{ marginTop: 4 }}>
                <Stat label="Лояльность" value={result.final_loyalty} />
                <Stat label="Безопасность" value={result.final_safety} />
                <Stat label="Лучших решений" value={`${result.best_decisions}/${result.decisions}`} />
              </div>
              <div className="small muted">+{experience(result.xp)}{result.timeouts > 0 ? ` · таймаутов: ${result.timeouts}` : ''}</div>
            </Card>

            <Card as="section">
              <h2 className="h3">Ролевая модель общения</h2>
              <p className="small secondary">Признать ситуацию → Обозначить правило → Предложить решение → Заверить.</p>
              {debrief.role_model.covered.map((step) => (
                <div key={step.code}><Chip tone="good" icon="check">{step.title}</Chip></div>
              ))}
              {debrief.role_model.missing.map((step) => (
                <div key={step.code} className="stack" style={{ gap: 4 }}>
                  <div><Chip tone="critical" icon="x">{step.title}</Chip></div>
                  <div className="small secondary">Попробуйте: {step.example}</div>
                </div>
              ))}
            </Card>

            <Card as="section">
              <h2 className="h3">Компетенции в этом сценарии</h2>
              <div className="meters">
                {Object.entries(result.competency_results).map(([code, value]) => (
                  <Meter key={code} title={titles[code] ?? code} value={value} />
                ))}
              </div>
            </Card>

            <h2 className="section-title">Каждое решение</h2>
            {debrief.steps.map((step) => <Step key={step.index} step={step} titles={titles} />)}

            {debrief.sources.length > 0 && (
              <Card as="section" gap={6}>
                <h2 className="h3">Регламенты</h2>
                <ul className="small secondary">
                  {debrief.sources.map((source) => <li key={source}>{source}</li>)}
                </ul>
              </Card>
            )}
            <Button size="lg" block to={`/scenarios/${debrief.scenario_id}`}>Пройти ещё раз</Button>
          </>
        )
      }}
    </Async>
  )
}
