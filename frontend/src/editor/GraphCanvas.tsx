import { useEffect, useMemo, useState } from 'react'
import {
  Background, Controls, MarkerType, MiniMap, ReactFlow, applyEdgeChanges, applyNodeChanges, useReactFlow,
  type Connection, type Edge, type EdgeChange, type FinalConnectionState, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes, type FlowNode } from './FlowNodes'
import { handleId, interruptTargets, outgoing, parseHandle } from './model'
import type { Handle, Position, ScenarioDoc } from './types'

// Цвета связей повторяют значки качества в узлах; тип связи различается и формой линии.
const EDGE_COLOR: Record<string, string> = {
  best: 'var(--good)', good: 'var(--good)', poor: 'var(--warning)', bad: 'var(--critical)',
  timeout: 'var(--critical)', route: 'var(--series-1)',
}

interface Props {
  doc: ScenarioDoc
  issuesByNode: Map<string, string[]>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onConnect: (nodeId: string, handle: Handle, target: string) => void
  onDisconnect: (nodeId: string, handle: Handle) => void
  onCreateFrom: (nodeId: string, handle: Handle, position: Position) => void
  onMove: (positions: Record<string, Position>) => void
  onDelete: (ids: string[]) => void
  /** Узел, к которому нужно плавно перевести камеру (seq меняется при каждом запросе). */
  focus: { id: string; seq: number } | null
}

function buildEdges(doc: ScenarioDoc): Edge[] {
  const edges: Edge[] = []
  for (const [source, node] of Object.entries(doc.nodes)) {
    for (const { handle, target } of outgoing(node)) {
      if (!(target in doc.nodes)) continue
      const tone = handle.kind === 'choice' && node.type === 'choice'
        ? node.choices[handle.index].quality
        : handle.kind === 'timeout' ? 'timeout' : 'route'
      const id = handleId(handle)
      edges.push({
        id: `${source}|${id}`,
        source,
        sourceHandle: id,
        target,
        targetHandle: 'in',
        style: { stroke: EDGE_COLOR[tone], strokeWidth: 2, strokeDasharray: tone === 'timeout' ? '6 4' : undefined },
        markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR[tone] },
      })
    }
  }
  return edges
}

export default function GraphCanvas(props: Props) {
  const { doc, issuesByNode, selectedId, focus } = props
  const { screenToFlowPosition, setCenter, getZoom } = useReactFlow()

  // При открытии показываем старт и его ближайшие связи в читаемом масштабе, а не весь граф мелко.
  const [initialFit] = useState(() => {
    const start = doc.nodes[doc.start]
    const ids = start ? [doc.start, ...outgoing(start).map((edge) => edge.target)] : Object.keys(doc.nodes)
    return { nodes: ids.filter((id) => id in doc.nodes).map((id) => ({ id })), padding: 0.25, maxZoom: 1 }
  })

  useEffect(() => {
    const position = focus && doc.layout[focus.id]
    if (position) setCenter(position.x + 135, position.y + 90, { zoom: Math.max(getZoom(), 0.8), duration: 300 })
    // Реагируем только на новый запрос фокуса, а не на каждую правку документа.
  }, [focus?.seq])

  const derived = useMemo<FlowNode[]>(() => {
    const interrupted = interruptTargets(doc)
    return Object.entries(doc.nodes).map(([id, node]) => ({
      id,
      type: node.type,
      position: doc.layout[id] ?? { x: 0, y: 0 },
      selected: id === selectedId,
      data: {
        nodeId: id, node, isStart: id === doc.start, isInterruptTarget: interrupted.has(id),
        issues: issuesByNode.get(id) ?? [],
      },
    }))
  }, [doc, issuesByNode, selectedId])

  // Локальная копия узлов — чтобы перетаскивание было плавным; в документ позиция попадает по окончании.
  const [nodes, setNodes] = useState<FlowNode[]>(derived)
  useEffect(() => setNodes(derived), [derived])
  const derivedEdges = useMemo(() => buildEdges(doc), [doc])
  const [edges, setEdges] = useState<Edge[]>(derivedEdges)
  useEffect(() => setEdges(derivedEdges), [derivedEdges])

  function onConnect(connection: Connection) {
    const handle = connection.sourceHandle ? parseHandle(connection.sourceHandle) : null
    if (handle && connection.target) props.onConnect(connection.source, handle, connection.target)
  }

  // Связь, брошенная на тело узла (а не точно на его вход), подключается к этому узлу;
  // брошенная на пустое место холста — создаёт новый узел в этой точке.
  function onConnectEnd(event: MouseEvent | TouchEvent, state: FinalConnectionState) {
    if (state.isValid || !state.fromNode || !state.fromHandle?.id) return
    const handle = parseHandle(state.fromHandle.id)
    if (!handle) return
    const point = 'changedTouches' in event ? event.changedTouches[0] : event
    const dropped = document.elementFromPoint(point.clientX, point.clientY)?.closest('.react-flow__node')
    const targetId = dropped?.getAttribute('data-id')
    if (targetId) props.onConnect(state.fromNode.id, handle, targetId)
    else props.onCreateFrom(state.fromNode.id, handle, screenToFlowPosition({ x: point.clientX, y: point.clientY }))
  }

  return (
    <ReactFlow<FlowNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={(changes: NodeChange<FlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current))}
      onEdgesChange={(changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current))}
      onNodeClick={(_, node) => props.onSelect(node.id)}
      onPaneClick={() => props.onSelect(null)}
      onNodeDragStop={(_, __, dragged) =>
        props.onMove(Object.fromEntries(dragged.map((node) => [node.id, node.position])))}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      onEdgesDelete={(deleted) => deleted.forEach((edge) => {
        const handle = edge.sourceHandle ? parseHandle(edge.sourceHandle) : null
        if (handle) props.onDisconnect(edge.source, handle)
      })}
      onNodesDelete={(deleted) => props.onDelete(deleted.map((node) => node.id))}
      deleteKeyCode={['Delete', 'Backspace']}
      colorMode="system"
      fitView
      fitViewOptions={initialFit}
      minZoom={0.2}
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={24} />
      <MiniMap pannable zoomable nodeStrokeWidth={3} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
