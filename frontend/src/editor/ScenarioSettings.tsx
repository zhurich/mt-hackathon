import { useState } from 'react'
import { Alert, Button, Icon } from '../components/ui'
import { ConditionsEditor, NextSelect, NumberInput, Select, TextArea, TextInput } from './fields'
import type { Dictionaries } from './NodeInspector'
import type { ScenarioDoc } from './types'

interface Props {
  doc: ScenarioDoc
  dict: Dictionaries
  globalIssues: string[]
  onChange: (doc: ScenarioDoc, group?: string) => void
}

function VariablesEditor({ doc, onChange }: Pick<Props, 'doc' | 'onChange'>) {
  const [name, setName] = useState('')
  const vars = doc.initial.vars
  const setVar = (key: string, value: number) =>
    onChange({ ...doc, initial: { ...doc.initial, vars: { ...vars, [key]: value } } }, `var.${key}`)
  const setHud = (key: string, label: string) => {
    const hud = { ...doc.hud }
    if (label) hud[key] = label
    else delete hud[key]
    onChange({ ...doc, hud }, `hud.${key}`)
  }
  const remove = (key: string) => {
    const nextVars = { ...vars }
    delete nextVars[key]
    const hud = { ...doc.hud }
    delete hud[key]
    onChange({ ...doc, initial: { ...doc.initial, vars: nextVars }, hud })
  }
  return (
    <div className="esection">
      <strong>Переменные сценария</strong>
      <p className="ehint">Числа, которые меняют решения (например, «минут до станции») и проверяют условия: <code>vars.имя</code>.
        Если задать подпись, игрок увидит переменную рядом со шкалами.</p>
      {Object.entries(vars).map(([key, value]) => (
        <div key={key} className="evar">
          <span className="mono evar-name">{key}</span>
          <NumberInput label="Начальное" value={value} onChange={(v) => setVar(key, v)} />
          <TextInput label="Подпись для игрока" value={doc.hud[key] ?? ''} placeholder="не показывать" onChange={(label) => setHud(key, label)} />
          <button type="button" className="ebtn-icon" title="Удалить переменную" aria-label="Удалить переменную" onClick={() => remove(key)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
      <div className="econd">
        <input className="mono" placeholder="minutes_to_station" value={name}
               onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} />
        <button type="button" className="ebtn-link" disabled={!name || name in vars}
                onClick={() => { setVar(name, 0); setName('') }}>+ переменная</button>
      </div>
    </div>
  )
}

export default function ScenarioSettings({ doc, dict, globalIssues, onChange }: Props) {
  const nodeIds = Object.keys(doc.nodes)
  const vars = Object.keys(doc.initial.vars)
  const set = <K extends keyof ScenarioDoc>(key: K, value: ScenarioDoc[K], group?: string) => onChange({ ...doc, [key]: value }, group)

  return (
    <div className="stack">
      {globalIssues.length > 0 && (
        <Alert tone="critical" title="Проблемы сценария">
          <ul className="eissues">{globalIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </Alert>
      )}
      <div className="egrid-2">
        <TextInput label="ID сценария" value={doc.id} hint="латиница, цифры, дефис"
                   onChange={(id) => set('id', id.toLowerCase().replace(/[^a-z0-9-]/g, ''), 'id')} />
        <NumberInput label="Версия" value={doc.version} min={1} hint="Должна быть больше опубликованной"
                     onChange={(version) => set('version', version)} />
      </div>
      <TextInput label="Название" value={doc.title} onChange={(title) => set('title', title, 'title')} />
      <TextArea label="Краткое описание (для каталога)" rows={2} value={doc.summary} onChange={(v) => set('summary', v, 'summary')} />
      <TextArea label="Вводная для игрока" rows={3} value={doc.briefing} onChange={(v) => set('briefing', v, 'briefing')} />
      <div className="egrid-3">
        <Select label="Категория" value={doc.category} options={dict.categories.map((c) => ({ value: c.code, label: c.title }))}
                onChange={(v) => set('category', v)} />
        <Select label="Класс вагона" value={doc.service_class}
                options={dict.service_classes.map((c) => ({ value: c.code, label: c.title }))} onChange={(v) => set('service_class', v)} />
        <Select label="Сложность" value={String(doc.difficulty)} options={[1, 2, 3].map((d) => ({ value: String(d), label: `${d} из 3` }))}
                onChange={(v) => set('difficulty', Number(v))} />
      </div>
      <div className="egrid-3">
        <NumberInput label="Лояльность на старте" value={doc.initial.loyalty} min={0} max={100}
                     onChange={(loyalty) => set('initial', { ...doc.initial, loyalty }, 'initial.loyalty')} />
        <NumberInput label="Безопасность на старте" value={doc.initial.safety} min={0} max={100}
                     onChange={(safety) => set('initial', { ...doc.initial, safety }, 'initial.safety')} />
        <NextSelect label="Стартовый узел" value={doc.start} nodeIds={nodeIds} onChange={(start) => set('start', start)} />
      </div>

      <VariablesEditor doc={doc} onChange={onChange} />

      <div className="esection">
        <strong className="inline-icon">Прерывания <Icon name="zap" size={16} /></strong>
        <p className="ehint">Проверяются после каждого решения. Когда условие выполнилось, сценарий сразу переходит в указанный узел
          (например, при <code>safety &lt;= 10</code> — в финал «экстренная ситуация»). Каждое срабатывает не больше одного раза.</p>
        {doc.interrupts.map((interrupt, index) => (
          <div key={index} className="echoice open">
            <div className="echoice-head">
              <strong className="small" style={{ flex: 1 }}>Прерывание {index + 1}</strong>
              <button type="button" className="ebtn-icon" title="Удалить прерывание" aria-label="Удалить прерывание"
                      onClick={() => set('interrupts', doc.interrupts.filter((_, i) => i !== index))}><Icon name="x" size={16} /></button>
            </div>
            <div className="echoice-body">
              <ConditionsEditor label="Когда" conditions={interrupt.if} vars={vars} emptyText="Нужно хотя бы одно условие"
                                onChange={(conditions) => set('interrupts', doc.interrupts.map((it, i) => (i === index ? { ...it, if: conditions } : it)), `interrupt.${index}`)} />
              <NextSelect value={interrupt.next} nodeIds={nodeIds}
                          onChange={(next) => set('interrupts', doc.interrupts.map((it, i) => (i === index ? { ...it, next } : it)))} />
            </div>
          </div>
        ))}
        <div>
          <Button variant="secondary" size="sm" icon="plus" onClick={() => set('interrupts', [...doc.interrupts, { if: ['safety <= 10'], next: '' }])}>
            Прерывание
          </Button>
        </div>
      </div>

      <div className="esection">
        <strong>Источники (регламенты)</strong>
        <p className="ehint">Показываются игроку в разборе. По одному на строку.</p>
        <textarea className="plain" rows={3} value={doc.sources.join('\n')}
                  onChange={(e) => set('sources', e.target.value.split('\n'), 'sources')}
                  onBlur={() => set('sources', doc.sources.map((s) => s.trim()).filter(Boolean))} />
      </div>
    </div>
  )
}
