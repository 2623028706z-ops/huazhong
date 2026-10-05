import { contract, copy, financeCopy as f, type OutputOf } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter } from '../core/filter'
import type { PagedList } from '../core/list'
import { request } from '../core/request'
import { listHandlers, listOf, showList } from './list'
import { partyRowOf } from './statement'
type Party = OutputOf<typeof contract.listArCustomers>['items'][number]
const data = {
  supplier: false,
  title: copy.screen.title.arCustomers as string,
  statusKind: '',
  searchPlaceholder: copy.filter.search(f.customer),
  filter: emptyFilter,
  partyFilter: 'all',
  // 页签数字（2026-10-06 第 4 批）：接口 counts 回来后写进 count，0 不显示
  filterTabs: [
    { key: 'all', text: f.all },
    { key: 'outstanding', text: f.hasOutstanding },
    { key: 'overdue', text: f.hasOverdue },
    { key: 'unstatemented', text: f.hasUnstatemented },
  ] as { key: string; text: string; count?: number }[],
  rows: [] as ReturnType<typeof partyRowOf>[],
  loaded: false,
  skeleton: false,
  done: false,
  failure: null as FailureView | null,
  emptyObject: copy.screen.empty.customers as string,
  allLoaded: copy.state.allLoaded,
}
interface Host {
  data: typeof data
  list: PagedList<Party> | null
  setData(patch: Record<string, unknown>): void
}
export const financePartiesPage = {
  ...listHandlers,
  data,
  list: null as PagedList<Party> | null,
  onLoad(this: Host, query: Record<string, string | undefined>) {
    if (query.filter) this.setData({ partyFilter: query.filter })
    this.list = listOf(
      this,
      async (cursor) => {
        const result = await request(
          this.data.supplier ? contract.listFinanceSuppliers : contract.listArCustomers,
          {
            query: {
              q: this.data.filter.keyword || undefined,
              filter:
                this.data.partyFilter === 'all'
                  ? undefined
                  : (this.data.partyFilter as 'outstanding' | 'overdue' | 'unstatemented'),
              cursor,
            },
          },
        )
        if (result.ok) {
          const counts: Record<string, number> = result.data.counts
          this.setData({
            filterTabs: this.data.filterTabs.map((tab) => ({
              ...tab,
              count: counts[tab.key] ?? 0,
            })),
          })
        }
        return result
      },
      partyRowOf,
    )
  },
  onShow(this: Host) {
    showList(this, [this.data.supplier ? 'ap:*' : 'ar:*'])
  },
  onPartyFilter(this: Host, event: DetailEvent<string>) {
    this.setData({ partyFilter: event.detail })
    void this.list?.refresh()
  },
  onOpen(this: Host, event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/finance/pages/${this.data.supplier ? 'supplier' : 'customer'}/index?id=${event.currentTarget.dataset.key}`,
    })
  },
}
