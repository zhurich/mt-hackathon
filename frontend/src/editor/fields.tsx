// Поля форм редактора: базовые поля, выбор следующего узла, конструктор условий, эффекты на шкалы.

import { useId, useState, type ReactNode } from 'react'
import { OPERATORS, formatCondition, parseCondition } from './model'
import type { Effects } from './types'

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="efield">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <div className="ehint">{hint}</div>}
    </div>
  )
}

export function TextInput({ label, value, onChange, hint, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; hint?: string; placeholder?: string
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  )
}

export function TextArea({ label, value, onChange, rows = 3, hint }: {
  label: string; value: string; onChange: (value: string) => void; rows?: number; hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => <textarea id={id} className="plain" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  )
}

export function NumberInput({ label, value, onChange, min, max, hint }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input id={id} type="number" value={value} min={min} max={max}
               onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} />
      )}
    </Field>
  )
}

export function Select({ label, value, options, onChange, hint }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
    </Field>
  )
}

/** Выбор узла-цели. Пустое значение — «не связано» (валидатор это подсветит). */
export function NextSelect({ label = 'Ведёт в узел', value, nodeIds, onChange }: {
  label?: string; value: string; nodeIds: string[]; onChange: (value: string) => void
}) {
  const options = [{ value: '', label: '— не связано —' }, ...nodeIds.map((id) => ({ value: id, label: id }))]
  if (value && !nodeIds.includes(value)) options.push({ value, label: `${value} (нет такого узла)` })
  return <Select label={label} value={value} options={options} onChange={onChange} />
}

/** Набор флажков-чипов (компетенции, шаги ролевой модели). */
export function ChipToggles({ label, options, selected, onChange }: {
  label: string; options: { code: string; title: string }[]; selected: string[]; onChange: (value: string[]) => void
}) {
  return (
    <div className="efield">
      <span className="elabel">{label}</span>
      <div className="row" style={{ gap: 6 }}>
        {options.map((option) => {
          const active = selected.includes(option.code)
          return (
            <button key={option.code} type="button" aria-pressed={active}
                    className={`chip etoggle${active ? ' on' : ''}`}
                    onClick={() => onChange(active ? selected.filter((c) => c !== option.code) : [...selected, option.code])}>
              {active ? '✓ ' : ''}{option.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Условия ----------

function ConditionRow({ text, vars, onChange, onRemove }: {
  text: string; vars: string[]; onChange: (text: string) => void; onRemove: () => void
}) {
  const parts = parseCondition(text)
  const [raw, setRaw] = useState(!parts)
  const operands = ['loyalty', 'safety', 'class', ...vars.map((v) => `vars.${v}`)]
  const isFlag = parts?.operand.startsWith('flags.')

  if (raw || !parts) {
    return (
      <div className="econd">
        <input className="mono" value={text} onChange={(e) => onChange(e.target.value)} placeholder="safety < 40" />
        {parseCondition(text) && <button type="button" className="ebtn-icon" title="Конструктор" onClick={() => setRaw(false)}>⚙</button>}
        <button type="button" className="ebtn-icon" title="Удалить условие" onClick={onRemove}>✕</button>
      </div>
    )
  }
  const update = (patch: Partial<typeof parts>) => onChange(formatCondition({ ...parts, ...patch }))
  return (
    <div className="econd">
      <select value={isFlag ? '__flag' : parts.operand}
              onChange={(e) => update(e.target.value === '__flag'
                ? { operand: 'flags.name', op: '==', value: 'true' }
                : { operand: e.target.value })}>
        {operands.map((operand) => <option key={operand} value={operand}>{operand}</option>)}
        <option value="__flag">флаг…</option>
        {!operands.includes(parts.operand) && !isFlag && <option value={parts.operand}>{parts.operand}</option>}
      </select>
      {isFlag && (
        <input className="mono" value={parts.operand.slice(6)} title="Имя флага"
               onChange={(e) => update({ operand: `flags.${e.target.value.replace(/\s/g, '')}` })} />
      )}
      <select value={parts.op} onChange={(e) => update({ op: e.target.value })}>
        {(isFlag || parts.operand === 'class' ? ['==', '!='] : OPERATORS).map((op) => <option key={op}>{op}</option>)}
      </select>
      <input className="mono" value={parts.value} onChange={(e) => update({ value: e.target.value.replace(/\s/g, '') })} />
      <button type="button" className="ebtn-icon" title="Ввести текстом" onClick={() => setRaw(true)}>✎</button>
      <button type="button" className="ebtn-icon" title="Удалить условие" onClick={onRemove}>✕</button>
    </div>
  )
}

/** Список условий (логическое И). */
export function ConditionsEditor({ label, conditions, vars, onChange, emptyText }: {
  label: string; conditions: string[]; vars: string[]; onChange: (value: string[]) => void; emptyText: string
}) {
  return (
    <div className="efield">
      <span className="elabel">{label}</span>
      {conditions.length === 0 && <div className="ehint">{emptyText}</div>}
      {conditions.map((text, index) => (
        <ConditionRow key={index} text={text} vars={vars}
                      onChange={(value) => onChange(conditions.map((c, i) => (i === index ? value : c)))}
                      onRemove={() => onChange(conditions.filter((_, i) => i !== index))} />
      ))}
      <button type="button" className="ebtn-link" onClick={() => onChange([...conditions, 'safety >= 50'])}>
        + условие{conditions.length ? ' (и)' : ''}
      </button>
    </div>
  )
}

// ---------- Эффекты ----------

export function EffectsEditor({ effects, vars, onChange }: {
  effects: Effects; vars: string[]; onChange: (effects: Effects) => void
}) {
  const [newFlag, setNewFlag] = useState('')
  return (
    <div className="eeffects">
      <div className="egrid-2">
        <NumberInput label="Лояльность ±" value={effects.loyalty} onChange={(loyalty) => onChange({ ...effects, loyalty })} />
        <NumberInput label="Безопасность ±" value={effects.safety} onChange={(safety) => onChange({ ...effects, safety })} />
      </div>
      {vars.length > 0 && (
        <div className="egrid-2">
          {vars.map((name) => (
            <NumberInput key={name} label={`${name} ±`} value={effects.vars[name] ?? 0}
                         onChange={(value) => {
                           const next = { ...effects.vars, [name]: value }
                           if (value === 0) delete next[name]
                           onChange({ ...effects, vars: next })
                         }} />
          ))}
        </div>
      )}
      <div className="efield">
        <span className="elabel">Флаги</span>
        {Object.entries(effects.flags).map(([name, value]) => (
          <div key={name} className="econd">
            <span className="mono" style={{ flex: 1 }}>{name}</span>
            <select value={String(value)} onChange={(e) => onChange({ ...effects, flags: { ...effects.flags, [name]: e.target.value === 'true' } })}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
            <button type="button" className="ebtn-icon" title="Удалить флаг" onClick={() => {
              const flags = { ...effects.flags }
              delete flags[name]
              onChange({ ...effects, flags })
            }}>✕</button>
          </div>
        ))}
        <div className="econd">
          <input className="mono" value={newFlag} placeholder="chief_called" onChange={(e) => setNewFlag(e.target.value.replace(/\s/g, ''))} />
          <button type="button" className="ebtn-link" disabled={!newFlag}
                  onClick={() => { onChange({ ...effects, flags: { ...effects.flags, [newFlag]: true } }); setNewFlag('') }}>
            + флаг
          </button>
        </div>
      </div>
    </div>
  )
}
