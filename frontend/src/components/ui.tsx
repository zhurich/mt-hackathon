// Компоненты дизайн-системы «ВСМ · Обучение». Оформление — классы из index.css.

import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import type { Competency, Outcome } from '../api/types'
import { COMPETENCY_STATUS, OUTCOME, experience, formatDate, signed, type Tone } from '../labels'
import { Icon, type IconName } from './Icon'

export { Icon, type IconName }

function cx(...names: unknown[]) {
  return names.filter(Boolean).join(' ')
}

/* ---------- Состояния запроса ---------- */

export function Loader({ label = 'Загрузка' }: { label?: string }) {
  return (
    <div className="inline-icon small muted" role="status">
      <Icon name="loader-circle" size={16} spin />{label}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof ApiError ? error.message : 'Не удалось загрузить данные. Проверьте подключение.'
  return <Alert tone="critical">{message}</Alert>
}

/** Обёртка для состояния запроса: загрузка → ошибка → содержимое. */
export function Async<T>({ query, children }: { query: { data?: T; error: unknown; isPending: boolean }; children: (data: T) => ReactNode }) {
  if (query.isPending) return <Loader />
  if (query.error || query.data === undefined) return <ErrorBox error={query.error} />
  return <>{children(query.data)}</>
}

/* ---------- Действия ---------- */

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
  icon?: IconName
  iconRight?: IconName
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  /** Внутренняя ссылка (react-router). */
  to?: string
  onClick?: () => void
  title?: string
  className?: string
  children?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', block, icon, iconRight, loading, disabled, type = 'button', to, onClick, title, className, children }: ButtonProps) {
  const off = disabled || loading
  const iconSize = size === 'sm' ? 16 : 20
  const classes = cx('btn', variant !== 'secondary' && `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', className)
  const content = (
    <>
      {loading ? <Icon name="loader-circle" size={iconSize} spin /> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={iconSize} /> : null}
    </>
  )
  if (to && !off) return <Link to={to} className={classes} title={title} onClick={onClick}>{content}</Link>
  return <button type={type} className={classes} disabled={off} onClick={onClick} title={title}>{content}</button>
}

export function IconButton({ icon, label, size = 'md', badge, to, onClick, disabled, className }: {
  icon: IconName
  label: string
  size?: 'sm' | 'md'
  badge?: number
  to?: string
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  const classes = cx('icon-btn', size === 'sm' && 'icon-btn-sm', className)
  const content = (
    <>
      <Icon name={icon} size={size === 'sm' ? 18 : 22} />
      {badge ? <span className="icon-btn-badge" aria-hidden>{badge > 9 ? '9+' : badge}</span> : null}
    </>
  )
  if (to) return <Link to={to} className={classes} aria-label={label} title={label}>{content}</Link>
  return <button type="button" className={classes} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{content}</button>
}

/* ---------- Метки ---------- */

/** Статусная метка. Для фильтров — FilterChip. */
export function Chip({ tone = 'neutral', icon, title, children }: { tone?: Tone; icon?: IconName; title?: string; children: ReactNode }) {
  return (
    <span className={cx('chip', tone !== 'neutral' && `tone-${tone}`)} title={title}>
      {icon ? <Icon name={icon} size={14} /> : null}{children}
    </span>
  )
}

export function FilterChip({ selected, icon, onClick, children }: { selected: boolean; icon?: IconName; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="filter-chip" aria-pressed={selected} onClick={onClick}>
      {icon ? <Icon name={icon} size={16} /> : null}{children}
    </button>
  )
}

export function OutcomeChip({ outcome }: { outcome: Outcome }) {
  const info = OUTCOME[outcome]
  return <Chip tone={info.tone} icon={info.icon}>{info.title}</Chip>
}

/** Сложность 1–3: три сегмента, заполненные по уровню. */
export function Difficulty({ level, max = 3, showLabel }: { level: number; max?: number; showLabel?: boolean }) {
  const names = ['', 'Базовый', 'Средний', 'Сложный']
  const label = `Сложность ${level} из ${max}`
  return (
    <span className="difficulty" aria-label={label} title={label}>
      <span className="difficulty-bars" aria-hidden>
        {Array.from({ length: max }, (_, i) => <span key={i} className={i < level ? 'on' : undefined} />)}
      </span>
      {showLabel ? names[level] : null}
    </span>
  )
}

/* ---------- Карточки ---------- */

interface CardProps {
  as?: 'div' | 'section' | 'article'
  tone?: 'default' | 'muted'
  bordered?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  gap?: number
  /** Интерактивная карточка-ссылка (react-router). */
  to?: string
  onClick?: () => void
  className?: string
  style?: CSSProperties
  'aria-label'?: string
  children: ReactNode
}

export function Card({ as: Tag = 'div', tone = 'default', bordered, padding = 'md', gap, to, onClick, className, style, children, ...rest }: CardProps) {
  const classes = cx(
    'card', tone === 'muted' && 'card-muted', bordered && 'card-bordered',
    padding !== 'md' && `card-pad-${padding}`, (to || onClick) && 'card-link', className,
  )
  const s = gap === undefined ? style : { gap, ...style }
  if (to) return <Link to={to} className={classes} style={s} {...rest}>{children}</Link>
  if (onClick) return <button type="button" className={classes} style={s} onClick={onClick} {...rest}>{children}</button>
  return <Tag className={classes} style={s} {...rest}>{children}</Tag>
}

export function StatCard({ label, value, hint, icon, tone = 'default', to }: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  icon?: IconName
  tone?: 'default' | 'warning'
  to?: string
}) {
  return (
    <Card gap={4} to={to} className={tone === 'warning' ? 'stat-warning' : undefined}>
      <div className="stat-label">{icon ? <Icon name={icon} size={16} /> : null}{label}</div>
      <div className="number">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </Card>
  )
}

/** Показатель внутри карточки: подпись и крупное число. */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="caption muted">{label}</div>
      <div className="number">{value}</div>
    </div>
  )
}

/* ---------- Уведомления на странице ---------- */

type AlertTone = 'neutral' | 'info' | 'positive' | 'warning' | 'critical'
const ALERT_ICON: Record<AlertTone, IconName> = {
  neutral: 'info', info: 'info', positive: 'circle-check', warning: 'triangle-alert', critical: 'circle-alert',
}

export function Alert({ tone = 'neutral', title, icon, action, children }: {
  tone?: AlertTone
  title?: ReactNode
  icon?: IconName
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={cx('alert', tone !== 'neutral' && `alert-${tone}`)} role={tone === 'critical' ? 'alert' : 'status'}>
      <Icon name={icon ?? ALERT_ICON[tone]} size={20} />
      <div className="alert-body">
        {title ? <strong className="alert-title">{title}</strong> : null}
        {children ? <div className="alert-text">{children}</div> : null}
      </div>
      {action ? <div className="alert-action">{action}</div> : null}
    </div>
  )
}

/* ---------- Навигация ---------- */

export function Tabs<T extends string>({ items, value, onChange, label }: {
  items: readonly { id: T; label: ReactNode }[]
  value: T
  onChange: (id: T) => void
  label?: string
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button key={item.id} type="button" role="tab" aria-selected={item.id === value} onClick={() => onChange(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

/** Верхняя панель: бренд или заголовок, «назад», действия справа. */
export function TopBar({ title, brand, onBack, nav, actions }: {
  title?: ReactNode
  /** Показать бренд вместо заголовка: всегда (true) или только на широком экране ('desktop'). */
  brand?: boolean | 'desktop'
  onBack?: () => void
  nav?: ReactNode
  actions?: ReactNode
}) {
  const brandNode = (
    <Link to="/" className={cx('brand', brand === 'desktop' && 'desktop-only')}>
      <span className="brand-mark" aria-hidden />
      <span className="brand-name">ВСМ · Обучение</span>
    </Link>
  )
  return (
    <header className={cx('topbar', onBack && 'has-back')}>
      {onBack ? <IconButton icon="arrow-left" label="Назад" onClick={onBack} /> : null}
      {brand ? brandNode : null}
      {title && brand !== true ? (
        <h1 className={cx('topbar-title', brand === 'desktop' && 'mobile-only')}>{title}</h1>
      ) : null}
      {nav}
      {actions ? <div className="topbar-actions">{actions}</div> : null}
    </header>
  )
}

/* ---------- Формы ---------- */

export function TextField({ id, label, type = 'text', value, onChange, hint, error, autoComplete }: {
  id: string
  label: string
  type?: 'text' | 'password'
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: ReactNode
  autoComplete?: string
}) {
  const [shown, setShown] = useState(false)
  const password = type === 'password'
  const describedBy = error || hint ? `${id}-note` : undefined
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">{label}</label>
      <div className={cx('field-control', error && 'invalid')}>
        <input id={id} type={password && shown ? 'text' : type} value={value} autoComplete={autoComplete}
               aria-invalid={!!error} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)} />
        {password ? (
          <button type="button" className="field-toggle" onClick={() => setShown(!shown)}
                  aria-label={shown ? 'Скрыть пароль' : 'Показать пароль'}>
            <Icon name={shown ? 'eye-off' : 'eye'} size={20} />
          </button>
        ) : null}
      </div>
      {error ? (
        <div id={describedBy} className="field-error"><Icon name="circle-alert" size={16} />{error}</div>
      ) : hint ? <div id={describedBy} className="field-hint">{hint}</div> : null}
    </div>
  )
}

/* ---------- Прогресс ---------- */

export function ProgressBar({ value, label, tone = 'accent', size = 'md' }: {
  value: number
  label: string
  tone?: 'accent' | 'good' | 'info' | 'neutral'
  size?: 'sm' | 'md'
}) {
  const width = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={cx('progress', size === 'sm' && 'progress-sm', tone !== 'accent' && `tone-${tone}`)}
         role="progressbar" aria-label={label} aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${width}%` }} />
    </div>
  )
}

/** Шкала «Лояльность» / «Безопасность» 0–100. Низкое значение помечается значком, не только цветом. */
export function ScaleBar({ label, value, delta, kind = 'loyalty' }: { label: string; value: number; delta?: number; kind?: 'loyalty' | 'safety' }) {
  const low = value < 30
  const color = low ? 'var(--critical)' : kind === 'safety' ? 'var(--series-safety)' : 'var(--series-loyalty)'
  return (
    <div className="scale">
      <span className="scale-label">{label}</span>
      <div className="scale-track" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="scale-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className={cx('scale-value', low && 'low')}>
        {low && <Icon name="triangle-alert" size={16} label="низкий уровень" />}
        {value}
        {delta ? <span className={cx('delta', delta > 0 ? 'up' : 'down')}>{signed(delta)}</span> : null}
      </span>
    </div>
  )
}

/** Таймер решения. Меньше 5 секунд — критический режим. */
export function Timer({ remainingMs, totalMs, label = 'Время на решение' }: { remainingMs: number; totalMs: number; label?: string }) {
  const width = Math.max(0, Math.min(1, remainingMs / totalMs)) * 100
  return (
    <div className={cx('timer', remainingMs < 5000 && 'urgent')}>
      <div className="timer-head">
        <span className="inline-icon"><Icon name="timer" size={16} />{label}</span>
        <strong>{Math.ceil(remainingMs / 1000)} с</strong>
      </div>
      <div className="timer-track"><div style={{ width: `${width}%` }} /></div>
    </div>
  )
}

/* ---------- Прохождение сценария ---------- */

/** Реплика или вводная. narrator — описание ситуации, person — речь персонажа. */
export function SpeechBubble({ speaker, kind = 'person', icon, children }: {
  speaker?: ReactNode
  kind?: 'narrator' | 'person'
  icon?: IconName
  children: ReactNode
}) {
  return (
    <div className={cx('bubble', kind === 'narrator' && 'bubble-narrator')}>
      {speaker ? (
        <div className="bubble-speaker">
          <Icon name={icon ?? (kind === 'narrator' ? 'file-text' : 'user-round')} size={14} />{speaker}
        </div>
      ) : null}
      <div className="bubble-text">{children}</div>
    </div>
  )
}

/** Вариант действия. marker — буква, цифра или иконка слева. */
export function ChoiceButton({ marker, disabled, onClick, title, children }: {
  marker?: ReactNode
  disabled?: boolean
  onClick: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button type="button" className={cx('choice', marker != null && 'has-marker')} disabled={disabled} onClick={onClick} title={title}>
      {marker != null ? <span className="choice-marker">{marker}</span> : null}
      <span className="choice-text">{children}</span>
    </button>
  )
}

/* ---------- Данные ---------- */

/** Горизонтальный бар 0..100 с подписью и значением (доли, мастерство). */
export function Meter({ title, value, display, children }: { title: ReactNode; value: number | null; display?: string; children?: ReactNode }) {
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{title}</span>
        <strong>{display ?? (value === null ? '—' : `${Math.round(value)}%`)}</strong>
      </div>
      <div className="meter-track" aria-hidden><div className="meter-fill" style={{ width: `${value ?? 0}%` }} /></div>
      {children}
    </div>
  )
}

/** Мастерство по компетенциям со статусом (значок + подпись). */
export function CompetencyBars({ items }: { items: Competency[] }) {
  return (
    <div className="meters">
      {items.map((item) => {
        const status = COMPETENCY_STATUS[item.status]
        return (
          <Meter key={item.code} title={item.title} value={item.mastery}>
            <div><Chip tone={status.tone} icon={status.icon}>{status.title}</Chip></div>
          </Meter>
        )
      })}
    </div>
  )
}

/** Столбцы очков опыта по дням: подсказка при наведении/фокусе, значения доступны скринридеру. */
export function XpBars({ series, height = 120 }: { series: { date: string; xp: number }[]; height?: number }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...series.map((point) => point.xp))
  const total = series.reduce((sum, point) => sum + point.xp, 0)
  return (
    <figure style={{ margin: 0 }}>
      <div className="bars" style={{ height }} onMouseLeave={() => setActive(null)}>
        {series.map((point, index) => (
          <div
            key={point.date}
            className={cx('bar-hit', active === index && 'active')}
            tabIndex={0}
            aria-label={`${formatDate(point.date)}: ${experience(point.xp)}`}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          >
            <div className="bar" style={{ height: `${(point.xp / max) * 100}%`, minHeight: point.xp ? 2 : 0 }} />
            {active === index && <span className="tooltip">{formatDate(point.date)} · {experience(point.xp)}</span>}
          </div>
        ))}
      </div>
      <figcaption className="bars-caption">
        <span>{formatDate(series[0].date)}</span>
        <span>Всего: {experience(total)}</span>
        <span>{formatDate(series[series.length - 1].date)}</span>
      </figcaption>
    </figure>
  )
}
