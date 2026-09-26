import { useEffect, useState } from 'react'
import { Alert, Button, Icon } from '../components/ui'
import { OUTCOME, QUALITY, SPEAKER } from '../labels'
import {
  ChipToggles, ConditionsEditor, EffectsEditor, NextSelect, NumberInput, QualityMark, Select, TextArea, TextInput,
} from './fields'
import { emptyEffects, nextChoiceId } from './model'
import type {
  ChoiceDoc, ChoiceNodeDoc, EndingNodeDoc, NodeDoc, NodeType, RouterNodeDoc, ScenarioDoc,
} from './types'

export interface Dictionaries {
  competencies: { code: string; title: string }[]
  categories: { code: string; title: string }[]
  service_classes: { code: string; title: string }[]
  role_model: { code: string; title: string }[]
}

interface Props {
  doc: ScenarioDoc
  nodeId: string
  dict: Dictionaries
  issues: string[]
  /** group — ключ для объединения правок в один шаг истории (набор текста в одном поле). */
  onChange: (node: NodeDoc, group?: string) => void
  onRename: (newId: string) => string | null
  onDelete: () => void
  onDuplicate: () => void
  onSetStart: () => void
  onChangeType: (type: NodeType) => void
}

const NODE_TYPES: { value: NodeType; label: string }[] = [
  { value: 'choice', label: 'Решение — ситуация и варианты ответа' },
  { value: 'router', label: 'Условие — невидимый переход по шкалам/флагам' },
  { value: 'ending', label: 'Финал' },
]

function RenameField({ nodeId, onRename }: { nodeId: string; onRename: (id: string) => string | null }) {
  const [value, setValue] = useState(nodeId)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setValue(nodeId); setError(null) }, [nodeId])
  const apply = () => setError(value === nodeId ? null : onRename(value.trim()))
  return (
    <div className="efield">
      <label htmlFor="node-id">ID узла</label>
      <input id="node-id" className="mono" value={value} onChange={(e) => setValue(e.target.value)}
             onBlur={apply} onKeyDown={(e) => e.key === 'Enter' && apply()} />
      {error ? <div className="ehint eerror">{error}</div> : <div className="ehint">Ссылки на узел обновятся автоматически</div>}
    </div>
  )
}

function ChoiceEditor({ choice, index, total, doc, dict, vars, onChange, onMove, onRemove }: {
  choice: ChoiceDoc; index: number; total: number; doc: ScenarioDoc; dict: Dictionaries; vars: string[]
  onChange: (choice: ChoiceDoc, group?: string) => void; onMove: (delta: number) => void; onRemove: () => void
}) {
  const [open, setOpen] = useState(index === 0)
  const key = `choice.${index}`
  return (
    <div className={`echoice${open ? ' open' : ''}`}>
      <div className="echoice-head">
        <button type="button" className="echoice-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <QualityMark quality={choice.quality} />
          <span className="echoice-title">{choice.text || `Вариант ${choice.id}`}</span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} className="chevron" />
        </button>
        <button type="button" className="ebtn-icon" title="Выше" aria-label="Выше" disabled={index === 0} onClick={() => onMove(-1)}>
          <Icon name="arrow-up" size={16} />
        </button>
        <button type="button" className="ebtn-icon" title="Ниже" aria-label="Ниже" disabled={index === total - 1} onClick={() => onMove(1)}>
          <Icon name="arrow-down" size={16} />
        </button>
        <button type="button" className="ebtn-icon" title="Удалить вариант" aria-label="Удалить вариант" disabled={total <= 2} onClick={onRemove}>
          <Icon name="x" size={16} />
        </button>
      </div>
      {open && (
        <div className="echoice-body">
          <div className="egrid-2">
            <TextInput label="ID варианта" value={choice.id} onChange={(id) => onChange({ ...choice, id: id.replace(/\s/g, '') }, `${key}.id`)} />
            <Select label="Качество решения" value={choice.quality}
                    options={(['best', 'good', 'poor', 'bad'] as const).map((q) => ({ value: q, label: QUALITY[q].title }))}
                    onChange={(q) => onChange({ ...choice, quality: q as ChoiceDoc['quality'] })} />
          </div>
          <TextArea label="Действие или реплика проводника" rows={3} value={choice.text}
                    onChange={(text) => onChange({ ...choice, text }, `${key}.text`)} />
          <TextArea label="Обратная связь в разборе: почему так / чем плохо" rows={3} value={choice.feedback}
                    hint="Хорошая обратная связь ссылается на регламент: «сит. №20», «СТО 03.011, п. 10.4»"
                    onChange={(feedback) => onChange({ ...choice, feedback }, `${key}.feedback`)} />
          <NextSelect value={choice.next} nodeIds={Object.keys(doc.nodes)} onChange={(next) => onChange({ ...choice, next })} />
          <ChipToggles label="Шаги ролевой модели в реплике" options={dict.role_model} selected={choice.role_model}
                       onChange={(steps) => onChange({ ...choice, role_model: steps as ChoiceDoc['role_model'] })} />
          <EffectsEditor effects={choice.effects} vars={vars} onChange={(effects) => onChange({ ...choice, effects }, `${key}.effects`)} />
          <ConditionsEditor label="Вариант доступен, только если" conditions={choice.if} vars={vars}
                            emptyText="Доступен всегда" onChange={(conditions) => onChange({ ...choice, if: conditions }, `${key}.if`)} />
        </div>
      )}
    </div>
  )
}

function ChoiceForm({ node, doc, dict, onChange }: { node: ChoiceNodeDoc; doc: ScenarioDoc; dict: Dictionaries; onChange: Props['onChange'] }) {
  const vars = Object.keys(doc.initial.vars)
  const setChoices = (choices: ChoiceDoc[], group?: string) => onChange({ ...node, choices }, group)
  return (
    <>
      <div className="egrid-2">
        <Select label="Кто говорит" value={node.speaker}
                options={Object.entries(SPEAKER).map(([value, label]) => ({ value, label }))}
                onChange={(speaker) => onChange({ ...node, speaker })} />
        <TextInput label="Подпись говорящего" value={node.speaker_name ?? ''} placeholder="Пассажир места 7A"
                   onChange={(name) => onChange({ ...node, speaker_name: name || null }, 'speaker_name')} />
      </div>
      <TextArea label="Ситуация / реплика" rows={4} value={node.text} onChange={(text) => onChange({ ...node, text }, 'text')} />
      <ChipToggles label="Какие компетенции проверяет решение" options={dict.competencies} selected={node.competencies}
                   onChange={(competencies) => onChange({ ...node, competencies })} />

      <div className="esection">
        <label className="echeck">
          <input type="checkbox" checked={node.timer !== null}
                 onChange={(e) => onChange(e.target.checked
                   ? { ...node, timer: 20, on_timeout: { feedback: '', next: '', effects: { ...emptyEffects(), safety: -10 } } }
                   : { ...node, timer: null, on_timeout: null })} />
          <Icon name="timer" size={16} /> Таймер на решение
        </label>
        {node.timer !== null && node.on_timeout && (
          <div className="esub">
            <NumberInput label="Секунд на решение" value={node.timer} min={5} max={180}
                         onChange={(timer) => onChange({ ...node, timer }, 'timer')} />
            <TextArea label="Обратная связь, если не успел" rows={2} value={node.on_timeout.feedback}
                      onChange={(feedback) => onChange({ ...node, on_timeout: { ...node.on_timeout!, feedback } }, 'timeout.feedback')} />
            <NextSelect label="При таймауте ведёт в" value={node.on_timeout.next} nodeIds={Object.keys(doc.nodes)}
                        onChange={(next) => onChange({ ...node, on_timeout: { ...node.on_timeout!, next } })} />
            <EffectsEditor effects={node.on_timeout.effects} vars={vars}
                           onChange={(effects) => onChange({ ...node, on_timeout: { ...node.on_timeout!, effects } }, 'timeout.effects')} />
          </div>
        )}
      </div>

      <div className="esection">
        <div className="spread">
          <strong>Варианты ответа ({node.choices.length})</strong>
          <Button variant="secondary" size="sm" icon="plus" onClick={() => setChoices([...node.choices, {
            id: nextChoiceId(node), text: '', quality: 'good', feedback: '', next: '', effects: emptyEffects(), role_model: [], if: [],
          }])}>Вариант</Button>
        </div>
        <div className="ehint">Игроку варианты показываются в случайном порядке.</div>
        {node.choices.map((choice, index) => (
          <ChoiceEditor key={index} choice={choice} index={index} total={node.choices.length} doc={doc} dict={dict} vars={vars}
                        onChange={(value, group) => setChoices(node.choices.map((c, i) => (i === index ? value : c)), group)}
                        onMove={(delta) => {
                          const choices = [...node.choices]
                          const [moved] = choices.splice(index, 1)
                          choices.splice(index + delta, 0, moved)
                          setChoices(choices)
                        }}
                        onRemove={() => setChoices(node.choices.filter((_, i) => i !== index))} />
        ))}
      </div>
    </>
  )
}

function RouterForm({ node, doc, onChange }: { node: RouterNodeDoc; doc: ScenarioDoc; onChange: Props['onChange'] }) {
  const vars = Object.keys(doc.initial.vars)
  const setRoutes = (routes: RouterNodeDoc['routes'], group?: string) => onChange({ ...node, routes }, group)
  return (
    <div className="esection">
      <p className="ehint">Маршруты проверяются сверху вниз; срабатывает первый, чьи условия выполнены. Последний — «иначе», без условий.</p>
      {node.routes.map((route, index) => {
        const isLast = index === node.routes.length - 1
        return (
          <div key={index} className="echoice open">
            <div className="echoice-head">
              <strong className="small" style={{ flex: 1 }}>{isLast ? 'Иначе' : `Маршрут ${index + 1}`}</strong>
              <button type="button" className="ebtn-icon" title="Удалить маршрут" aria-label="Удалить маршрут" disabled={node.routes.length <= 1}
                      onClick={() => setRoutes(node.routes.filter((_, i) => i !== index))}><Icon name="x" size={16} /></button>
            </div>
            <div className="echoice-body">
              {!isLast && (
                <ConditionsEditor label="Если" conditions={route.if} vars={vars} emptyText="Нужно хотя бы одно условие"
                                  onChange={(conditions) => setRoutes(node.routes.map((r, i) => (i === index ? { ...r, if: conditions } : r)), `route.${index}`)} />
              )}
              <NextSelect value={route.next} nodeIds={Object.keys(doc.nodes)}
                          onChange={(next) => setRoutes(node.routes.map((r, i) => (i === index ? { ...r, next } : r)))} />
            </div>
          </div>
        )
      })}
      <div>
        <Button variant="secondary" size="sm" icon="plus" onClick={() => setRoutes([
          ...node.routes.slice(0, -1), { next: '', if: ['safety < 50'] }, node.routes[node.routes.length - 1],
        ])}>Маршрут перед «иначе»</Button>
      </div>
    </div>
  )
}

function EndingForm({ node, onChange }: { node: EndingNodeDoc; onChange: Props['onChange'] }) {
  return (
    <>
      <Select label="Исход" value={node.outcome}
              options={(['success', 'partial', 'fail'] as const).map((o) => ({ value: o, label: OUTCOME[o].title }))}
              onChange={(outcome) => onChange({ ...node, outcome: outcome as EndingNodeDoc['outcome'] })} />
      <TextInput label="Заголовок" value={node.title} onChange={(title) => onChange({ ...node, title }, 'title')} />
      <TextArea label="Текст финала" rows={4} value={node.text} onChange={(text) => onChange({ ...node, text }, 'text')} />
    </>
  )
}

export default function NodeInspector(props: Props) {
  const { doc, nodeId, dict, issues } = props
  const node = doc.nodes[nodeId]
  return (
    <div className="stack">
      {issues.length > 0 && (
        <Alert tone="critical" title="Проблемы узла">
          <ul className="eissues">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </Alert>
      )}
      <RenameField nodeId={nodeId} onRename={props.onRename} />
      <Select label="Тип узла" value={node.type} options={NODE_TYPES} onChange={(type) => props.onChangeType(type as NodeType)}
              hint="Смена типа очищает содержимое узла" />
      <div className="row">
        <Button variant="secondary" size="sm" icon="play" disabled={doc.start === nodeId} onClick={props.onSetStart}>
          {doc.start === nodeId ? 'Стартовый узел' : 'Сделать стартовым'}
        </Button>
        <Button variant="secondary" size="sm" icon="copy" onClick={props.onDuplicate}>Копия</Button>
        <Button variant="secondary" size="sm" icon="x" className="edanger" onClick={props.onDelete}>Удалить</Button>
      </div>
      {node.type === 'choice' && <ChoiceForm node={node} doc={doc} dict={dict} onChange={props.onChange} />}
      {node.type === 'router' && <RouterForm node={node} doc={doc} onChange={props.onChange} />}
      {node.type === 'ending' && <EndingForm node={node} onChange={props.onChange} />}
    </div>
  )
}
