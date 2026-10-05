import { contract, copy, type Supplier } from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { subOf, type CardRow } from '../../../../views/card'
import { listHandlers, listOf, showList } from '../../../../views/list'
import { pullToRefresh } from '../../../../core/live'

// 供应商卡：大字名称，小字联系人 · 电话（没开通账号的补一句）；右边待收货单数
function rowOf(s: Supplier): CardRow {
  return {
    id: s.id,
    main: s.name,
    sub: subOf([
      s.contact,
      s.phone,
      s.hasAccount ? '' : copy.screen.label.accountStatus + copy.screen.label.accountNotOpened,
    ]),
    note: s.openPoCount ? copy.screen.pendingPos(s.openPoCount) : '',
    tags: s.enabled ? [] : [{ text: copy.tag.disabled, warn: false }],
  }
}
Page({
  ...pullToRefresh,
  ...listHandlers,
  data: {
    title: copy.screen.title.suppliers,
    filter: emptyFilter,
    rows: [] as ReturnType<typeof rowOf>[],
    loaded: false,
    canCreate: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.suppliers,
    allLoaded: copy.state.allLoaded,
    dimensions: [
      {
        key: 'enabled',
        label: copy.field.status,
        options: [
          { id: 'true', name: copy.statusValue.enabled },
          { id: 'false', name: copy.statusValue.disabled },
        ],
      },
    ],
    texts: {
      create: copy.screen.title.createSupplier,
      search: copy.flow.purchase.supplierSearch,
    },
  },
  list: null as PagedList<Supplier> | null,
  onLoad() {
    this.list = listOf(
      this,
      async (cursor) => {
        const result = await request(contract.listSuppliers, {
          query: {
            cursor,
            q: this.data.filter.keyword,
            enabled: this.data.filter.picks.enabled as 'true' | 'false' | undefined,
          },
        })
        if (result.ok) this.setData({ canCreate: canDo(result.data.actions, 'create') })
        return result
      },
      rowOf,
    )
  },
  onShow() {
    showList(this, ['todo:purchase'])
  },
  onCreate() {
    void wx.navigateTo({ url: '/packages/purchase/pages/supplier/index' })
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/purchase/pages/supplier/index?id=${event.currentTarget.dataset.key}`,
    })
  },
})
