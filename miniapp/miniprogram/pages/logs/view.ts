// 操作日志的显示（06 章 M6）：列表按上海日期分组；详情先写是哪一条，改动只列前后不一样的字段
import {
  copy,
  formatTime,
  formatDayHeader,
  labels,
  shanghaiDayOf,
  type LogDetail,
  type LogItem,
} from '@huazhong/shared'

type View = LogDetail['before']

function moduleLabelOf(item: LogItem): string {
  return item.module === null ? copy.log.publicModule : labels.module[item.module]
}

interface LogGroup {
  day: string
  header: string
  rows: {
    id: string
    title: string
    total: string
    meta: string
    fields: { label: string; value: string; wide?: boolean }[]
  }[]
}

// 接口按时间倒序给，同一天的挨在一起
export function groupsOf(items: LogItem[], today: string): LogGroup[] {
  const groups: LogGroup[] = []
  for (const item of items) {
    const day = shanghaiDayOf(item.createdAt)
    const row = {
      id: item.id,
      fields: [
        { label: copy.object.module, value: moduleLabelOf(item) },
        { label: copy.records.actor, value: item.actorLabel },
        { label: copy.log.date, value: formatTime(item.createdAt) },
      ],
      title: [item.action, item.targetLabel].join(copy.separator),
      total: moduleLabelOf(item),
      meta: [
        `${copy.log.date} ${formatTime(item.createdAt)}`,
        `${copy.records.actor} ${item.actorLabel}`,
      ].join(copy.separator),
    }
    const last = groups[groups.length - 1]
    if (last?.day === day) last.rows.push(row)
    else groups.push({ day, header: formatDayHeader(day, today), rows: [row] })
  }
  return groups
}

interface DetailRow {
  label: string
  // 改动的旧值加箭头，只列一边时为空
  from: string
  value: string
}

function allRows(view: Record<string, string>): DetailRow[] {
  return Object.entries(view).map(([label, value]) => ({ label, from: '', value }))
}

function changedRows(before: Record<string, string>, after: Record<string, string>): DetailRow[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  return keys
    .filter((key) => before[key] !== after[key])
    .map((key) => ({
      label: key,
      from: (before[key] ?? '') + copy.log.arrow,
      value: after[key] ?? '',
    }))
}

function sectionsOf(before: View, after: View): { title: string; rows: DetailRow[] }[] {
  if (before && after) {
    const rows = changedRows(before, after)
    return rows.length > 0 ? [{ title: copy.log.changes, rows }] : []
  }
  if (after) return [{ title: copy.log.after, rows: allRows(after) }]
  if (before) return [{ title: copy.log.before, rows: allRows(before) }]
  return []
}

// 详情弹层：操作 · 对象 → 时间 · 操作人 · 模块 → 原因 → 改动
export function detailOf(detail: LogDetail) {
  return {
    title: [detail.action, detail.targetLabel].join(copy.separator),
    meta: [
      `${copy.log.date} ${formatTime(detail.createdAt)}`,
      `${copy.records.actor} ${detail.actorLabel}`,
      `${copy.object.module} ${moduleLabelOf(detail)}`,
    ].join(copy.separator),
    reason: detail.reason,
    sections: sectionsOf(detail.before, detail.after),
  }
}
