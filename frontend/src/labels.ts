// Подписи и значки для кодов, приходящих с backend.

import type { CompetencyStatus, Outcome, Quality } from './api/types'

export const OUTCOME: Record<Outcome, { title: string; icon: string; tone: string }> = {
  success: { title: 'Успех', icon: '✓', tone: 'good' },
  partial: { title: 'Частично', icon: '◐', tone: 'warning' },
  fail: { title: 'Провал', icon: '✕', tone: 'critical' },
}

export const QUALITY: Record<Quality, { title: string; icon: string; tone: string }> = {
  best: { title: 'Лучшее решение', icon: '★', tone: 'good' },
  good: { title: 'Хорошее решение', icon: '✓', tone: 'good' },
  poor: { title: 'Слабое решение', icon: '!', tone: 'warning' },
  bad: { title: 'Ошибка', icon: '✕', tone: 'critical' },
  timeout: { title: 'Время вышло', icon: '⏱', tone: 'critical' },
}

export const COMPETENCY_STATUS: Record<CompetencyStatus, { title: string; icon: string; tone: string }> = {
  mastered: { title: 'Освоена', icon: '✓', tone: 'good' },
  developing: { title: 'Развивается', icon: '↗', tone: 'neutral' },
  weak: { title: 'Проседает', icon: '!', tone: 'critical' },
  untested: { title: 'Нет данных', icon: '—', tone: 'neutral' },
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

export const CATEGORY_ICON: Record<string, string> = {
  medical: '🩺',
  conflict: '🗣️',
  safety: '🛡️',
  service: '☕',
  accessibility: '♿',
}

export const ACHIEVEMENT_ICON: Record<string, string> = {
  train: '🚄',
  medal: '🎖️',
  star: '⭐',
  chat: '💬',
  snowflake: '❄️',
  'heart-pulse': '🩺',
  handshake: '🤝',
  shield: '🛡️',
  smile: '😊',
  accessibility: '♿',
  quote: '🗨️',
  flame: '🔥',
  crown: '👑',
  trophy: '🏆',
}

export const NOTIFICATION_ICON: Record<string, string> = {
  new_scenario: '🆕',
  new_challenge: '🎯',
  challenge_completed: '🏁',
  achievement: '🏅',
  level_up: '⬆️',
  points_expiring: '⏳',
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function percent(share: number): string {
  return `${Math.round(share * 100)} %`
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}
