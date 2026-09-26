import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { AttemptView } from '../api/types'
import { ACHIEVEMENT_ICON, SPEAKER, SPEAKER_ICON, experience, levelProgress } from '../labels'
import {
  Alert, Button, Card, ChoiceButton, ErrorBox, IconButton, Loader, OutcomeChip, ProgressBar, ScaleBar, SpeechBubble, Stat, Timer,
} from '../components/ui'

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
      const answer = choiceId ? node.choices.find((c) => c.id === choiceId)?.text ?? '' : 'Вы не успели принять решение'
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
  const node = view.node

  return (
    <>
      <div className="row" style={{ flexWrap: 'nowrap', margin: '-8px -8px 0' }}>
        <IconButton icon="x" label="Выйти к сценариям" onClick={() => navigate('/scenarios')} />
        <strong className="grow label strong">{view.scenario_title}</strong>
        <span className="small muted" style={{ paddingRight: 8 }}>{node ? `Шаг ${view.step + 1}` : 'Финал'}</span>
      </div>

      <Card as="section" gap={10} aria-label="Шкалы">
        <ScaleBar label="Лояльность" value={view.loyalty} delta={delta?.loyalty} />
        <ScaleBar label="Безопасность" kind="safety" value={view.safety} delta={delta?.safety} />
        {view.hud.map((item) => (
          <div key={item.name} className="spread small">
            <span className="secondary">{item.label}</span>
            <strong className="tabular">{Math.max(0, item.value)}</strong>
          </div>
        ))}
      </Card>

      {view.last?.timed_out && view.status === 'active' && (
        <Alert tone="critical" icon="timer">Время вышло — ситуация развивается без Вашего участия.</Alert>
      )}
      {view.last?.interrupted && (
        <Alert tone="critical" icon="triangle-alert">Шкала упала до критического уровня — ситуация резко изменилась.</Alert>
      )}

      {transcript.length > 0 && (
        <Card tone="muted" padding="sm">
          <details className="transcript">
            <summary>Ход событий ({transcript.length})</summary>
            <ol>
              {transcript.map((item, index) => (
                <li key={index}>
                  <div className="muted">{item.situation}</div>
                  <div>Вы: {item.answer}</div>
                </li>
              ))}
            </ol>
          </details>
        </Card>
      )}

      {node && (
        <>
          {node.timer && remaining !== null && <Timer remainingMs={remaining} totalMs={node.timer * 1000} />}
          <SpeechBubble kind={node.speaker === 'narrator' ? 'narrator' : 'person'} icon={SPEAKER_ICON[node.speaker]}
                        speaker={node.speaker_name ?? SPEAKER[node.speaker]}>
            {node.text}
          </SpeechBubble>
          <div className="stack" style={{ gap: 8 }} role="group" aria-label="Варианты действий">
            {node.choices.map((choice) => (
              <ChoiceButton key={choice.id} disabled={busy} onClick={() => submit(choice.id)}>{choice.text}</ChoiceButton>
            ))}
          </div>
          {error !== null && <ErrorBox error={error} />}
        </>
      )}

      {view.ending && <Result view={view} onRetry={() => navigate(`/scenarios/${view.scenario_id}`)} />}
    </>
  )
}

function Result({ view, onRetry }: { view: AttemptView; onRetry: () => void }) {
  const ending = view.ending!
  const rewards = view.rewards
  return (
    <>
      <Card>
        <div><OutcomeChip outcome={ending.outcome} /></div>
        <h2>{ending.title}</h2>
        <p className="secondary">{ending.text}</p>
        <div className="grid-halves" style={{ marginTop: 4, gap: 8 }}>
          <Stat label="Лояльность" value={view.loyalty} />
          <Stat label="Безопасность" value={view.safety} />
        </div>
      </Card>
      {rewards && (
        <Card>
          <div className="spread" style={{ alignItems: 'baseline' }}>
            <span>Получено</span>
            <strong className="h2">+{experience(rewards.xp)}</strong>
          </div>
          <div className="small muted">
            {rewards.level.title} · {levelProgress(rewards.level)}
          </div>
          <ProgressBar value={rewards.level.progress} label="Прогресс уровня" />
          {rewards.level_up && (
            <Alert tone="positive" icon="trending-up" title={`Новый уровень: ${rewards.level.title}`} />
          )}
          {rewards.new_achievements.map((item) => (
            <Alert key={item.code} tone="positive" icon={ACHIEVEMENT_ICON[item.icon] ?? 'award'} title={`Достижение: ${item.title}`}>
              {item.description}
            </Alert>
          ))}
          {rewards.completed_challenges.map((item) => (
            <Alert key={item.id} tone="positive" icon="flag" title={`Челлендж «${item.title}» выполнен`}>
              +{experience(item.reward_xp)}
            </Alert>
          ))}
        </Card>
      )}
      <Button block to={`/attempts/${view.id}/debrief`}>Разбор решений</Button>
      <div className="grid-halves" style={{ gap: 8 }}>
        <Button variant="secondary" onClick={onRetry}>Пройти ещё раз</Button>
        <Button variant="secondary" to="/scenarios">К сценариям</Button>
      </div>
    </>
  )
}
