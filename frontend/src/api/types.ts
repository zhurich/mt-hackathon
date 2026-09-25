// Типы ответов backend (см. Swagger: /docs).

export type Outcome = 'success' | 'partial' | 'fail'
export type Quality = 'best' | 'good' | 'poor' | 'bad' | 'timeout'
export type CompetencyStatus = 'mastered' | 'developing' | 'weak' | 'untested'

export interface User {
  id: number
  login: string
  display_name: string
  employee_code: string
  role: 'conductor' | 'trainer'
  brigade: string | null
  depot: string | null
}

export interface LevelInfo {
  index: number
  title: string
  xp: number
  level_xp: number
  next_xp: number | null
  next_title: string | null
  progress: number
}

export interface ScenarioSummary {
  id: string
  version: number
  title: string
  summary: string
  category: string
  category_title: string
  difficulty: number
  service_class: string
  service_class_title: string
  competencies: string[]
  decisions: number
  has_timer: boolean
  my_attempts: number
  my_best_outcome: Outcome | null
  active_attempt_id: number | null
}

export interface ScenarioDetail extends ScenarioSummary {
  briefing: string
  sources: string[]
  initial_loyalty: number
  initial_safety: number
  hud: Record<string, string>
}

export interface AchievementBrief {
  code: string
  title: string
  description: string
  icon: string
}

export interface Rewards {
  xp: number
  level: LevelInfo
  level_up: boolean
  new_achievements: AchievementBrief[]
  completed_challenges: { id: string; title: string; reward_xp: number }[]
}

export interface AttemptView {
  id: number
  scenario_id: string
  scenario_title: string
  status: 'active' | 'finished' | 'abandoned'
  loyalty: number
  safety: number
  step: number
  hud: { name: string; label: string; value: number }[]
  node: {
    id: string
    speaker: string
    speaker_name: string | null
    text: string
    choices: { id: string; text: string }[]
    timer: number | null
    deadline_ms: number | null
  } | null
  server_time_ms: number
  last: { delta: { loyalty: number; safety: number }; timed_out: boolean; interrupted: boolean } | null
  ending: { outcome: Outcome; title: string; text: string } | null
  rewards: Rewards | null
}

export interface RoleStep {
  code: string
  title: string
  example: string
}

export interface DebriefStep {
  index: number
  situation: string
  speaker_name: string | null
  chosen: string
  quality: Quality
  timed_out: boolean
  reaction_ms: number
  timer: number | null
  feedback: string
  delta: { loyalty: number; safety: number }
  loyalty: number
  safety: number
  competencies: string[]
  role_model: string[]
  interrupted: boolean
  better_options: { text: string; quality: Quality; feedback: string }[]
}

export interface Debrief {
  attempt_id: number
  finished_at: string
  scenario_id: string
  title: string
  ending: { outcome: Outcome; title: string; text: string }
  sources: string[]
  steps: DebriefStep[]
  role_model: { covered: RoleStep[]; missing: RoleStep[] }
  result: {
    outcome: Outcome
    xp: number
    final_loyalty: number
    final_safety: number
    decisions: number
    best_decisions: number
    timeouts: number
    avg_reaction_ms: number
    competency_points: Record<string, number>
    competency_results: Record<string, number>
    role_model_covered: string[]
  }
  rewards: Rewards | null
}

export interface Competency {
  code: string
  title: string
  description: string
  mastery: number | null
  samples: number
  status: CompetencyStatus
}

export interface Achievement extends AchievementBrief {
  earned_at: string | null
  progress: number
  target: number
}

export interface Challenge {
  id: string
  title: string
  description: string
  ends: string
  progress: number
  target: number
  reward_xp: number
  completed_at: string | null
}

export interface Profile {
  user: User
  level: LevelInfo
  total_xp: number
  active_points: number
  expiring: { points: number; expires_at: string } | null
  streak_days: number
  finished_attempts: number
  achievements: Achievement[]
  challenges: Challenge[]
  competencies: Competency[]
}

export interface LeaderboardEntry {
  rank: number
  user_id: number
  display_name: string
  brigade: string | null
  points: number
  total_xp: number
  level_title: string
  is_me: boolean
}

export interface Leaderboard {
  scope: 'brigade' | 'depot' | 'company'
  scope_name: string
  entries: LeaderboardEntry[]
  me: LeaderboardEntry | null
}

export interface Notification {
  id: number
  kind: string
  title: string
  body: string
  link: string | null
  created_at: string
  read_at: string | null
}

export interface Analytics {
  stats: {
    attempts: number
    success_rate: number
    avg_loyalty: number | null
    avg_safety: number | null
    timeout_rate: number
    avg_reaction_ms: number | null
  }
  competencies: Competency[]
  role_model: (RoleStep & { share: number })[]
  categories: { category: string; title: string; attempts: number; success_rate: number }[]
  xp_by_day: { date: string; xp: number }[]
  insights: { kind: 'warning' | 'info' | 'positive'; text: string }[]
  recommendations: { scenario_id: string; title: string; reason: string }[]
}

export interface AttemptHistoryItem {
  id: number
  scenario_id: string
  scenario_title: string
  outcome: Outcome
  xp: number
  final_loyalty: number
  final_safety: number
  finished_at: string
}

export interface TeamAnalytics {
  competency_titles: Record<string, string>
  company: Record<string, number | null>
  brigades: { id: number; name: string; depot: string | null; members: number; competencies: Record<string, number | null> }[]
  employees: {
    user_id: number
    display_name: string
    employee_code: string
    brigade: string | null
    attempts: number
    success_rate: number
    level_title: string
    active_points: number
    weakest: { code: string; title: string; mastery: number } | null
  }[]
  hardest_decisions: {
    scenario_id: string
    scenario_title: string
    node_id: string
    situation: string
    answers: number
    error_rate: number
    timeout_rate: number
  }[]
}
