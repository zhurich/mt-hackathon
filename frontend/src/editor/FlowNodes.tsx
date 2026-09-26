// Узлы графа на холсте. У каждого варианта ответа / маршрута / ветки таймаута — свой выход (Handle),
// поэтому связь «куда ведёт вариант» задаётся перетаскиванием от строки варианта к узлу.

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Chip, Icon, type IconName } from '../components/ui'
import { OUTCOME } from '../labels'
import { QualityMark } from './fields'
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

function Header({ icon, kind, data, extra }: { icon: IconName; kind: string; data: FlowNodeData; extra?: string }) {
  return (
    <div className="fnode-head">
      <span className="fnode-kind"><Icon name={icon} size={14} />{kind}</span>
      <span className="fnode-id">{data.nodeId}</span>
      {data.isStart && <span className="fbadge fbadge-start" title="Стартовый узел"><Icon name="play" size={10} />старт</span>}
      {data.isInterruptTarget && <span className="fbadge" title="Сюда ведёт прерывание по шкале"><Icon name="zap" size={10} /></span>}
      {extra && <span className="fbadge"><Icon name="timer" size={10} />{extra}</span>}
      {data.issues.length > 0 && (
        <span className="fbadge fbadge-error" title={data.issues.join('\n')}><Icon name="x" size={10} />{data.issues.length}</span>
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
      <Header icon="message-square" kind="Решение" data={data} extra={node.timer ? `${node.timer} с` : undefined} />
      <div className="fnode-text">{node.text || <em>Текст ситуации не задан</em>}</div>
      {node.choices.map((choice, index) => {
        return (
          <div key={index} className="fnode-row">
            <QualityMark quality={choice.quality} />
            <span className="fnode-row-text">{choice.text || <em>{choice.id}</em>}</span>
            {choice.if.length > 0 && <span className="fnode-cond" title={choice.if.join(' и ')}>если…</span>}
            <Out id={handleId({ kind: 'choice', index })} unlinked={!choice.next} />
          </div>
        )
      })}
      {node.on_timeout && (
        <div className="fnode-row fnode-row-timeout">
          <QualityMark quality="timeout" />
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
      <Header icon="split" kind="Условие" data={data} />
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
      <Header icon="flag" kind="Финал" data={data} />
      <div className="fnode-text">
        <Chip tone={outcome.tone} icon={outcome.icon}>{outcome.title}</Chip> {node.title}
      </div>
    </div>
  )
}

export const nodeTypes = { choice: ChoiceFlowNode, router: RouterFlowNode, ending: EndingFlowNode }
