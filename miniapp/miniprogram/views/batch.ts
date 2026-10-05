// 列表批量勾选（02 章第 6 节第 19 条，2026-10-06 第 4 批）：发货单、销售订单共用。
// 「全部」和能批量的那个页签显示勾选框；只有后端说能做（canDo）的单子显示框；
// 没勾时底栏是新建，勾了换成「全选 / 批量 xx（n）」。这里只放纯函数，页面管 setData
import type { Action, ActionCode } from '@huazhong/shared'
import { canDo } from '../core/actions'

export interface Picked {
  id: string
  version: number
  no: string
}

interface Card extends Picked {
  actions: readonly Action[]
}

// 当前页签显示勾选框：全部（不传状态）或能批量的那个页签
export function showsChecks(status: string, batchStatus: string): boolean {
  return status === '' || status === batchStatus
}

// 卡片上的勾选状态：能做的才有框
export function checkOf(card: Card, code: ActionCode, selected: readonly Picked[]) {
  return {
    selectable: canDo(card.actions, code),
    selected: selected.some((row) => row.id === card.id),
  }
}

// 点一张卡的勾：不能做的不理
export function toggled(selected: readonly Picked[], card: Card, code: ActionCode): Picked[] {
  if (!canDo(card.actions, code)) return [...selected]
  return selected.some((row) => row.id === card.id)
    ? selected.filter((row) => row.id !== card.id)
    : [...selected, { id: card.id, version: card.version, no: card.no }]
}

// 全选：只选当前列出且能做的；都已选上时再点就全部取消
export function allToggled(
  selected: readonly Picked[],
  cards: readonly Card[],
  code: ActionCode,
): Picked[] {
  const eligible = cards.filter((card) => canDo(card.actions, code))
  const all =
    eligible.length > 0 && eligible.every((card) => selected.some((p) => p.id === card.id))
  return all ? [] : eligible.map(({ id, version, no }) => ({ id, version, no }))
}
