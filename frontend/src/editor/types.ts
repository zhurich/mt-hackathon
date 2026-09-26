// Черновик сценария в редакторе — точное отражение YAML-формата (docs/scenario-format.md).
// Сериализуется в JSON и отправляется на сервер как есть, поэтому лишних полей здесь нет.

export type Quality = 'best' | 'good' | 'poor' | 'bad'
export type RoleStep = 'acknowledge' | 'rule' | 'solution' | 'assure'
export type Outcome = 'success' | 'partial' | 'fail'
export type NodeType = 'choice' | 'router' | 'ending'

export interface Effects {
  loyalty: number
  safety: number
  vars: Record<string, number>
  flags: Record<string, boolean>
}

export interface ChoiceDoc {
  id: string
  text: string
  quality: Quality
  feedback: string
  next: string
  effects: Effects
  role_model: RoleStep[]
  if: string[]
}

export interface TimeoutDoc {
  feedback: string
  next: string
  effects: Effects
}

export interface ChoiceNodeDoc {
  type: 'choice'
  text: string
  speaker: string
  speaker_name: string | null
  competencies: string[]
  timer: number | null
  on_timeout: TimeoutDoc | null
  choices: ChoiceDoc[]
}

export interface RouteDoc {
  next: string
  if: string[]
}

export interface RouterNodeDoc {
  type: 'router'
  routes: RouteDoc[]
}

export interface EndingNodeDoc {
  type: 'ending'
  outcome: Outcome
  title: string
  text: string
}

export type NodeDoc = ChoiceNodeDoc | RouterNodeDoc | EndingNodeDoc

export interface InterruptDoc {
  if: string[]
  next: string
}

export interface Position {
  x: number
  y: number
}

export interface ScenarioDoc {
  id: string
  version: number
  title: string
  summary: string
  category: string
  difficulty: number
  service_class: string
  briefing: string
  sources: string[]
  initial: { loyalty: number; safety: number; vars: Record<string, number> }
  hud: Record<string, string>
  start: string
  interrupts: InterruptDoc[]
  nodes: Record<string, NodeDoc>
  layout: Record<string, Position>
}

/** Выход узла на холсте: вариант ответа, ветка таймаута или маршрут router. */
export type Handle = { kind: 'choice'; index: number } | { kind: 'timeout' } | { kind: 'route'; index: number }

export interface Issue {
  node_id: string | null
  message: string
}
