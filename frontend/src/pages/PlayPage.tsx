import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { AttemptView } from '../api/types'
import { ACHIEVEMENT_ICON, SPEAKER, experience } from '../labels'
import { ErrorBox, Loader, OutcomeChip, ProgressBar, ScaleBar } from '../components/ui'

interface TranscriptItem {
  speaker: string
  situation: string
  answer: string
}

/** Сколько миллисекунд осталось до дедлайна узла — по часам сервера (с поправкой на расхождение часов).
 * Остаток считается при каждом рендере от актуального дедлайна, интервал лишь перерисовывает экран —
 * так после перехода в новый узел не остаётся «старого нуля», который отправил бы лишний таймаут. */
function useCountdown(view: AttemptView | null, clockOffset: number): number | null {
  const deadline = view?.node?.deadline_ms ?? null
  const [, rerender] = useState(0)
  useEffect(() => {
    if (deadline === null) return
    const id = window.setInterval(() => rerender((n) => n + 1), 200)
    return () => window.clearInterval(id)
  }, [deadline])
  return deadline === null ? null : Math.max(0, deadline - (Date.now() + clockOffset))
}

export default function PlayPage() {
  const { attemptId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [view, setView] = useState<AttemptView | null>((location.state as AttemptView | null) ?? null)
  const [clockOffset, setClockOffset] = useState(() => (view ? view.server_time_ms - Date.now() : 0))
  const [transcript, setTranscript] = useState<TranscriptItem[]>([])
  const [error, setError] = useState<unknown>(null)
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)

  const accept = useCallback((next: AttemptView) => {
    setView(next)
    setClockOffset(next.server_time_ms - Date.now())
  }, [])

  useEffect(() => {
    if (view && String(view.id) === attemptId) return
    api.get<AttemptView>(`/attempts/${attemptId}`).then(accept).catch(setError)
  }, [attemptId, view, accept])

  const submit = useCallback(
    async (choiceId: string | null) => {
      if (!view?.node || submitting.current) return
      submitting.current = true
      setBusy(true)
      const node = view.node
      const answer = choiceId ? node.choices.find((c) => c.id === choiceId)?.text ?? '' : '⏱ Вы не успели принять решение'
      try {
        const next = await api.post<AttemptView>(
          `/attempts/${view.id}/decisions`,
          choiceId ? { choice_id: choiceId } : { timeout: true },
        )
        setTranscript((items) => [...items, { speaker: node.speaker_name ?? SPEAKER[node.speaker], situation: node.text, answer }])
        accept(next)
        if (next.status === 'finished') {
          for (const key of ['profile', 'scenarios', 'notifications', 'analytics', 'leaderboard', 'attempts']) {
            queryClient.invalidateQueries({ queryKey: [key] })
          }
        }
      } catch (err) {
        setError(err)
      } finally {
        submitting.current = false
        setBusy(false)
      }
    },
    [view, accept, queryClient],
  )

  const remaining = useCountdown(view?.status === 'active' ? view : null, clockOffset)
  useEffect(() => {
    if (remaining === 0) submit(null)
  }, [remaining, submit])

  if (error && !view) return <ErrorBox error={error} />
  if (!view) return <Loader />

  const delta = view.last?.delta

  return (
    <div className="stack">
      <div className="spread">
        <Link to="/scenarios" className="small muted">✕ Выйти</Link>
        <strong className="small">{view.scenario_title}</strong>
        <span className="small muted">Шаг {view.step + (view.node ? 1 : 0)}</span>
      </div>

      <section className="card stack" style={{ gap: '0.5rem' }} aria-label="Шкалы">
        <ScaleBar label="Лояльность" value={view.loyalty} delta={delta?.loyalty} color="var(--series-1)" />
        <ScaleBar label="Безопасность" value={view.safety} delta={delta?.safety} color="var(--series-2)" />
        {view.hud.map((item) => (
          <div key={item.name} className="spread small">
            <span className="secondary">{item.label}</span>
            <strong className="tabular">{Math.max(0, item.value)}</strong>
          </div>
        ))}
      </section>

      {view.last?.timed_out && view.status === 'active' && (
        <div className="alert alert-critical small">⏱ Время вышло — ситуация развивается без вашего участия.</div>
      )}
      {view.last?.interrupted && (
        <div className="alert alert-critical small">⚠ Шкала упала до критического уровня — ситуация резко изменилась.</div>
      )}

      {transcript.length > 0 && (
        <details className="small">
          <summary className="muted">Ход событий ({transcript.length})</summary>
          <ol className="stack" style={{ gap: '0.4rem', paddingLeft: '1.2rem', marginTop: '0.5rem' }}>
            {transcript.map((item, index) => (
              <li key={index}>
                <div className="muted">{item.situation}</div>
                <div>Вы: {item.answer}</div>
              </li>
            ))}
          </ol>
        </details>
      )}

      {view.node && (
        <section className="stack" style={{ gap: '0.75rem' }}>
          {view.node.timer && remaining !== null && (
            <div>
              <div className="spread small">
                <span className="muted">Время на решение</span>
                <strong className="tabular">{Math.ceil(remaining / 1000)} с</strong>
              </div>
              <div className={`timer ${remaining < 5000 ? 'urgent' : ''}`}>
                <div style={{ width: `${(remaining / (view.node.timer * 1000)) * 100}%` }} />
              </div>
            </div>
          )}
          <div className="bubble">
            <div className="bubble-speaker">{view.node.speaker_name ?? SPEAKER[view.node.speaker]}</div>
            <div className="bubble-text">{view.node.text}</div>
          </div>
          <div className="stack" style={{ gap: '0.5rem' }} role="group" aria-label="Варианты действий">
            {view.node.choices.map((choice) => (
              <button key={choice.id} className="choice" disabled={busy} onClick={() => submit(choice.id)}>
                {choice.text}
              </button>
            ))}
          </div>
          {error !== null && <ErrorBox error={error} />}
        </section>
      )}

      {view.ending && <Result view={view} onRetry={() => navigate(`/scenarios/${view.scenario_id}`)} />}
    </div>
  )
}

function Result({ view, onRetry }: { view: AttemptView; onRetry: () => void }) {
  const ending = view.ending!
  const rewards = view.rewards
  return (
    <section className="stack">
      <div className="card stack" style={{ gap: '0.5rem' }}>
        <OutcomeChip outcome={ending.outcome} />
        <h2 style={{ margin: 0 }}>{ending.title}</h2>
        <p className="secondary">{ending.text}</p>
      </div>
      {rewards && (
        <div className="card stack" style={{ gap: '0.6rem' }}>
          <div className="spread">
            <span>Получено</span>
            <strong className="big-number">+{experience(rewards.xp)}</strong>
          </div>
          {rewards.level_up && <div className="alert alert-positive">⬆️ Новый уровень: <strong>{rewards.level.title}</strong></div>}
          <div className="small muted">{rewards.level.title}{rewards.level.next_xp ? ` · ${rewards.level.xp} / ${experience(rewards.level.next_xp)}` : ''}</div>
          <ProgressBar value={rewards.level.progress} label="Прогресс уровня" />
          {rewards.new_achievements.map((item) => (
            <div key={item.code} className="alert alert-positive">
              {ACHIEVEMENT_ICON[item.icon] ?? '🏅'} Достижение: <strong>{item.title}</strong>
              <div className="small secondary">{item.description}</div>
            </div>
          ))}
          {rewards.completed_challenges.map((item) => (
            <div key={item.id} className="alert alert-positive">🏁 Челлендж «{item.title}» выполнен: +{experience(item.reward_xp)}</div>
          ))}
        </div>
      )}
      <Link to={`/attempts/${view.id}/debrief`} className="btn btn-primary btn-block">Разбор решений</Link>
      <div className="grid grid-2">
        <button className="btn" onClick={onRetry}>Пройти ещё раз</button>
        <Link to="/scenarios" className="btn">К сценариям</Link>
      </div>
    </section>
  )
}
