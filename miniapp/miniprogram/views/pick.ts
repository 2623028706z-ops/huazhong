// 多选弹层（views/pick.wxml 的多选模式）：勾选多项、一次确认加入。只做数据换算，各页面自己加行。
// 页面 data 里放 pickIds（已勾 id）、picks（可选行）、pickCount（已勾数量）、pickConfirm（按钮字）；点一行发 onPick 调 pickPatch，
// 底部「添加（n）」发 onPickConfirm 取 pickIds
import { redesignCopy } from '@huazhong/shared'

export interface PickRow {
  id: string
  name: string
  sub?: string
  checked?: boolean
}

export function toggled(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

// 按已勾 id 重算每行的 checked；只保留还在可选行里的 id，顺序是勾选的先后
export function pickPatch<T extends PickRow>(rows: readonly T[], ids: readonly string[]) {
  const valid = ids.filter((id) => rows.some((row) => row.id === id))
  return {
    pickIds: valid,
    pickCount: valid.length,
    pickConfirm: redesignCopy.addPicked(valid.length),
    picks: rows.map((row) => ({ ...row, checked: valid.includes(row.id) })),
  }
}

// 打开弹层：全部未勾
export const pickOpen = <T extends PickRow>(rows: readonly T[]) => pickPatch(rows, [])
