// S7 售后（06 章 S7）：筛选状态、提交日期；三行卡片（待处理金额写「待确认」）。
// 底栏「申请售后」（applyAfter）：弹层只列能申请的订单 → S8。点卡片弹出售后详情（只读）
import {
  afterStatuses,
  contract,
  copy,
  type AfterCard,
  type AfterDetail,
  type AfterStatus,
  type OrderCard,
} from '@huazhong/shared'
import { canDo, hasAction } from '../../../../core/actions'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { afterInfoOf, afterLinesOf, afterReasonsOf, afterRowOf } from '../../../../views/after'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { lineTitleOf, shipDateText } from '../../../../views/order'

function detailOf(after: AfterDetail) {
  return {
    info: {
      title: after.no,
      statusKind: 'afterStatus',
      status: after.status,
      rows: afterInfoOf(after),
    },
    linesHeading: copy.screen.section.afterLines,
    lines: afterLinesOf(after),
    reason: afterReasonsOf(after),
  }
}

function pickRowOf(order: OrderCard) {
  return {
    id: order.id,
    name: [order.no, lineTitleOf(order.lineName, order.lineCount)].join(copy.separator),
    sub: shipDateText(order.shipDate),
  }
}

Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.storeAfters,
    statusKind: 'afterStatus',
    statuses: [...afterStatuses],
    counts: {},
    dateLabel: copy.screen.label.afterDate,
    filter: emptyFilter,
    rows: [] as ReturnType<typeof afterRowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.afters,
    allLoaded: copy.state.allLoaded,
    canApply: false,
    pickSheet: false,
    picks: [] as ReturnType<typeof pickRowOf>[],
    pickError: '',
    pickEmpty: copy.state.empty(copy.screen.empty.afterable),
    detailSheet: false,
    detail: null as ReturnType<typeof detailOf> | null,
    detailError: '',
    texts: {
      apply: copy.screen.action.applyAfter,
      pickTitle: copy.screen.title.pickOrder,
      detailTitle: copy.screen.title.afterDetail,
    },
  },
  list: null as PagedList<AfterCard> | null,
  openId: '',
  onLoad(query: Record<string, string | undefined>) {
    // 提交售后后回到这里，打开这张售后的详情
    this.openId = query.open ?? ''
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, from, to } = listQueryOf<AfterStatus>(this.data.filter)
        const result = await request(contract.listAfters, { query: { status, from, to, cursor } })
        if (result.ok) {
          this.setData({
            counts: result.data.counts,
            canApply: hasAction(result.data.actions, 'applyAfter'),
          })
        }
        return result
      },
      (after: AfterCard) => afterRowOf(after, true),
    )
  },
  onShow() {
    showList(this, ['afters'])
    if (this.openId) {
      void this.openDetail(this.openId)
      this.openId = ''
    }
  },
  async onApply(): Promise<void> {
    this.setData({ pickSheet: true, picks: [], pickError: '' })
    const result = await request(contract.listOrders, { query: { afterable: 'true' } })
    if (!result.ok) {
      this.setData({ pickError: failureOf(result.failure, 'refresh')?.message ?? '' })
      return
    }
    // 过了申请期限的（applyAfter 为 enabled: false）不列
    const orders = result.data.items.filter((order) => canDo(order.actions, 'applyAfter'))
    this.setData({ picks: orders.map(pickRowOf) })
  },
  onClosePick() {
    this.setData({ pickSheet: false })
  },
  onPick(event: KeyEvent) {
    this.setData({ pickSheet: false })
    void wx.navigateTo({
      url: `/packages/store/pages/after-form/index?orderId=${event.currentTarget.dataset.key}`,
    })
  },
  onOpen(event: KeyEvent) {
    void this.openDetail(event.currentTarget.dataset.key)
  },
  async openDetail(id: string): Promise<void> {
    this.setData({ detailSheet: true, detail: null, detailError: '' })
    const result = await request(contract.getAfter, { params: { id } })
    if (result.ok) this.setData({ detail: detailOf(result.data) })
    else this.setData({ detailError: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  onCloseDetail() {
    this.setData({ detailSheet: false })
  },
})
