/**
 * iFolo 任务状态
 *
 * 两级结构：6 个内置状态，归入 5 个分组。
 * 分组决定排序，以及哪些行算作「未完成」。
 *
 * Markdown 映射（保持与标准 Markdown 兼容）：
 *   - [ ]             → todo       （标准语法）
 *   - [x]             → done       （标准语法）
 *   - [backlog]       → backlog
 *   - [inProgress]    → inProgress
 *   - [inReview]      → inReview
 *   - [cancelled]     → cancelled
 *
 * 这样即使别的编辑器不认识 iFolo 的扩展状态，也能把它当普通列表项读出来。
 */

export type TaskGroupKey = 'backlog' | 'planned' | 'started' | 'completed' | 'cancelled'

export interface TaskGroup {
  key: TaskGroupKey
  label: string
}

export interface TaskStatus {
  key: string
  label: string
  group: TaskGroupKey
  /** 是否算作「已完成」，用于折叠与统计 */
  isComplete: boolean
  /** Markdown 里方括号内的记号 */
  marker: string
}

export const TASK_GROUPS: TaskGroup[] = [
  { key: 'backlog', label: '待办池' },
  { key: 'planned', label: '已计划' },
  { key: 'started', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]

export const TASK_STATUSES: TaskStatus[] = [
  { key: 'backlog', label: '待办池', group: 'backlog', isComplete: false, marker: 'backlog' },
  { key: 'todo', label: '待办', group: 'planned', isComplete: false, marker: ' ' },
  { key: 'inProgress', label: '进行中', group: 'started', isComplete: false, marker: 'inProgress' },
  { key: 'inReview', label: '审核中', group: 'started', isComplete: false, marker: 'inReview' },
  { key: 'done', label: '已完成', group: 'completed', isComplete: true, marker: 'x' },
  { key: 'cancelled', label: '已取消', group: 'cancelled', isComplete: true, marker: 'cancelled' },
]

export const DEFAULT_STATUS = 'todo'

const BY_KEY = new Map(TASK_STATUSES.map((s) => [s.key, s]))
const BY_MARKER = new Map(TASK_STATUSES.map((s) => [s.marker.toLowerCase(), s]))

export function statusByKey(key: string): TaskStatus {
  return BY_KEY.get(key) ?? BY_KEY.get(DEFAULT_STATUS)!
}

export function statusByMarker(marker: string): TaskStatus {
  const raw = marker.trim().toLowerCase()
  // 标准 Markdown 的 [x] / [X] 都算完成
  if (raw === 'x') return BY_KEY.get('done')!
  if (raw === '' || raw === ' ') return BY_KEY.get('todo')!
  const normalized = raw.replace(/[-_]/g, '')
  for (const [m, s] of BY_MARKER.entries()) {
    if (m.replace(/[-_]/g, '') === normalized) return s
  }
  return BY_MARKER.get(raw) ?? BY_KEY.get(DEFAULT_STATUS)!
}

export function groupOf(key: string): TaskGroup {
  const status = statusByKey(key)
  return TASK_GROUPS.find((g) => g.key === status.group)!
}

/** 循环推进到下一个状态（点击状态胶囊时用） */
export function nextStatus(key: string): string {
  const idx = TASK_STATUSES.findIndex((s) => s.key === key)
  if (idx < 0) return DEFAULT_STATUS
  return TASK_STATUSES[(idx + 1) % TASK_STATUSES.length].key
}
