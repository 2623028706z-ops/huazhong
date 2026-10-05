import { contract, copy, type Supplier } from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { listHandlers, listOf, showList } from '../../../../views/list'
import { pullToRefresh } from '../../../../core/live'

function rowOf(s: Supplier) {
  return {
    id: s.id,
    fields: [
      { label: copy.field.contact, value: s.contact },
      {
        label: copy.screen.label.accountStatus,
        value: s.hasAccount ? copy.screen.label.accountOpened : copy.screen.label.accountNotOpened,
        // 没开通退成次要灰字，和「已开通」一眼分开（2026-10-05）
        minor: !s.hasAccount,
      },
      { label: copy.screen.label.contactPhone, value: s.phone, phone: s.phone, wide: true },
    ],
    headText: s.openPoCount ? copy.screen.pendingPos(s.openPoCount) : '',
    title: s.name,
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
      search: copy.filter.search(copy.screen.title.suppliers),
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
