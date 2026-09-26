// Подписи и значки для кодов, приходящих с backend.

import type { CompetencyStatus, LevelInfo, Outcome, Quality } from './api/types'
import type { IconName } from './components/Icon'

/** Тон метки статуса (Chip). Статус всегда кодируется иконкой и текстом, а не только цветом. */
export type Tone = 'neutral' | 'accent' | 'info' | 'good' | 'warning' | 'critical'

interface Status {
  title: string
  icon: IconName
  tone: Tone
}

export const OUTCOME: Record<Outcome, Status> = {
  success: { title: 'Успех', icon: 'check', tone: 'good' },
  partial: { title: 'Частично', icon: 'circle-dot-dashed', tone: 'warning' },
  fail: { title: 'Провал', icon: 'x', tone: 'critical' },
}

export const QUALITY: Record<Quality, Status> = {
  best: { title: 'Лучшее решение', icon: 'star', tone: 'good' },
  good: { title: 'Хорошее решение', icon: 'check', tone: 'good' },
  poor: { title: 'Слабое решение', icon: 'circle-alert', tone: 'warning' },
  bad: { title: 'Ошибка', icon: 'x', tone: 'critical' },
  timeout: { title: 'Время вышло', icon: 'timer', tone: 'critical' },
}

export const COMPETENCY_STATUS: Record<CompetencyStatus, Status> = {
  mastered: { title: 'Освоена', icon: 'check', tone: 'good' },
  developing: { title: 'Развивается', icon: 'trending-up', tone: 'neutral' },
  weak: { title: 'Проседает', icon: 'circle-alert', tone: 'critical' },
  untested: { title: 'Нет данных', icon: 'minus', tone: 'neutral' },
}

export const SPEAKER: Record<string, string> = {
  narrator: 'Ситуация',
  passenger: 'Пассажир',
  chief: 'Начальник поезда',
  colleague: 'Коллега',
  child: 'Ребёнок',
  radio: 'Рация',
  system: 'Система',
}

export const SPEAKER_ICON: Record<string, IconName> = {
  narrator: 'file-text',
  radio: 'radio',
  system: 'info',
}

export const CATEGORY_ICON: Record<string, IconName> = {
  medical: 'stethoscope',
  conflict: 'messages-square',
  safety: 'shield',
  service: 'coffee',
  accessibility: 'accessibility',
}

/** Коды иконок достижений из backend/content/achievements.yaml. */
export const ACHIEVEMENT_ICON: Record<string, IconName> = {
  train: 'train-front',
  medal: 'medal',
  star: 'star',
  chat: 'messages-square',
  snowflake: 'snowflake',
  'heart-pulse': 'heart-pulse',
  handshake: 'handshake',
  shield: 'shield',
  smile: 'smile',
  accessibility: 'accessibility',
  quote: 'quote',
  flame: 'flame',
  crown: 'crown',
  trophy: 'trophy',
}

export const NOTIFICATION_ICON: Record<string, IconName> = {
  new_scenario: 'train-front',
  new_challenge: 'target',
  challenge_completed: 'flag',
  achievement: 'award',
  level_up: 'trending-up',
  points_expiring: 'hourglass',
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function percent(share: number): string {
  return `${Math.round(share * 100)} %`
}

/** Склонение: «1 очко опыта», «3 очка опыта», «10 очков опыта». */
export function experience(amount: number): string {
  const tail = Math.abs(amount) % 100
  const last = tail % 10
  const word = tail >= 11 && tail <= 14 ? 'очков' : last === 1 ? 'очко' : last >= 2 && last <= 4 ? 'очка' : 'очков'
  return `${amount} ${word} опыта`
}

/**
 * Подпись к шкале уровня. Шкала (level.progress) показывает путь внутри текущего уровня,
 * поэтому и счёт ведётся от порога текущего уровня: «150 / 250 очков опыта», а не «300 / 400».
 */
export function levelProgress(level: LevelInfo): string {
  if (level.next_xp === null) return `${experience(level.xp)} · максимум`
  return `${level.xp - level.level_xp} / ${experience(level.next_xp - level.level_xp)}`
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}
