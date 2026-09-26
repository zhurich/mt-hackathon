// Тестовый прогон черновика: каждый шаг выполняет серверный движок (POST /editor/preview),
// поэтому поведение совпадает с игрой. В отличие от игры автору сразу видны качество вариантов и разбор.

import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { Alert, Button, Card, ChoiceButton, ErrorBox, IconButton, OutcomeChip, ScaleBar, SpeechBubble } from '../components/ui'
import { QUALITY, SPEAKER, SPEAKER_ICON, signed } from '../labels'
import { QualityMark } from './fields'
import { toContent } from './model'
import type { Outcome, Quality, ScenarioDoc } from './types'

interface PreviewStep {
  state: Record<string, unknown>
  node_id: string
  type: 'choice' | 'ending'
  loyalty: number
  safety: number
  vars: Record<string, number>
  flags: Record<string, boolean>
  finished: boolean
  speaker?: string
  speaker_name?: string | null
  text?: string
  timer?: number | null
  choices?: { id: string; text: string; quality: Quality; feedback: string; next: string; available: boolean; conditions: string[] }[]
  ending?: { outcome: Outcome; title: string; text: string }
  last: {
    node_id: string
    choice_text: string | null
    quality: Quality | null
    timed_out: boolean
    feedback: string
    delta: { loyalty: number; safety: number }
    interrupted_to: string | null
  } | null
}

interface Props {
  doc: ScenarioDoc
  onClose: () => void
  onFocusNode: (id: string) => void
}

export default function PreviewPanel({ doc, onClose, onFocusNode }: Props) {
  const [step, setStep] = useState<PreviewStep | null>(null)
  const [log, setLog] = useState<NonNullable<PreviewStep['last']>[]>([])
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const send = useCallback(async (body: { state?: unknown; choice_id?: string; timeout?: boolean }) => {
    setBusy(true)
    setError(null)
    try {
      const next = await api.post<PreviewStep>('/editor/preview', { content: toContent(doc), ...body })
      setStep(next)
      onFocusNode(next.node_id)
      if (next.last) setLog((items) => [...items, next.last!])
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }, [doc, onFocusNode])

  const restart = useCallback(() => {
    setLog([])
    setStep(null)
    send({})
  }, [send])

  // Прогон стартует один раз при открытии панели; правки черновика во время прогона
  // применяются со следующего шага (каждый шаг отправляет актуальный черновик).
  const [started, setStarted] = useState(false)
  useEffect(() => {
    if (started) return
    setStarted(true)
    restart()
  }, [started, restart])

  const hud = Object.entries(doc.hud)

  return (
    <aside className="epreview" aria-label="Тестовый прогон">
      <div className="spread">
        <strong>Тестовый прогон</strong>
        <div className="row" style={{ gap: 4 }}>
          <Button variant="secondary" size="sm" icon="rotate-ccw" onClick={restart} disabled={busy}>Сначала</Button>
          <IconButton icon="x" size="sm" label="Закрыть прогон" onClick={onClose} />
        </div>
      </div>
      <p className="ehint">Режим автора: видны качество вариантов и обратная связь. Таймер сам не истекает — нажмите «Время вышло».</p>
      {error !== null && <ErrorBox error={error} />}

      {step && (
        <div className="stack" style={{ gap: 10 }}>
          <Card padding="sm" bordered>
            <ScaleBar label="Лояльность" value={step.loyalty} delta={step.last?.delta.loyalty} />
            <ScaleBar label="Безопасность" kind="safety" value={step.safety} delta={step.last?.delta.safety} />
            {hud.map(([name, label]) => (
              <div key={name} className="spread small"><span className="secondary">{label}</span><strong>{step.vars[name]}</strong></div>
            ))}
            {Object.keys(step.flags).length > 0 && (
              <div className="small muted mono">флаги: {Object.entries(step.flags).map(([k, v]) => `${k}=${v}`).join(', ')}</div>
            )}
          </Card>

          {step.last && (
            <Alert tone={step.last.timed_out || step.last.quality === 'bad' ? 'critical' : step.last.quality === 'poor' ? 'warning' : 'positive'}
                   icon={QUALITY[step.last.timed_out ? 'timeout' : step.last.quality!].icon}
                   title={`${QUALITY[step.last.timed_out ? 'timeout' : step.last.quality!].title} · лояльность ${signed(step.last.delta.loyalty)}, безопасность ${signed(step.last.delta.safety)}`}>
              {step.last.feedback || <em>Обратная связь не заполнена</em>}
              {step.last.interrupted_to && <div>Сработало прерывание → {step.last.interrupted_to}</div>}
            </Alert>
          )}

          {step.type === 'choice' && (
            <>
              <SpeechBubble kind={step.speaker === 'narrator' ? 'narrator' : 'person'} icon={SPEAKER_ICON[step.speaker ?? 'narrator']}
                            speaker={<>{step.speaker_name ?? SPEAKER[step.speaker ?? 'narrator']} · <span className="mono">{step.node_id}</span>
                              {step.timer ? ` · таймер ${step.timer} с` : ''}</>}>
                {step.text || <em className="muted">Текст не задан</em>}
              </SpeechBubble>
              {step.choices!.map((choice) => (
                <ChoiceButton key={choice.id} marker={<QualityMark quality={choice.quality} />} disabled={busy || !choice.available}
                              onClick={() => send({ state: step.state, choice_id: choice.id })}
                              title={choice.available ? `→ ${choice.next || 'не связано'}` : `Недоступен: ${choice.conditions.join(' и ')}`}>
                  {choice.text || <em>{choice.id}</em>}
                  <span className="small muted"> → {choice.next || '—'}</span>
                  {!choice.available && <div className="small muted">недоступен: {choice.conditions.join(' и ')}</div>}
                </ChoiceButton>
              ))}
              {step.timer ? (
                <div>
                  <Button variant="secondary" size="sm" icon="timer" disabled={busy} onClick={() => send({ state: step.state, timeout: true })}>
                    Время вышло
                  </Button>
                </div>
              ) : null}
            </>
          )}

          {step.type === 'ending' && step.ending && (
            <Card bordered gap={6}>
              <div><OutcomeChip outcome={step.ending.outcome} /></div>
              <strong>{step.ending.title}</strong>
              <div className="small secondary">{step.ending.text}</div>
              <div className="small muted">Решений: {log.length}, лучших: {log.filter((l) => l.quality === 'best').length}</div>
            </Card>
          )}
        </div>
      )}
    </aside>
  )
}
