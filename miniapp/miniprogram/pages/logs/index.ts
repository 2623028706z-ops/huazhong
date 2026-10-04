// M6 操作日志（06 章 M6）：筛选模块（多于一项才显示）、日期；按天分组；点开弹层先写是哪一条，再写原因和改动
import {
  contract,
  copy,
  labels,
  shanghaiDateOf,
  type LogItem,
  type ModuleKey,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { emptyFilter, queryOf, type FilterDimension, type FilterValue } from '../../core/filter'
import { PagedList } from '../../core/list'
import type { PagerView } from '../../core/pager'
import { request } from '../../core/request'
import { failureOf } from '../../core/session'
import { detailOf, groupsOf } from './view'
import { pullToRefresh } from '../../core/live'

const MODULE = 'module'

Page({
  ...pullToRefresh,
  data: {
    title: copy.title.logs,
    dateLabel: copy.log.date,
    emptyObject: copy.object.logs,
    filter: emptyFilter,
    dimensions: [] as FilterDimension[],
    groups: [] as ReturnType<typeof groupsOf>,
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    allLoaded: copy.state.allLoaded,
    sheet: false,
    sheetTitle: copy.title.logDetail,
    reasonLabel: copy.log.reason,
    detail: null as ReturnType<typeof detailOf> | null,
    detailError: '',
  },
  list: null as PagedList<LogItem> | null,
  onLoad() {
    this.list = new PagedList(
      async (cursor) => {
        const query = queryOf(this.data.filter, shanghaiDateOf(Date.now()))
        const module = query.picks[MODULE] as ModuleKey | undefined
        const range = { from: query.dateFrom ?? undefined, to: query.dateTo ?? undefined }
        const result = await request(contract.listLogs, { query: { module, ...range, cursor } })
        if (result.ok) this.setModules(result.data.filterModules)
        return result
      },
      (view: PagerView<LogItem>) => {
        const { items, ...rest } = view
        this.setData({ ...rest, groups: groupsOf(items, shanghaiDateOf(Date.now())) })
      },
      (patch) => {
        this.setData(patch)
      },
    )
  },
  onShow() {
    void this.refresh()
  },
  // 可选的模块就是 /me 的 modules，多于一项才显示（05 章第 2 节）
  setModules(modules: ModuleKey[]) {
    if (modules.length < 2) {
      this.setData({ dimensions: [] })
      return
    }
    const options = modules.map((key) => ({ id: key, name: labels.module[key] }))
    this.setData({ dimensions: [{ key: MODULE, label: copy.object.module, options }] })
  },
  async refresh(): Promise<void> {
    await this.list?.refresh()
  },
  onFilter(event: DetailEvent<FilterValue>) {
    this.setData({ filter: event.detail })
    void this.refresh()
  },
  async onReachBottom(): Promise<void> {
    await this.list?.more()
  },
  async onOpen(event: KeyEvent): Promise<void> {
    this.setData({ sheet: true, detail: null, detailError: '' })
    const result = await request(contract.getLog, {
      params: { id: event.currentTarget.dataset.key },
    })
    if (result.ok) {
      this.setData({ detail: detailOf(result.data) })
      return
    }
    const view = failureOf(result.failure, 'refresh')
    if (view) this.setData({ detailError: view.message })
  },
  onCloseSheet() {
    this.setData({ sheet: false })
  },
  onFailureAction() {
    void this.refresh()
  },
})
