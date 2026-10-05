import type { PoDiff } from '@huazhong/shared'
import { noticeCopy } from '@huazhong/shared'
import { describe, expect, it } from 'vitest'
import { poDiffViewOf } from '../miniprogram/views/po-diff'

type Line = PoDiff['lines'][number]

function lineOf(patch: Partial<Line> = {}): Line {
  return {
    poLineId: '1',
    name: '尤加利',
    unit: '枝',
    qty: 120,
    receivedQty: 120,
    short: false,
    over: false,
    orderPriceCents: 800,
    priceCents: 800,
    repriced: false,
    returnedQty: 0,
    ...patch,
  }
}

function diffOf(patch: Partial<PoDiff> = {}): PoDiff {
  return {
    notice: '',
    lines: [],
    rejectedAll: false,
    rejectReason: null,
    voided: false,
    receivedBy: null,
    receivedAt: null,
    at: '2026-10-06T02:00:00.000Z',
    byName: '王仓',
    unseen: true,
    seenAt: null,
    ...patch,
  }
}

describe('采购单到货差异提示条', () => {
  it('没有差异、点过知道了都不显示', () => {
    expect(poDiffViewOf(null)).toBeNull()
    expect(poDiffViewOf(diffOf({ unseen: false, seenAt: '2026-10-06T03:00:00.000Z' }))).toBeNull()
  })

  it('每种花材一行：少收、改价、退货连起来，没差的项不写', () => {
    const view = poDiffViewOf(
      diffOf({
        lines: [
          lineOf({
            receivedQty: 110,
            short: true,
            repriced: true,
            priceCents: 750,
            returnedQty: 5,
          }),
          lineOf({ name: '玫瑰', repriced: true, priceCents: 900 }),
        ],
      }),
    )
    expect(view?.title).toBe(noticeCopy.poDiffNotice)
    expect(view?.lines).toEqual([
      '尤加利 实收 110 枝（下单 120） · 单价 ¥8.00 → ¥7.50 · 退货 5 枝',
      '玫瑰 单价 ¥8.00 → ¥9.00',
    ])
    expect(view?.meta).toBe('')
  })

  it('整单拒收头一行写原因，不逐行列实收 0；作废另起一句；带收货人和时间', () => {
    const view = poDiffViewOf(
      diffOf({
        rejectedAll: true,
        rejectReason: '花头发黑',
        voided: true,
        receivedBy: '王仓',
        receivedAt: '2026-10-06T02:00:00.000Z',
      }),
    )
    expect(view?.lines).toEqual([`${noticeCopy.poRejectedAll}：花头发黑`, '收货后被仓库作废'])
    expect(view?.meta.startsWith('收货人 王仓 · ')).toBe(true)
  })

  it('整单拒收没填原因只写「整单拒收」', () => {
    expect(poDiffViewOf(diffOf({ rejectedAll: true }))?.lines).toEqual([noticeCopy.poRejectedAll])
  })
})
