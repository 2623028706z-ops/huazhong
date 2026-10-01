// F2 客户对账（06 章 F2）：客户卡片：客户名 + 未收；发货金额 · 已收；预收大于 0 时写「预收 ¥…」。点开 → F3
import { contract, copy, formatMoney, type ArCustomer } from '@huazhong/shared'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'

function rowOf(customer: ArCustomer) {
  const tags = customer.enabled ? [] : [{ text: copy.tag.disabled, warn: false }]
  const summary = [
    copy.screen.shippedSum(formatMoney(customer.shippedCents)),
    copy.screen.receivedSum(formatMoney(customer.receivedCents)),
  ].join(copy.separator)
  const prepaid =
    customer.prepaidCents > 0 ? copy.screen.prepaid(formatMoney(customer.prepaidCents)) : ''
  return {
    id: customer.customerId,
    date: '',
    status: '',
    title: customer.customerName,
    total: copy.screen.arUnpaid(formatMoney(customer.unpaidCents)),
    meta: [summary, prepaid].filter(Boolean).join(copy.separator),
    amount: null,
    amountText: '',
    tags,
  }
}

Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.arCustomers,
    statusKind: '',
    searchPlaceholder: copy.filter.search(copy.screen.label.customer),
    filter: emptyFilter,
    rows: [] as ReturnType<typeof rowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.customers,
    allLoaded: copy.state.allLoaded,
  },
  list: null as PagedList<ArCustomer> | null,
  onLoad() {
    this.list = listOf(
      this,
      (cursor) => {
        const { q } = listQueryOf(this.data.filter)
        return request(contract.listArCustomers, { query: { q, cursor } })
      },
      rowOf,
    )
  },
  onShow() {
    showList(this, ['ar:*'])
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/finance/pages/customer/index?id=${event.currentTarget.dataset.key}`,
    })
  },
})
