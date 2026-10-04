// X5 客户售后（06 章 X5）：筛选状态、客户、提交日期；三行卡片（没有金额写「—」）。
// 底栏「新建售后」（createAfter）：弹层只列能新建售后的订单 → X7；点卡片 → X6
import { contract, copy, labels, type AfterCard, type AfterStatus } from '@huazhong/shared'
import { hasAction } from '../../../../core/actions'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { afterRowOf } from '../../../../views/after'
import { loadCustomers } from '../../../../views/customers'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'

const CUSTOMER = 'customer'
const PAGES = '/packages/sales/pages'

Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.salesAfters,
    statusKind: 'afterStatus',
    statuses: ['pending', 'processed'],
    searchPlaceholder: copy.screen.label.searchOrders,
    counts: {},
    dateLabel: copy.screen.label.afterDate,
    dimensions: [] as FilterDimension[],
    filter: emptyFilter,
    rows: [] as ReturnType<typeof afterRowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.afters,
    allLoaded: copy.state.allLoaded,
    canCreate: false,
    texts: {
      create: copy.screen.action.createAfter,
      pickTitle: copy.screen.title.pickOrder,
      noPick: copy.state.empty(copy.screen.empty.afterable),
    },
  },
  list: null as PagedList<AfterCard> | null,
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ filter: { ...emptyFilter, status: query.status ?? '' } })
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, from, to, q, picks } = listQueryOf<AfterStatus>(this.data.filter)
        const customerId = picks[CUSTOMER]
        const input = {
          query: {
            status: (picks.status || status) as AfterStatus | undefined,
            from,
            to,
            q,
            customerId,
            cursor,
          },
        }
        const result = await request(contract.listAfters, input)
        if (result.ok) {
          this.setData({
            counts: result.data.counts,
            canCreate: hasAction(result.data.actions, 'createAfter'),
          })
        }
        return result
      },
      (after: AfterCard) => afterRowOf(after, false),
    )
    void this.loadDimensions()
  },
  onShow() {
    showList(this, ['afters'])
  },
  async loadDimensions(): Promise<void> {
    const result = await loadCustomers()
    if (!result.ok) return
    const options = result.data.map(({ id, name }) => ({ id, name }))
    this.setData({
      dimensions: [
        { key: CUSTOMER, label: copy.screen.label.customer, options },
        {
          key: 'status',
          label: copy.field.status,
          options: [
            { id: 'closed', name: labels.afterStatus.closed },
            { id: 'voided', name: labels.afterStatus.voided },
          ],
        },
      ],
    })
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({ url: `${PAGES}/after-detail/index?id=${event.currentTarget.dataset.key}` })
  },
  onCreate() {
    void wx.navigateTo({ url: `${PAGES}/order-pick/index` })
  },
})
