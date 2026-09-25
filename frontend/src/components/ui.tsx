import { useState, type ReactNode } from 'react'
import { ApiError } from '../api/client'
import type { Competency, Outcome } from '../api/types'
import { COMPETENCY_STATUS, OUTCOME, formatDate, signed } from '../labels'

export function Loader() {
  return <p className="muted">Загрузка…</p>
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof ApiError ? error.message : 'Что-то пошло не так'
  return <div className="error-box" role="alert">{message}</div>
}

/** Обёртка для состояния запроса: загрузка → ошибка → содержимое. */
export function Async<T>({ query, children }: { query: { data?: T; error: unknown; isPending: boolean }; children: (data: T) => ReactNode }) {
  if (query.isPending) return <Loader />
  if (query.error || query.data === undefined) return <ErrorBox error={query.error} />
  return <>{children(query.data)}</>
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const width = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${width}%` }} />
    </div>
  )
}

export function OutcomeChip({ outcome }: { outcome: Outcome }) {
  const info = OUTCOME[outcome]
  return <span className={`chip tone-${info.tone}`}>{info.icon} {info.title}</span>
}

/** Шкала «Лояльность» / «Безопасность». Низкое значение помечается значком, не только цветом. */
export function ScaleBar({ label, value, delta, color }: { label: string; value: number; delta?: number; color: string }) {
  const low = value < 30
  return (
    <div className="scale">
      <span className="small">{label}</span>
      <div className="scale-track" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="scale-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="scale-value tabular">
        {low && <span aria-label="низкий уровень">⚠ </span>}
        {value}
        {delta ? <span key={`${value}-${delta}`} className={`delta ${delta > 0 ? 'up' : 'down'}`}>{signed(delta)}</span> : null}
      </span>
    </div>
  )
}

/** Столбики XP по дням (одна серия): подсказка при наведении/фокусе, значения доступны скринридеру. */
export function XpBars({ series }: { series: { date: string; xp: number }[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...series.map((point) => point.xp))
  const total = series.reduce((sum, point) => sum + point.xp, 0)
  return (
    <figure style={{ margin: 0 }}>
      <div className="bars" onMouseLeave={() => setActive(null)}>
        {series.map((point, index) => (
          <div
            key={point.date}
            className="bar-hit"
            tabIndex={0}
            aria-label={`${formatDate(point.date)}: ${point.xp} XP`}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            style={{ position: 'relative' }}
          >
            <div className="bar" style={{ height: `${(point.xp / max) * 100}%` }} />
            {active === index && <span className="tooltip">{formatDate(point.date)} · {point.xp} XP</span>}
          </div>
        ))}
      </div>
      <figcaption className="spread small muted" style={{ marginTop: 4 }}>
        <span>{formatDate(series[0].date)}</span>
        <span>Всего за период: {total} XP</span>
        <span>{formatDate(series[series.length - 1].date)}</span>
      </figcaption>
    </figure>
  )
}

/** Мастерство по компетенциям — горизонтальные бары 0..100 со статусом (значок + подпись). */
export function CompetencyBars({ items }: { items: Competency[] }) {
  return (
    <div className="stack" style={{ gap: '0.7rem' }}>
      {items.map((item) => {
        const status = COMPETENCY_STATUS[item.status]
        return (
          <div key={item.code}>
            <div className="hbar">
              <span className="small">{item.title}</span>
              <div className="hbar-track" aria-hidden>
                <div className="hbar-fill" style={{ width: `${item.mastery ?? 0}%` }} />
              </div>
              <span className="small tabular" style={{ textAlign: 'right' }}>
                {item.mastery === null ? '—' : `${Math.round(item.mastery)}%`}
              </span>
            </div>
            <span className={`chip tone-${status.tone}`} style={{ marginTop: 4 }}>{status.icon} {status.title}</span>
          </div>
        )
      })}
    </div>
  )
}
