// Узлы графа на холсте. У каждого варианта ответа / маршрута / ветки таймаута — свой выход (Handle),
// поэтому связь «куда ведёт вариант» задаётся перетаскиванием от строки варианта к узлу.

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { OUTCOME, QUALITY } from '../labels'
import { handleId } from './model'
import type { ChoiceNodeDoc, EndingNodeDoc, NodeDoc, RouterNodeDoc } from './types'

export interface FlowNodeData extends Record<string, unknown> {
  nodeId: string
  node: NodeDoc
  isStart: boolean
  isInterruptTarget: boolean
  issues: string[]
}

export type FlowNode = Node<FlowNodeData>

function Header({ icon, kind, data, extra }: { icon: string; kind: string; data: FlowNodeData; extra?: string }) {
  return (
    <div className="fnode-head">
      <span className="fnode-kind">{icon} {kind}</span>
      <span className="fnode-id">{data.nodeId}</span>
      {data.isStart && <span className="fbadge fbadge-start" title="Стартовый узел">▶ старт</span>}
      {data.isInterruptTarget && <span className="fbadge" title="Сюда ведёт прерывание по шкале">⚡</span>}
      {extra && <span className="fbadge">{extra}</span>}
      {data.issues.length > 0 && (
        <span className="fbadge fbadge-error" title={data.issues.join('\n')}>✕ {data.issues.length}</span>
      )}
    </div>
  )
}

function frameClass(kind: string, selected: boolean, data: FlowNodeData) {
  return `fnode fnode-${kind}${selected ? ' selected' : ''}${data.issues.length ? ' has-issues' : ''}`
}

function In() {
  return <Handle type="target" position={Position.Left} id="in" className="fhandle-in" />
}

function Out({ id, unlinked }: { id: string; unlinked: boolean }) {
  return <Handle type="source" position={Position.Right} id={id} className={`fhandle-out${unlinked ? ' unlinked' : ''}`} />
}

function ChoiceFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.node as ChoiceNodeDoc
  return (
    <div className={frameClass('choice', selected, data)}>
      <In />
      <Header icon="💬" kind="Решение" data={data} extra={node.timer ? `⏱ ${node.timer} с` : undefined} />
      <div className="fnode-text">{node.text || <em>Текст ситуации не задан</em>}</div>
      {node.choices.map((choice, index) => {
        const quality = QUALITY[choice.quality]
        return (
          <div key={index} className="fnode-row">
            <span className={`fq fq-${choice.quality}`} title={quality.title}>{quality.icon}</span>
            <span className="fnode-row-text">{choice.text || <em>{choice.id}</em>}</span>
            {choice.if.length > 0 && <span className="fnode-cond" title={choice.if.join(' и ')}>если…</span>}
            <Out id={handleId({ kind: 'choice', index })} unlinked={!choice.next} />
          </div>
        )
      })}
      {node.on_timeout && (
        <div className="fnode-row fnode-row-timeout">
          <span className="fq fq-bad">⏱</span>
          <span className="fnode-row-text">Время вышло</span>
          <Out id="timeout" unlinked={!node.on_timeout.next} />
        </div>
      )}
    </div>
  )
}

function RouterFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.node as RouterNodeDoc
  return (
    <div className={frameClass('router', selected, data)}>
      <In />
      <Header icon="🔀" kind="Условие" data={data} />
      {node.routes.map((route, index) => (
        <div key={index} className="fnode-row">
          <span className="fnode-row-text mono">{route.if.length ? route.if.join(' и ') : 'иначе'}</span>
          <Out id={handleId({ kind: 'route', index })} unlinked={!route.next} />
        </div>
      ))}
    </div>
  )
}

function EndingFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.node as EndingNodeDoc
  const outcome = OUTCOME[node.outcome]
  return (
    <div className={frameClass(`ending fnode-${node.outcome}`, selected, data)}>
      <In />
      <Header icon="🏁" kind="Финал" data={data} />
      <div className="fnode-text">
        <span className={`chip tone-${outcome.tone}`}>{outcome.icon} {outcome.title}</span> {node.title}
      </div>
    </div>
  )
}

export const nodeTypes = { choice: ChoiceFlowNode, router: RouterFlowNode, ending: EndingFlowNode }
