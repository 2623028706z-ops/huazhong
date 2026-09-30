// 列表页的公共部分（M5 库存查询、M6 日志、M7 员工共用）：分页 + 失败显示。
// 首次加载失败是整页状态，之后的刷新、翻页失败写在列表上方（02 章第 5.2 节）
import { Pager, type Fetch, type PagerView } from './pager'
import type { Result } from './request'
import { failureOf, type ShownFailure } from './session'

type Show = (patch: { failure: ShownFailure | null }) => void

export class PagedList<T> {
  private readonly pager: Pager<T>
  private loaded = false

  constructor(fetch: Fetch<T>, onView: (view: PagerView<T>) => void, show: Show) {
    this.show = show
    this.pager = new Pager(fetch, (view) => {
      this.loaded = view.loaded
      onView(view)
    })
  }

  private readonly show: Show

  // 条件变了、页面重新显示、实时推送：从第一页查
  async refresh(): Promise<void> {
    const phase = this.loaded ? 'refresh' : 'load'
    this.fail(await this.pager.reload(), phase)
  }

  async more(): Promise<void> {
    const pending = this.pager.more()
    if (pending) this.fail(await pending, 'refresh')
  }

  private fail(result: Result<unknown>, phase: 'load' | 'refresh'): void {
    this.show({ failure: result.ok ? null : failureOf(result.failure, phase) })
  }
}
