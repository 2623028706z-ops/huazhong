// M6 操作日志（06 章 M6）：筛选模块（多于一项才显示）、日期；点开弹层看原因和修改前后
import {
  contract,
  copy,
  formatTime,
  labels,
  shanghaiDateOf,
  type LogDetail,
  type LogItem,
  type ModuleKey,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { emptyFilter, queryOf, type FilterDimension, type FilterValue } from '../../core/filter'
import { PagedList } from '../../core/list'
import type { PagerView } from '../../core/pager'
import { request } from '../../core/request'
import { failureOf, loadMe } from '../../core/session'

const MODULE = 'module'

function rowOf(item: LogItem) {
  return {
    id: item.id,
    title: [item.action, item.targetLabel].join(copy.separator),
    total: item.module === null ? copy.log.publicModule : labels.module[item.module],
    meta: [formatTime(item.createdAt), item.actorLabel].join(copy.separator),
  }
}

// 弹层：原因、修改前、修改后，按字段一行一项
function sectionsOf(detail: LogDetail) {
  const views = [
    { title: copy.log.before, view: detail.before },
    { title: copy.log.after, view: detail.after },
  ]
  return views.flatMap(({ title, view }) =>
    view ? [{ title, rows: Object.entries(view).map(([label, value]) => ({ label, value })) }] : [],
  )
}

Page({
  data: {
    title: copy.title.logs,
    dateLabel: copy.log.date,
    emptyObject: copy.object.logs,
    filter: emptyFilter,
    dimensions: [] as FilterDimension[],
    rows: [] as ReturnType<typeof rowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    allLoaded: copy.state.allLoaded,
    sheet: false,
    sheetTitle: copy.title.logDetail,
    reasonLabel: copy.log.reason,
    detail: null as { reason: string; sections: ReturnType<typeof sectionsOf> } | null,
    detailError: '',
  },
  list: null as PagedList<LogItem> | null,
  onLoad() {
    this.list = new PagedList(
      (cursor) => {
        const query = queryOf(this.data.filter, shanghaiDateOf(Date.now()))
        const module = query.picks[MODULE] as ModuleKey | undefined
        const range = { from: query.dateFrom ?? undefined, to: query.dateTo ?? undefined }
        return request(contract.listLogs, { query: { module, ...range, cursor } })
      },
      (view: PagerView<LogItem>) => {
        const { items, ...rest } = view
        this.setData({ ...rest, rows: items.map(rowOf) })
      },
      (patch) => {
        this.setData(patch)
      },
    )
    void this.loadModules()
  },
  onShow() {
    void this.refresh()
  },
  // 可选的模块就是 /me 的 modules，多于一项才显示（05 章第 2 节）
  async loadModules(): Promise<void> {
    const result = await loadMe()
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    const { modules } = result.data
    if (modules.length < 2) return
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
      this.setData({ detail: { reason: result.data.reason, sections: sectionsOf(result.data) } })
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
