// Операции над черновиком сценария. Все функции чистые: принимают документ и возвращают новый,
// поэтому их легко тестировать (model.test.ts) и хранить историю для отмены/повтора.

import type {
  ChoiceDoc, ChoiceNodeDoc, Effects, Handle, NodeDoc, NodeType, Position, ScenarioDoc,
} from './types'

export const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const COLUMN_WIDTH = 340
const ROW_HEIGHT = 230

export const emptyEffects = (): Effects => ({ loyalty: 0, safety: 0, vars: {}, flags: {} })

export function newScenario(): ScenarioDoc {
  return {
    id: 'new-scenario',
    version: 1,
    title: 'Новый сценарий',
    summary: 'Кратко: что происходит и чему учит сценарий.',
    category: 'service',
    difficulty: 1,
    service_class: 'standard',
    briefing: 'Вагон 5, стандарт-класс. Опишите обстановку, в которой начинается ситуация.',
    sources: [],
    initial: { loyalty: 50, safety: 50, vars: {} },
    hud: {},
    start: 'start',
    interrupts: [],
    nodes: {
      start: {
        type: 'choice',
        text: 'Опишите ситуацию или реплику пассажира.',
        speaker: 'passenger',
        speaker_name: null,
        competencies: ['communication'],
        timer: null,
        on_timeout: null,
        choices: [
          { id: 'best', text: 'Лучшее действие проводника', quality: 'best', feedback: 'Почему это правильно.',
            next: 'end_ok', effects: { ...emptyEffects(), loyalty: 15 }, role_model: ['acknowledge', 'solution'], if: [] },
          { id: 'bad', text: 'Ошибочное действие', quality: 'bad', feedback: 'Почему так нельзя и что говорит регламент.',
            next: 'end_fail', effects: { ...emptyEffects(), loyalty: -15 }, role_model: [], if: [] },
        ],
      },
      end_ok: { type: 'ending', outcome: 'success', title: 'Ситуация урегулирована', text: 'Итог для игрока.' },
      end_fail: { type: 'ending', outcome: 'fail', title: 'Ситуация не урегулирована', text: 'Итог для игрока.' },
    },
    layout: {},
  }
}

// ---------- Нормализация импортированных данных ----------

type Raw = Record<string, unknown>
const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {})
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)
const num = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)

function normalizeEffects(value: unknown): Effects {
  const raw = obj(value)
  return {
    loyalty: num(raw.loyalty, 0),
    safety: num(raw.safety, 0),
    vars: obj(raw.vars) as Record<string, number>,
    flags: obj(raw.flags) as Record<string, boolean>,
  }
}

function normalizeNode(value: unknown): NodeDoc {
  const raw = obj(value)
  if (raw.type === 'router') {
    return { type: 'router', routes: list<Raw>(raw.routes).map((r) => ({ next: str(r.next), if: list<string>(r.if) })) }
  }
  if (raw.type === 'ending') {
    const outcome = raw.outcome === 'success' || raw.outcome === 'partial' ? raw.outcome : 'fail'
    return { type: 'ending', outcome, title: str(raw.title), text: str(raw.text) }
  }
  const timeout = raw.on_timeout ? obj(raw.on_timeout) : null
  return {
    type: 'choice',
    text: str(raw.text),
    speaker: str(raw.speaker, 'narrator'),
    speaker_name: typeof raw.speaker_name === 'string' ? raw.speaker_name : null,
    competencies: list<string>(raw.competencies),
    timer: typeof raw.timer === 'number' ? raw.timer : null,
    on_timeout: timeout
      ? { feedback: str(timeout.feedback), next: str(timeout.next), effects: normalizeEffects(timeout.effects) }
      : null,
    choices: list<Raw>(raw.choices).map((c) => ({
      id: str(c.id),
      text: str(c.text),
      quality: (['best', 'good', 'poor', 'bad'].includes(str(c.quality)) ? c.quality : 'good') as ChoiceDoc['quality'],
      feedback: str(c.feedback),
      next: str(c.next),
      effects: normalizeEffects(c.effects),
      role_model: list<ChoiceDoc['role_model'][number]>(c.role_model),
      if: list<string>(c.if),
    })),
  }
}

/** Приводит произвольный объект (импорт YAML, ответ сервера) к полному черновику со всеми полями. */
export function normalize(value: unknown): ScenarioDoc {
  const raw = obj(value)
  const initial = obj(raw.initial)
  const nodes: Record<string, NodeDoc> = {}
  for (const [id, node] of Object.entries(obj(raw.nodes))) nodes[id] = normalizeNode(node)
  return {
    id: str(raw.id, 'new-scenario'),
    version: num(raw.version, 1),
    title: str(raw.title),
    summary: str(raw.summary),
    category: str(raw.category, 'service'),
    difficulty: num(raw.difficulty, 1),
    service_class: str(raw.service_class, 'standard'),
    briefing: str(raw.briefing),
    sources: list<string>(raw.sources),
    initial: {
      loyalty: num(initial.loyalty, 50),
      safety: num(initial.safety, 50),
      vars: obj(initial.vars) as Record<string, number>,
    },
    hud: obj(raw.hud) as Record<string, string>,
    start: str(raw.start),
    interrupts: list<Raw>(raw.interrupts).map((i) => ({ if: list<string>(i.if), next: str(i.next) })),
    nodes,
    layout: obj(raw.layout) as Record<string, Position>,
  }
}

/** JSON для сервера: без позиций удалённых узлов. */
export function toContent(doc: ScenarioDoc): string {
  const layout = Object.fromEntries(Object.entries(doc.layout).filter(([id]) => id in doc.nodes))
  return JSON.stringify({ ...doc, layout })
}

// ---------- Выходы узлов и связи ----------

export function handleId(handle: Handle): string {
  return handle.kind === 'timeout' ? 'timeout' : `${handle.kind}:${handle.index}`
}

export function parseHandle(id: string): Handle | null {
  if (id === 'timeout') return { kind: 'timeout' }
  const [kind, index] = id.split(':')
  if ((kind === 'choice' || kind === 'route') && /^\d+$/.test(index)) return { kind, index: Number(index) }
  return null
}

export interface Outgoing {
  handle: Handle
  target: string
}

export function outgoing(node: NodeDoc): Outgoing[] {
  if (node.type === 'choice') {
    const edges: Outgoing[] = node.choices.map((c, index) => ({ handle: { kind: 'choice', index }, target: c.next }))
    if (node.on_timeout) edges.push({ handle: { kind: 'timeout' }, target: node.on_timeout.next })
    return edges
  }
  if (node.type === 'router') return node.routes.map((r, index) => ({ handle: { kind: 'route', index }, target: r.next }))
  return []
}

export function setTarget(doc: ScenarioDoc, nodeId: string, handle: Handle, target: string): ScenarioDoc {
  const next = structuredClone(doc)
  const node = next.nodes[nodeId]
  if (node?.type === 'choice' && handle.kind === 'choice' && node.choices[handle.index]) node.choices[handle.index].next = target
  else if (node?.type === 'choice' && handle.kind === 'timeout' && node.on_timeout) node.on_timeout.next = target
  else if (node?.type === 'router' && handle.kind === 'route' && node.routes[handle.index]) node.routes[handle.index].next = target
  return next
}

// ---------- Узлы ----------

export function uniqueNodeId(doc: ScenarioDoc, base: string): string {
  if (!(base in doc.nodes)) return base
  let index = 2
  while (`${base}_${index}` in doc.nodes) index += 1
  return `${base}_${index}`
}

export function blankNode(type: NodeType): NodeDoc {
  if (type === 'router') return { type: 'router', routes: [{ next: '', if: ['safety >= 50'] }, { next: '', if: [] }] }
  if (type === 'ending') return { type: 'ending', outcome: 'success', title: 'Финал', text: '' }
  return {
    type: 'choice', text: '', speaker: 'passenger', speaker_name: null, competencies: ['communication'],
    timer: null, on_timeout: null,
    choices: [
      { id: 'a', text: '', quality: 'best', feedback: '', next: '', effects: emptyEffects(), role_model: [], if: [] },
      { id: 'b', text: '', quality: 'bad', feedback: '', next: '', effects: emptyEffects(), role_model: [], if: [] },
    ],
  }
}

const NODE_BASE: Record<NodeType, string> = { choice: 'step', router: 'check', ending: 'end' }

export function addNode(doc: ScenarioDoc, type: NodeType, position: Position): { doc: ScenarioDoc; id: string } {
  const id = uniqueNodeId(doc, NODE_BASE[type])
  const next = structuredClone(doc)
  next.nodes[id] = blankNode(type)
  next.layout[id] = position
  return { doc: next, id }
}

/** Заменяет ссылки на узел во всём документе (next, start, прерывания). */
function replaceReferences(doc: ScenarioDoc, from: string, to: string): void {
  for (const node of Object.values(doc.nodes)) {
    if (node.type === 'choice') {
      for (const choice of node.choices) if (choice.next === from) choice.next = to
      if (node.on_timeout?.next === from) node.on_timeout.next = to
    } else if (node.type === 'router') {
      for (const route of node.routes) if (route.next === from) route.next = to
    }
  }
  for (const interrupt of doc.interrupts) if (interrupt.next === from) interrupt.next = to
  if (doc.start === from) doc.start = to
}

/** Удаляет узел; ссылки на него становятся пустыми — валидатор подсветит их как несвязанные. */
export function removeNode(doc: ScenarioDoc, id: string): ScenarioDoc {
  const next = structuredClone(doc)
  delete next.nodes[id]
  delete next.layout[id]
  replaceReferences(next, id, '')
  return next
}

export function renameNode(doc: ScenarioDoc, from: string, to: string): ScenarioDoc | string {
  if (from === to) return doc
  if (!NODE_ID_PATTERN.test(to)) return 'id: латиница, цифры, «_» и «-», до 64 символов'
  if (to in doc.nodes) return `Узел «${to}» уже существует`
  const next = structuredClone(doc)
  // Пересобираем объект, чтобы сохранить порядок узлов.
  next.nodes = Object.fromEntries(Object.entries(next.nodes).map(([id, node]) => [id === from ? to : id, node]))
  if (from in next.layout) {
    next.layout[to] = next.layout[from]
    delete next.layout[from]
  }
  replaceReferences(next, from, to)
  return next
}

export function duplicateNode(doc: ScenarioDoc, id: string): { doc: ScenarioDoc; id: string } {
  const copyId = uniqueNodeId(doc, `${id}_copy`)
  const next = structuredClone(doc)
  next.nodes[copyId] = structuredClone(doc.nodes[id])
  const position = doc.layout[id] ?? { x: 0, y: 0 }
  next.layout[copyId] = { x: position.x + 40, y: position.y + 40 }
  return { doc: next, id: copyId }
}

export function updateNode(doc: ScenarioDoc, id: string, node: NodeDoc): ScenarioDoc {
  return { ...doc, nodes: { ...doc.nodes, [id]: node } }
}

export function nextChoiceId(node: ChoiceNodeDoc): string {
  const used = new Set(node.choices.map((c) => c.id))
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') if (!used.has(letter)) return letter
  return `choice_${node.choices.length + 1}`
}

// ---------- Раскладка ----------

/** Слоистая раскладка: колонка — расстояние от старта (обход в ширину), недостижимые узлы — в последней колонке. */
export function autoLayout(doc: ScenarioDoc): Record<string, Position> {
  const depth = new Map<string, number>()
  const queue: string[] = []
  const roots = [doc.start, ...doc.interrupts.map((i) => i.next)].filter((id) => id in doc.nodes)
  for (const root of roots) if (!depth.has(root)) { depth.set(root, 0); queue.push(root) }
  while (queue.length) {
    const id = queue.shift()!
    for (const { target } of outgoing(doc.nodes[id])) {
      if (target in doc.nodes && !depth.has(target)) {
        depth.set(target, depth.get(id)! + 1)
        queue.push(target)
      }
    }
  }
  const lastColumn = Math.max(0, ...depth.values()) + 1
  const rows = new Map<number, number>()
  const layout: Record<string, Position> = {}
  for (const id of Object.keys(doc.nodes)) {
    const column = depth.get(id) ?? lastColumn
    const row = rows.get(column) ?? 0
    rows.set(column, row + 1)
    layout[id] = { x: column * COLUMN_WIDTH, y: row * ROW_HEIGHT }
  }
  return layout
}

/** Проставляет позиции узлам, у которых их нет (например, после импорта сценария без layout). */
export function withLayout(doc: ScenarioDoc): ScenarioDoc {
  const missing = Object.keys(doc.nodes).filter((id) => !doc.layout[id])
  if (missing.length === 0) return doc
  const computed = autoLayout(doc)
  const layout = { ...doc.layout }
  for (const id of missing) layout[id] = computed[id]
  return { ...doc, layout }
}

// ---------- Условия ----------

export const OPERATORS = ['<', '<=', '>', '>=', '==', '!='] as const

export interface ConditionParts {
  operand: string
  op: string
  value: string
}

/** Условие — ровно три части через пробел (как в app/engine/conditions.py). */
export function parseCondition(text: string): ConditionParts | null {
  const parts = text.trim().split(/\s+/)
  if (parts.length !== 3 || !(OPERATORS as readonly string[]).includes(parts[1])) return null
  return { operand: parts[0], op: parts[1], value: parts[2] }
}

export const formatCondition = ({ operand, op, value }: ConditionParts): string => `${operand} ${op} ${value}`

// ---------- Сводка для холста ----------

/** Узлы, на которые ведут прерывания (показываются значком «молния»). */
export function interruptTargets(doc: ScenarioDoc): Set<string> {
  return new Set(doc.interrupts.map((i) => i.next))
}
