import { describe, expect, it } from 'vitest'
import {
  addNode, autoLayout, duplicateNode, formatCondition, handleId, newScenario, normalize, parseCondition,
  parseHandle, removeNode, renameNode, setTarget, toContent, withLayout,
} from './model'
import type { ChoiceNodeDoc, ScenarioDoc } from './types'

const choiceNode = (doc: ScenarioDoc, id: string) => doc.nodes[id] as ChoiceNodeDoc

describe('связи', () => {
  it('handle кодируется и разбирается обратно', () => {
    for (const handle of [{ kind: 'choice', index: 2 }, { kind: 'route', index: 0 }, { kind: 'timeout' }] as const) {
      expect(parseHandle(handleId(handle))).toEqual(handle)
    }
    expect(parseHandle('choice:x')).toBeNull()
  })

  it('setTarget меняет только нужный выход и не мутирует исходный документ', () => {
    const doc = newScenario()
    const changed = setTarget(doc, 'start', { kind: 'choice', index: 1 }, 'end_ok')
    expect(choiceNode(changed, 'start').choices[1].next).toBe('end_ok')
    expect(choiceNode(changed, 'start').choices[0].next).toBe('end_ok')
    expect(choiceNode(doc, 'start').choices[1].next).toBe('end_fail')
  })
})

describe('узлы', () => {
  it('addNode создаёт уникальный id и позицию', () => {
    const first = addNode(newScenario(), 'choice', { x: 10, y: 20 })
    const second = addNode(first.doc, 'choice', { x: 0, y: 0 })
    expect(first.id).toBe('step')
    expect(second.id).toBe('step_2')
    expect(second.doc.layout.step).toEqual({ x: 10, y: 20 })
  })

  it('removeNode очищает все ссылки на удалённый узел', () => {
    let doc = newScenario()
    doc = { ...doc, interrupts: [{ if: ['safety <= 10'], next: 'end_fail' }] }
    const result = removeNode(doc, 'end_fail')
    expect('end_fail' in result.nodes).toBe(false)
    expect(choiceNode(result, 'start').choices[1].next).toBe('')
    expect(result.interrupts[0].next).toBe('')
  })

  it('renameNode обновляет ссылки, старт, раскладку и сохраняет порядок', () => {
    const doc = withLayout(newScenario())
    const result = renameNode(doc, 'start', 'greeting') as ScenarioDoc
    expect(Object.keys(result.nodes)[0]).toBe('greeting')
    expect(result.start).toBe('greeting')
    expect(result.layout.greeting).toEqual(doc.layout.start)
    const renamedEnd = renameNode(result, 'end_ok', 'finish') as ScenarioDoc
    expect(choiceNode(renamedEnd, 'greeting').choices[0].next).toBe('finish')
  })

  it('renameNode отклоняет занятые и некорректные id', () => {
    const doc = newScenario()
    expect(renameNode(doc, 'start', 'end_ok')).toMatch(/уже существует/)
    expect(renameNode(doc, 'start', 'с пробелом')).toMatch(/латиница/)
  })

  it('duplicateNode копирует узел рядом с оригиналом', () => {
    const doc = withLayout(newScenario())
    const { doc: result, id } = duplicateNode(doc, 'start')
    expect(id).toBe('start_copy')
    expect(result.nodes[id]).toEqual(doc.nodes.start)
    expect(result.layout[id].x).toBe(doc.layout.start.x + 40)
  })
})

describe('раскладка', () => {
  it('колонка = расстояние от старта, недостижимые — в последней колонке', () => {
    const { doc } = addNode(newScenario(), 'ending', { x: 0, y: 0 })
    const layout = autoLayout(doc)
    expect(layout.start.x).toBe(0)
    expect(layout.end_ok.x).toBeGreaterThan(0)
    expect(layout.end.x).toBeGreaterThan(layout.end_ok.x)
    expect(layout.end_ok.y).not.toBe(layout.end_fail.y)
  })
})

describe('импорт и экспорт', () => {
  it('normalize дополняет недостающие поля', () => {
    const doc = normalize({ id: 'x', nodes: { a: { type: 'choice', text: 't', choices: [{ id: 'c', next: 'b' }] }, b: { type: 'ending' } } })
    const node = choiceNode(doc, 'a')
    expect(node.choices[0].effects).toEqual({ loyalty: 0, safety: 0, vars: {}, flags: {} })
    expect(node.timer).toBeNull()
    expect(doc.nodes.b).toMatchObject({ type: 'ending', outcome: 'fail' })
  })

  it('toContent отбрасывает позиции удалённых узлов', () => {
    const doc = { ...withLayout(newScenario()), layout: { ghost: { x: 1, y: 1 }, start: { x: 0, y: 0 } } }
    expect(JSON.parse(toContent(doc)).layout).toEqual({ start: { x: 0, y: 0 } })
  })
})

describe('условия', () => {
  it('разбор и сборка', () => {
    expect(parseCondition(' safety   <  40 ')).toEqual({ operand: 'safety', op: '<', value: '40' })
    expect(formatCondition({ operand: 'flags.chief_called', op: '==', value: 'true' })).toBe('flags.chief_called == true')
    expect(parseCondition('safety<40')).toBeNull()
  })
})
