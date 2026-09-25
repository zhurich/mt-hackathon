import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Debrief, DebriefStep, Profile } from '../api/types'
import { Async, OutcomeChip } from '../components/ui'
import { QUALITY, signed } from '../labels'

function Delta({ label, value }: { label: string; value: number }) {
  if (value === 0) return <span className="chip">{label}: 0</span>
  return <span className={`chip tone-${value > 0 ? 'good' : 'critical'}`}>{value > 0 ? '▲' : '▼'} {label} {signed(value)}</span>
}

function Step({ step, titles }: { step: DebriefStep; titles: Record<string, string> }) {
  const quality = QUALITY[step.quality]
  return (
    <article className="card stack" style={{ gap: '0.6rem' }}>
      <div className="spread">
        <span className="small muted">Решение {step.index}</span>
        <span className={`chip tone-${quality.tone}`}>{quality.icon} {quality.title}</span>
      </div>
      <div className="small secondary">{step.speaker_name ? `${step.speaker_name}: ` : ''}{step.situation}</div>
      <div><strong>Ваш выбор:</strong> {step.chosen}</div>
      <div className="row">
        <Delta label="Лояльность" value={step.delta.loyalty} />
        <Delta label="Безопасность" value={step.delta.safety} />
        {step.timer && !step.timed_out && (
          <span className="chip">⏱ {(step.reaction_ms / 1000).toFixed(1)} из {step.timer} с</span>
        )}
      </div>
      <div className={`alert alert-${step.quality === 'best' || step.quality === 'good' ? 'positive' : 'warning'} small`}>
        <strong>Почему: </strong>{step.feedback}
      </div>
      {step.interrupted && <div className="alert alert-critical small">⚠ После этого решения шкала упала до критического уровня.</div>}
      {step.better_options.length > 0 && (
        <div className="stack" style={{ gap: '0.4rem' }}>
          <strong className="small">Как можно было лучше:</strong>
          {step.better_options.map((option) => (
            <div key={option.text} className="alert alert-positive small">
              <div>{QUALITY[option.quality].icon} {option.text}</div>
              <div className="secondary" style={{ marginTop: 4 }}>{option.feedback}</div>
            </div>
          ))}
        </div>
      )}
      <div className="row small muted">
        Компетенции: {step.competencies.map((code) => titles[code] ?? code).join(', ')}
      </div>
    </article>
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
          <div className="stack">
            <Link to={`/scenarios/${debrief.scenario_id}`} className="small muted">← {debrief.title}</Link>
            <h1>Разбор решений</h1>

            <section className="card stack" style={{ gap: '0.5rem' }}>
              <OutcomeChip outcome={debrief.ending.outcome} />
              <h2 style={{ margin: 0 }}>{debrief.ending.title}</h2>
              <p className="secondary">{debrief.ending.text}</p>
              <div className="grid grid-3 small">
                <div><div className="muted">Лояльность</div><strong className="big-number">{result.final_loyalty}</strong></div>
                <div><div className="muted">Безопасность</div><strong className="big-number">{result.final_safety}</strong></div>
                <div><div className="muted">Лучших решений</div><strong className="big-number">{result.best_decisions}/{result.decisions}</strong></div>
              </div>
              <div className="small muted">+{result.xp} XP{result.timeouts > 0 ? ` · таймаутов: ${result.timeouts}` : ''}</div>
            </section>

            <section className="card stack" style={{ gap: '0.5rem' }}>
              <h2>Ролевая модель общения</h2>
              <p className="small secondary">Признать ситуацию → Обозначить правило → Предложить решение → Заверить.</p>
              {debrief.role_model.covered.map((step) => (
                <div key={step.code} className="small"><span className="chip tone-good">✓ {step.title}</span></div>
              ))}
              {debrief.role_model.missing.map((step) => (
                <div key={step.code} className="small">
                  <span className="chip tone-critical">✕ {step.title}</span>
                  <div className="secondary" style={{ marginTop: 2 }}>Попробуйте: {step.example}</div>
                </div>
              ))}
            </section>

            <section className="card stack" style={{ gap: '0.5rem' }}>
              <h2>Компетенции в этом сценарии</h2>
              {Object.entries(result.competency_results).map(([code, value]) => (
                <div key={code} className="hbar">
                  <span className="small">{titles[code] ?? code}</span>
                  <div className="hbar-track" aria-hidden><div className="hbar-fill" style={{ width: `${value}%` }} /></div>
                  <span className="small tabular" style={{ textAlign: 'right' }}>{value}%</span>
                </div>
              ))}
            </section>

            <h2>Каждое решение</h2>
            {debrief.steps.map((step) => <Step key={step.index} step={step} titles={titles} />)}

            {debrief.sources.length > 0 && (
              <section className="card">
                <h3>Регламенты</h3>
                <ul className="small secondary" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {debrief.sources.map((source) => <li key={source}>{source}</li>)}
                </ul>
              </section>
            )}
            <Link to={`/scenarios/${debrief.scenario_id}`} className="btn btn-primary btn-block">Пройти ещё раз</Link>
          </div>
        )
      }}
    </Async>
  )
}
