// Иконки Lucide по имени — словарь дизайн-системы.
// Импортируются только перечисленные глифы, чтобы не тянуть в бандл весь набор.

import type { CSSProperties } from 'react'
import {
  Accessibility, ArrowDown, ArrowLeft, ArrowUp, Award, Bell, BookOpen, Check, ChevronDown, ChevronRight, ChevronUp,
  CircleAlert, CircleCheck, CircleDotDashed, CirclePlay, Coffee, Copy, Crown, Download, Eye, EyeOff, FileText, Flag,
  Flame, Handshake, HeartPulse, Hourglass, House, Info, LoaderCircle, LogOut, Medal, MessageSquare, MessagesSquare,
  Minus, Pencil, Play, Plus, Quote, Radio, Redo2, RotateCcw, Settings, Shield, Smile, Snowflake, Split, Star,
  Stethoscope, Target, Timer, TrainFront, TrendingDown, TrendingUp, TriangleAlert, Trophy, Undo2, Upload, UserRound,
  Users, Workflow, X, Zap, type LucideIcon,
} from 'lucide-react'

const ICONS = {
  accessibility: Accessibility,
  'arrow-down': ArrowDown,
  'arrow-left': ArrowLeft,
  'arrow-up': ArrowUp,
  award: Award,
  bell: Bell,
  'book-open': BookOpen,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  'circle-dot-dashed': CircleDotDashed,
  'circle-play': CirclePlay,
  coffee: Coffee,
  copy: Copy,
  crown: Crown,
  download: Download,
  eye: Eye,
  'eye-off': EyeOff,
  'file-text': FileText,
  flag: Flag,
  flame: Flame,
  handshake: Handshake,
  'heart-pulse': HeartPulse,
  hourglass: Hourglass,
  house: House,
  info: Info,
  'loader-circle': LoaderCircle,
  'log-out': LogOut,
  medal: Medal,
  'message-square': MessageSquare,
  'messages-square': MessagesSquare,
  minus: Minus,
  pencil: Pencil,
  play: Play,
  plus: Plus,
  quote: Quote,
  radio: Radio,
  'redo-2': Redo2,
  'rotate-ccw': RotateCcw,
  settings: Settings,
  shield: Shield,
  smile: Smile,
  snowflake: Snowflake,
  split: Split,
  star: Star,
  stethoscope: Stethoscope,
  target: Target,
  timer: Timer,
  'train-front': TrainFront,
  'trending-down': TrendingDown,
  'trending-up': TrendingUp,
  'triangle-alert': TriangleAlert,
  trophy: Trophy,
  'undo-2': Undo2,
  upload: Upload,
  'user-round': UserRound,
  users: Users,
  workflow: Workflow,
  x: X,
  zap: Zap,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

/** Линейная иконка (stroke 2 в сетке 24px), наследует currentColor. Размеры: 16 — метки, 20 — кнопки, 24 — навигация. */
export function Icon({ name, size = 20, label, spin, className, style }: {
  name: IconName
  size?: number
  /** Подпись для скринридера; без неё иконка декоративная. */
  label?: string
  spin?: boolean
  className?: string
  style?: CSSProperties
}) {
  const Glyph = ICONS[name]
  return (
    <Glyph
      size={size}
      strokeWidth={2}
      className={['icon', spin && 'spin', className].filter(Boolean).join(' ')}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
