import { useCallback, useRef, useState } from 'react'

const MAX_STEPS = 100
const GROUP_WINDOW_MS = 800

interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

/** Состояние с отменой и повтором. Изменения с одинаковым group подряд (например, набор текста
 * в одном поле) объединяются в один шаг истории. */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [] })
  const lastGroup = useRef<{ key: string | null; at: number }>({ key: null, at: 0 })

  const commit = useCallback((next: T | ((current: T) => T), group?: string) => {
    // Решение об объединении принимается вне функции-обновления: React может вызвать её дважды.
    const now = Date.now()
    const merge = group !== undefined && lastGroup.current.key === group && now - lastGroup.current.at < GROUP_WINDOW_MS
    lastGroup.current = { key: group ?? null, at: now }
    setState((current) => {
      const value = typeof next === 'function' ? (next as (c: T) => T)(current.present) : next
      if (Object.is(value, current.present)) return current
      return {
        past: merge ? current.past : [...current.past, current.present].slice(-MAX_STEPS),
        present: value,
        future: [],
      }
    })
  }, [])

  const undo = useCallback(() => {
    lastGroup.current = { key: null, at: 0 }
    setState((current) => current.past.length === 0 ? current : {
      past: current.past.slice(0, -1),
      present: current.past[current.past.length - 1],
      future: [current.present, ...current.future],
    })
  }, [])

  const redo = useCallback(() => {
    lastGroup.current = { key: null, at: 0 }
    setState((current) => current.future.length === 0 ? current : {
      past: [...current.past, current.present],
      present: current.future[0],
      future: current.future.slice(1),
    })
  }, [])

  /** Новый документ без истории (загрузка, импорт). */
  const reset = useCallback((value: T) => {
    lastGroup.current = { key: null, at: 0 }
    setState({ past: [], present: value, future: [] })
  }, [])

  return {
    value: state.present,
    commit,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
