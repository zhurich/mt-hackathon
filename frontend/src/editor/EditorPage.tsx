import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ReactFlowProvider } from '@xyflow/react'
import { ApiError, api } from '../api/client'
import type { ScenarioSummary } from '../api/types'
import { ErrorBox, Loader } from '../components/ui'
import GraphCanvas from './GraphCanvas'
import NodeInspector, { type Dictionaries } from './NodeInspector'
import PreviewPanel from './PreviewPanel'
import ScenarioSettings from './ScenarioSettings'
import {
  addNode, autoLayout, blankNode, duplicateNode, newScenario, normalize, removeNode, renameNode, setTarget,
  toContent, updateNode, withLayout,
} from './model'
import { useHistory } from './useHistory'
import type { Handle, Issue, NodeType, Position, ScenarioDoc } from './types'
import './editor.css'

const DRAFT_PREFIX = 'vsm.editor.draft.'
const VALIDATE_DELAY_MS = 700

function readDraft(key: string): ScenarioDoc | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key)
    return raw ? normalize(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeDraft(key: string, doc: ScenarioDoc | null) {
  try {
    if (doc) localStorage.setItem(DRAFT_PREFIX + key, toContent(doc))
    else localStorage.removeItem(DRAFT_PREFIX + key)
  } catch {
    // хранилище недоступно (приватный режим) — черновик живёт до закрытия вкладки
  }
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/yaml;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  link.click()
  URL.revokeObjectURL(url)
}

/** Загрузка исходного документа: новый сценарий или следующая версия опубликованного. */
function useSource(scenarioId: string) {
  return useQuery({
    queryKey: ['editor-source', scenarioId],
    queryFn: async () => {
      if (scenarioId === 'new') return withLayout(newScenario())
      const graph = normalize(await api.get(`/scenarios/${scenarioId}/graph`))
      return withLayout({ ...graph, version: graph.version + 1 })
    },
    staleTime: Infinity,
    gcTime: 0,
  })
}

export default function EditorPage() {
  const { id = 'new' } = useParams()
  const source = useSource(id)
  const dict = useQuery({ queryKey: ['editor-dict'], queryFn: () => api.get<Dictionaries>('/editor/dictionaries') })

  if (source.isPending || dict.isPending) return <div style={{ padding: '1rem' }}><Loader /></div>
  if (source.error || dict.error || !source.data || !dict.data) {
    return <div style={{ padding: '1rem' }}><ErrorBox error={source.error ?? dict.error} /></div>
  }
  return (
    <ReactFlowProvider>
      <Editor key={id} draftKey={id} initial={source.data} dict={dict.data} />
    </ReactFlowProvider>
  )
}

type Tab = 'node' | 'scenario' | 'issues'

function Editor({ draftKey, initial, dict }: { draftKey: string; initial: ScenarioDoc; dict: Dictionaries }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const history = useHistory<ScenarioDoc>(initial)
  const doc = history.value
  const { commit } = history

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(null)
  const focusOn = useCallback((nodeId: string) => {
    setSelectedId(nodeId)
    setFocus((current) => ({ id: nodeId, seq: (current?.seq ?? 0) + 1 }))
  }, [])
  const [tab, setTab] = useState<Tab>('scenario')
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [validationError, setValidationError] = useState<unknown>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [message, setMessage] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)
  const [savedDraft, setSavedDraft] = useState(() => {
    const draft = readDraft(draftKey)
    return draft && toContent(draft) !== toContent(initial) ? draft : null
  })

  // Автосохранение черновика в браузере (кроме момента, когда ещё не решено, восстанавливать ли прошлый).
  useEffect(() => {
    if (savedDraft) return
    const timer = window.setTimeout(() => writeDraft(draftKey, doc), 400)
    return () => window.clearTimeout(timer)
  }, [doc, draftKey, savedDraft])

  // Проверка черновика тем же валидатором, что и при публикации.
  useEffect(() => {
    let stale = false // ответ на устаревшую версию черновика игнорируется
    const timer = window.setTimeout(() => {
      api.post<{ valid: boolean; issues: Issue[] }>('/editor/validate', { content: toContent(doc) })
        .then((result) => { if (!stale) { setIssues(result.issues); setValidationError(null) } })
        .catch((err) => { if (!stale) setValidationError(err) })
    }, VALIDATE_DELAY_MS)
    return () => { stale = true; window.clearTimeout(timer) }
  }, [doc])

  const issuesByNode = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const issue of issues ?? []) {
      if (issue.node_id) map.set(issue.node_id, [...(map.get(issue.node_id) ?? []), issue.message])
    }
    return map
  }, [issues])
  const globalIssues = (issues ?? []).filter((issue) => !issue.node_id || !(issue.node_id in doc.nodes)).map((i) => i.message)

  const select = useCallback((nodeId: string | null) => {
    setSelectedId(nodeId)
    if (nodeId) setTab('node')
  }, [])

  // ---------- Действия ----------

  function placeNear(): Position {
    const anchor = selectedId ? doc.layout[selectedId] : null
    if (anchor) return { x: anchor.x + 340, y: anchor.y }
    const xs = Object.values(doc.layout).map((p) => p.x)
    return { x: (xs.length ? Math.max(...xs) : 0) + 340, y: 0 }
  }

  function add(type: NodeType) {
    const created = addNode(doc, type, placeNear())
    commit(created.doc)
    select(created.id)
    focusOn(created.id)
  }

  const onConnect = (nodeId: string, handle: Handle, target: string) => commit((d) => setTarget(d, nodeId, handle, target))
  const onDisconnect = (nodeId: string, handle: Handle) => commit((d) => setTarget(d, nodeId, handle, ''), 'delete')
  const onCreateFrom = (nodeId: string, handle: Handle, position: Position) => {
    const created = addNode(doc, 'choice', position)
    commit(setTarget(created.doc, nodeId, handle, created.id))
    select(created.id)
  }
  const onMove = (positions: Record<string, Position>) => commit((d) => ({ ...d, layout: { ...d.layout, ...positions } }))
  const onDelete = (ids: string[]) => {
    commit((d) => ids.reduce((acc, nodeId) => removeNode(acc, nodeId), d), 'delete')
    if (selectedId && ids.includes(selectedId)) setSelectedId(null)
  }

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y по физическим клавишам — работает и в русской раскладке.
  const { undo, redo } = history
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return // в полях — родная отмена браузера
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.code === 'KeyY' || (event.code === 'KeyZ' && event.shiftKey)) {
        event.preventDefault()
        redo()
      } else if (event.code === 'KeyZ') {
        event.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  async function publish() {
    setMessage(null)
    if (issues && issues.length > 0) {
      setMessage({ tone: 'critical', text: 'Сначала исправьте проблемы — список на вкладке «Проблемы».' })
      setTab('issues')
      return
    }
    if (!window.confirm(`Опубликовать «${doc.title}» версии ${doc.version}? Сотрудники получат уведомление.`)) return
    try {
      const published = await api.post<ScenarioSummary>('/scenarios', { content: toContent(doc) })
      writeDraft(draftKey, null)
      queryClient.invalidateQueries({ queryKey: ['scenarios'] })
      setMessage({ tone: 'positive', text: `Опубликована версия ${published.version}. Дальнейшие правки — черновик версии ${published.version + 1}.` })
      history.reset({ ...doc, version: published.version + 1 })
      if (draftKey === 'new') navigate(`/trainer/editor/${published.id}`, { replace: true })
    } catch (err) {
      setMessage({ tone: 'critical', text: err instanceof ApiError ? err.message : 'Не удалось опубликовать' })
    }
  }

  async function exportYaml() {
    try {
      const { yaml } = await api.post<{ yaml: string }>('/editor/yaml', { content: toContent(doc) })
      download(`${doc.id}.yaml`, yaml)
    } catch (err) {
      setMessage({ tone: 'critical', text: err instanceof ApiError ? err.message : 'Не удалось выгрузить YAML' })
    }
  }

  const issueCount = issues?.length ?? 0
  const selected = selectedId && doc.nodes[selectedId] ? selectedId : null

  return (
    <div className="editor">
      <div className="etoolbar">
        <Link to="/trainer" className="btn" title="К панели тренера">←</Link>
        <div className="etitle">
          <strong>{doc.title || 'Без названия'}</strong>
          <span className="small muted mono">{doc.id} · v{doc.version}</span>
        </div>
        <div className="row etools">
          <button type="button" className="btn" onClick={() => add('choice')} title="Узел с ситуацией и вариантами ответа">+ 💬 Решение</button>
          <button type="button" className="btn" onClick={() => add('router')} title="Невидимый переход по условиям">+ 🔀 Условие</button>
          <button type="button" className="btn" onClick={() => add('ending')}>+ 🏁 Финал</button>
          <span className="esep" />
          <button type="button" className="btn" onClick={history.undo} disabled={!history.canUndo} title="Отменить (Ctrl+Z)">↶</button>
          <button type="button" className="btn" onClick={history.redo} disabled={!history.canRedo} title="Повторить (Ctrl+Shift+Z)">↷</button>
          <button type="button" className="btn" onClick={() => commit({ ...doc, layout: autoLayout(doc) })} title="Расставить узлы по шагам от старта">⇶ Раскладка</button>
          <span className="esep" />
          <button type="button" className="btn" onClick={() => setImportOpen(true)}>Импорт</button>
          <button type="button" className="btn" onClick={exportYaml}>YAML ↓</button>
          <button type="button" className={`btn estatus ${issueCount ? 'bad' : issues ? 'ok' : ''}`} onClick={() => setTab('issues')}>
            {issues === null ? '… проверка' : issueCount ? `✕ Проблем: ${issueCount}` : '✓ Ошибок нет'}
          </button>
          <button type="button" className="btn" onClick={() => setPreviewOpen(true)} disabled={issueCount > 0}
                  title={issueCount ? 'Прогон доступен после исправления проблем' : 'Пройти черновик как игрок'}>▶ Прогон</button>
          <button type="button" className="btn btn-primary" onClick={publish}>Опубликовать</button>
        </div>
      </div>

      {savedDraft && (
        <div className="alert alert-warning ebanner">
          Есть несохранённый черновик этого сценария из прошлого сеанса.
          <button type="button" className="btn" onClick={() => { history.reset(savedDraft); setSavedDraft(null) }}>Восстановить</button>
          <button type="button" className="btn" onClick={() => { writeDraft(draftKey, null); setSavedDraft(null) }}>Отбросить</button>
        </div>
      )}
      {message && (
        <div className={`alert alert-${message.tone} ebanner`}>
          {message.text}
          <button type="button" className="ebtn-icon" onClick={() => setMessage(null)}>✕</button>
        </div>
      )}

      <div className="ebody">
        <div className="ecanvas">
          <GraphCanvas doc={doc} issuesByNode={issuesByNode} selectedId={selected} onSelect={select}
                       onConnect={onConnect} onDisconnect={onDisconnect} onCreateFrom={onCreateFrom}
                       onMove={onMove} onDelete={onDelete} focus={focus} />
          <div className="elegend small">
            <span><span className="fq fq-best">★</span> лучший</span>
            <span><span className="fq fq-good">✓</span> хороший</span>
            <span><span className="fq fq-poor">!</span> слабый</span>
            <span><span className="fq fq-bad">✕</span> ошибка</span>
            <span>┅ таймаут</span>
            <span className="muted">Тяните от точки справа к узлу или на пустое место — появится новый узел</span>
          </div>
        </div>

        <aside className="epanel">
          {previewOpen ? (
            <PreviewPanel doc={doc} onClose={() => setPreviewOpen(false)} onFocusNode={focusOn} />
          ) : (
            <>
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'node'} className={tab === 'node' ? 'active' : ''} onClick={() => setTab('node')}>Узел</button>
                <button type="button" role="tab" aria-selected={tab === 'scenario'} className={tab === 'scenario' ? 'active' : ''} onClick={() => setTab('scenario')}>Сценарий</button>
                <button type="button" role="tab" aria-selected={tab === 'issues'} className={tab === 'issues' ? 'active' : ''} onClick={() => setTab('issues')}>
                  Проблемы{issueCount ? ` (${issueCount})` : ''}
                </button>
              </div>
              <div className="epanel-body">
                {tab === 'node' && (selected ? (
                  <NodeInspector
                    key={selected}
                    doc={doc}
                    nodeId={selected}
                    dict={dict}
                    issues={issuesByNode.get(selected) ?? []}
                    onChange={(node, group) => commit((d) => updateNode(d, selected, node), group && `${selected}.${group}`)}
                    onRename={(newId) => {
                      const result = renameNode(doc, selected, newId)
                      if (typeof result === 'string') return result
                      commit(result)
                      setSelectedId(newId)
                      return null
                    }}
                    onDelete={() => onDelete([selected])}
                    onDuplicate={() => {
                      const copy = duplicateNode(doc, selected)
                      commit(copy.doc)
                      select(copy.id)
                      focusOn(copy.id)
                    }}
                    onSetStart={() => commit({ ...doc, start: selected })}
                    onChangeType={(type) => {
                      if (type === doc.nodes[selected].type) return
                      if (window.confirm('Сменить тип узла? Содержимое узла будет заменено пустым шаблоном.')) {
                        commit(updateNode(doc, selected, blankNode(type)))
                      }
                    }}
                  />
                ) : (
                  <p className="muted small">Выберите узел на холсте или добавьте новый кнопками сверху.</p>
                ))}
                {tab === 'scenario' && (
                  <ScenarioSettings doc={doc} dict={dict} globalIssues={globalIssues}
                                    onChange={(next, group) => commit(next, group && `scenario.${group}`)} />
                )}
                {tab === 'issues' && (
                  <div className="stack" style={{ gap: '0.5rem' }}>
                    {validationError !== null && <ErrorBox error={validationError} />}
                    {issues === null && <Loader />}
                    {issues?.length === 0 && <div className="alert alert-positive">✓ Сценарий корректен и готов к публикации.</div>}
                    {issues?.map((issue, index) => (
                      <button key={index} type="button" className="eissue" disabled={!issue.node_id || !(issue.node_id in doc.nodes)}
                              onClick={() => { if (issue.node_id) { select(issue.node_id); focusOn(issue.node_id) } }}>
                        {issue.node_id && <span className="mono chip">{issue.node_id}</span>} {issue.message}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {importOpen && (
        <ImportDialog onClose={() => setImportOpen(false)} onImport={(imported) => {
          commit(withLayout(imported))
          setSelectedId(null)
          setImportOpen(false)
          setTab('scenario')
        }} />
      )}
    </div>
  )
}

function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (doc: ScenarioDoc) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<unknown>(null)
  async function submit() {
    try {
      const { data } = await api.post<{ data: unknown }>('/editor/parse', { content: text })
      onImport(normalize(data))
    } catch (err) {
      setError(err)
    }
  }
  return (
    <div className="emodal" role="dialog" aria-modal="true" aria-label="Импорт сценария">
      <div className="card stack emodal-body">
        <strong>Импорт сценария (YAML или JSON)</strong>
        <p className="small secondary">Текущий черновик будет заменён. Импорт можно отменить кнопкой ↶ (Ctrl+Z).</p>
        <textarea rows={16} value={text} onChange={(e) => setText(e.target.value)} placeholder="id: my-scenario&#10;version: 1&#10;…" />
        {error !== null && <ErrorBox error={error} />}
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={submit}>Загрузить в редактор</button>
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  )
}
