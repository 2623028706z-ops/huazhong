// 添加明细弹层（views/pick.wxml，02 章 hz-pick-sheet）：顶部搜索，每行「+」点一下选上、数量 1，
// 选上后变「− n +」，减到 0 取消；底部「已选 n 种」（选产品时带已选金额）+「添加（n）」。只做数据换算，各页面自己加行。
// 页面 data 放 pickRows（全部可选行）、pickQty（已选数量）、pickIds（选的先后）、pickKeyword，
// 以及换算出的 picks、pickCount、pickConfirm、pickSummary；三个事件用 pickHandlers 混进页面，确认时用 pickChosen 取数量
import { copy, entryCopy, formatMoney, formatQty, redesignCopy } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../core/events'

export interface PickRow {
  id: string
  name: string
  sub?: string
  // 分组标题（产品按订货分类）；同组的行要排在一起
  group?: string
  // 除名称外可搜的字（编码）
  code?: string
  // 单价（分）：选产品时底部合计已选金额
  unitCents?: number
  // 数量上限（售后不能超过可申请数量）
  max?: number
}

export interface PickState {
  pickRows: PickRow[]
  pickQty: Record<string, number>
  pickIds: string[]
  pickKeyword: string
}

type PickView = PickRow & { qty: number; head: string }

// 多选勾一下 / 再点取消（从其他客户复制产品的勾选也用）
export function toggled(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

const matches = (row: PickRow, keyword: string) =>
  !keyword || row.name.includes(keyword) || (row.code ?? '').includes(keyword)

function pickView(state: PickState) {
  const keyword = state.pickKeyword.trim()
  const shown = state.pickRows.filter((row) => matches(row, keyword))
  const picks: PickView[] = shown.map((row, index) => ({
    ...row,
    qty: state.pickQty[row.id] ?? 0,
    head: row.group && row.group !== shown[index - 1]?.group ? row.group : '',
  }))
  const count = state.pickIds.length
  const priced = state.pickRows.some((row) => row.unitCents !== undefined)
  const total = state.pickIds.reduce((sum, id) => {
    const row = state.pickRows.find((item) => item.id === id)
    return sum + (row?.unitCents ?? 0) * (state.pickQty[id] ?? 0)
  }, 0)
  return {
    ...state,
    picks,
    pickCount: count,
    pickConfirm: redesignCopy.addPicked(count),
    pickSummary:
      priced && count ? entryCopy.pickedAmount(count, formatMoney(total)) : entryCopy.picked(count),
  }
}

// 打开弹层：全部未选、搜索清空
export const pickOpen = (rows: readonly PickRow[]) =>
  pickView({ pickRows: [...rows], pickQty: {}, pickIds: [], pickKeyword: '' })

// 改一行的数量：0 取消选择，超过上限按上限；新选的排到最后
export function pickSet(state: PickState, id: string, input: number) {
  const max = state.pickRows.find((row) => row.id === id)?.max ?? Number.MAX_SAFE_INTEGER
  const qty = Math.min(Math.floor(input) || 0, max)
  const rest = state.pickIds.filter((item) => item !== id)
  const pickQty = Object.fromEntries(Object.entries(state.pickQty).filter(([key]) => key !== id))
  if (qty > 0) pickQty[id] = qty
  const pickIds = qty > 0 ? (state.pickIds.includes(id) ? state.pickIds : [...rest, id]) : rest
  return pickView({ ...state, pickQty, pickIds })
}

export const pickSearch = (state: PickState, keyword: string) =>
  pickView({ ...state, pickKeyword: keyword })

// 确认时按选的先后取 id 和数量
export const pickChosen = (state: PickState) =>
  state.pickIds.map((id) => ({ id, qty: state.pickQty[id] ?? 1 }))

export const pickData = () => pickOpen([])

// 花材行：出库、报损写「库存 n 单位」，其余只写单位；可按名称、编码搜
export function materialPickOf(
  material: { id: string; name: string; unit: string; code?: string; stockQty?: number },
  withStock = false,
): PickRow {
  return {
    id: material.id,
    name: material.name,
    sub:
      withStock && material.stockQty !== undefined
        ? copy.stock.available(formatQty(material.stockQty, material.unit))
        : `${redesignCopy.unit} ${material.unit}`,
    code: material.code ?? '',
  }
}

interface PickHost {
  data: PickState
  setData(patch: Partial<PickState> & WechatMiniprogram.IAnyObject): void
}

export const pickHandlers = {
  onPickPlus(this: PickHost, event: KeyEvent) {
    this.setData(pickSet(this.data, event.currentTarget.dataset.key, 1))
  },
  onPickQty(this: PickHost, event: DetailEvent<number, { key: string }>) {
    this.setData(pickSet(this.data, event.currentTarget.dataset.key, event.detail))
  },
  onPickSearch(this: PickHost, event: DetailEvent<string>) {
    this.setData(pickSearch(this.data, event.detail))
  },
}
