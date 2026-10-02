import { contract, copy, formatMoney, type OutputOf } from '@huazhong/shared'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { listHandlers, listOf, showList } from '../../../../views/list'
type Supplier = OutputOf<typeof contract.listFinanceSuppliers>['items'][number]
function rowOf(s: Supplier) {
  return {
    id: s.supplierId,
    title: s.supplierName,
    total: `${copy.screen.label.due} ${formatMoney(s.unpaidCents)}`,
    meta: `${copy.screen.label.payable} ${formatMoney(s.payableCents)}${copy.separator}${copy.screen.label.paid} ${formatMoney(s.paidCents)}`,
    amount: null,
    tags: s.enabled ? [] : [{ text: copy.tag.disabled, warn: false }],
  }
}
Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.apSuppliers,
    filter: emptyFilter,
    rows: [] as ReturnType<typeof rowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.suppliers,
    allLoaded: copy.state.allLoaded,
    search: copy.filter.search(copy.screen.label.supplier),
  },
  list: null as PagedList<Supplier> | null,
  onLoad() {
    this.list = listOf(
      this,
      (cursor) =>
        request(contract.listFinanceSuppliers, { query: { q: this.data.filter.keyword, cursor } }),
      rowOf,
    )
  },
  onShow() {
    showList(this, ['ap:*'])
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/finance/pages/supplier/index?id=${event.currentTarget.dataset.key}`,
    })
  },
})
