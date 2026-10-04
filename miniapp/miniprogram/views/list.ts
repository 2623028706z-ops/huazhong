// 列表页的公共部分（06 章各列表）：分页交给 PagedList，卡片行由各页的 rowOf 换好；
// 筛选栏的值换成列表接口的条件（日期按上海今天算）
import { shanghaiDateOf, type Topic } from '@huazhong/shared'
import type { DetailEvent } from '../core/events'
import { queryOf, type FilterValue } from '../core/filter'
import { PagedList } from '../core/list'
import { pullToRefresh, unwatchOnLeave, watch } from '../core/live'
import type { Fetch } from '../core/pager'

interface Host {
  setData(patch: Record<string, unknown>): void
}

export function listOf<T>(host: Host, fetch: Fetch<T>, rowOf: (item: T) => unknown): PagedList<T> {
  return new PagedList(
    fetch,
    (view) => {
      const { items, ...rest } = view
      host.setData({ ...rest, rows: items.map(rowOf) })
    },
    (patch) => {
      host.setData(patch)
    },
  )
}

export interface ListQuery<S extends string> {
  status: S | undefined
  q: string | undefined
  from: string | undefined
  to: string | undefined
  picks: Record<string, string>
}

// 状态码由筛选栏的 statuses 限定，这里只换类型
export function listQueryOf<S extends string>(filter: FilterValue): ListQuery<S> {
  const query = queryOf(filter, shanghaiDateOf(Date.now()))
  return {
    status: (query.status ?? undefined) as S | undefined,
    q: query.keyword ?? undefined,
    from: query.dateFrom ?? undefined,
    to: query.dateTo ?? undefined,
    picks: query.picks,
  }
}

interface ListPage extends Host {
  list: { refresh(): Promise<void>; more(): Promise<void> } | null
}

// 列表页 onShow：从第一页查并订阅，推送来了静默刷新（02 章第 5.1 节）
export function showList(page: ListPage, topics: Topic[]): void {
  void page.list?.refresh()
  watch(page, topics, () => void page.list?.refresh())
}

// 列表页共用的事件：Page({ ...listHandlers, … })
export const listHandlers = {
  ...pullToRefresh,
  ...unwatchOnLeave,
  onReachBottom(this: ListPage) {
    void this.list?.more()
  },
  onFilter(this: ListPage, event: DetailEvent<FilterValue>) {
    this.setData({ filter: event.detail })
    void this.list?.refresh()
  },
  onFailureAction(this: ListPage) {
    void this.list?.refresh()
  },
}
