// 采购单到货差异提示条（06 章 C4，2026-10-06 第 3 批）：仓库收货少收、多收、改价、退货、整单拒收、
// 作废已收货的单，采购员打开详情时顶部黄条写清差在哪；「知道了」看 actions 有没有 ackDiff
import { copy, formatMoney, formatTime, noticeCopy, type PoDiff } from '@huazhong/shared'
import { subOf } from './card'

export interface PoDiffView {
  title: string
  lines: string[]
  meta: string
}

// 一种花材一行：「尤加利 实收 110 枝（下单 120）· 单价 ¥8.00 → ¥7.50 · 退货 5 枝」
function lineTextOf(line: PoDiff['lines'][number]): string {
  const { purchase } = copy.flow
  return [
    line.name,
    subOf([
      line.short || line.over ? purchase.diffReceived(line.receivedQty, line.unit, line.qty) : '',
      line.repriced
        ? purchase.diffPrice(formatMoney(line.orderPriceCents), formatMoney(line.priceCents))
        : '',
      line.returnedQty ? purchase.diffReturned(line.returnedQty, line.unit) : '',
    ]),
  ].join(' ')
}

// 整单拒收：头一行「整单拒收：原因」，不再逐行列「实收 0」。
// 点过「知道了」（unseen 为 false）整条收起，有新差异再出现（06 章 C4）
export function poDiffViewOf(diff: PoDiff | null): PoDiffView | null {
  if (!diff?.unseen) return null
  const { purchase } = copy.flow
  const lines = diff.rejectedAll
    ? [
        diff.rejectReason
          ? purchase.diffReason(noticeCopy.poRejectedAll, diff.rejectReason)
          : noticeCopy.poRejectedAll,
      ]
    : diff.lines.map(lineTextOf)
  if (diff.voided) lines.push(purchase.diffVoided)
  return {
    title: diff.notice || noticeCopy.poDiffNotice,
    lines,
    meta: diff.receivedBy
      ? subOf([
          `${copy.screen.label.receivedBy} ${diff.receivedBy}`,
          diff.receivedAt ? formatTime(diff.receivedAt) : '',
        ])
      : '',
  }
}
