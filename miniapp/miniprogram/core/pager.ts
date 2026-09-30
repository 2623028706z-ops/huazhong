// 游标分页列表（05 章第 1.3 节）：首次加载超过 SKELETON_DELAY_MS 才出骨架屏（02 章第 5.1 节），
// 触底加载下一页；重新查询时丢掉还没回来的旧请求。页面只把 view 交给 setData
import { SKELETON_DELAY_MS } from '@huazhong/shared'
import type { Result } from './request'

interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface PagerView<T> {
  items: T[]
  // 第一页回来过（空状态只在这之后显示）
  loaded: boolean
  skeleton: boolean
  // 没有下一页了
  done: boolean
}

export type Fetch<T> = (cursor: string | undefined) => Promise<Result<Page<T>>>

export class Pager<T> {
  private items: T[] = []
  private cursor: string | null = null
  private loaded = false
  private skeleton = false
  private busy = false
  private run = 0
  private skeletonTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly fetch: Fetch<T>,
    private readonly onChange: (view: PagerView<T>) => void,
  ) {}

  // 条件变了、页面重新显示：从第一页查；失败返回结果交给页面显示
  reload(): Promise<Result<unknown>> {
    this.run += 1
    this.busy = false
    clearTimeout(this.skeletonTimer)
    if (!this.loaded) {
      this.skeletonTimer = setTimeout(() => {
        this.skeleton = true
        this.emit()
      }, SKELETON_DELAY_MS)
    }
    return this.load(undefined)
  }

  // 触底：还有下一页、上一次已经回来才查
  more(): Promise<Result<unknown>> | null {
    if (this.busy || !this.loaded || this.cursor === null) return null
    return this.load(this.cursor)
  }

  private async load(cursor: string | undefined): Promise<Result<unknown>> {
    const run = this.run
    this.busy = true
    const result = await this.fetch(cursor)
    if (run !== this.run) return { ok: true, data: null }
    this.busy = false
    clearTimeout(this.skeletonTimer)
    this.skeleton = false
    if (result.ok) {
      this.items = cursor === undefined ? result.data.items : [...this.items, ...result.data.items]
      this.cursor = result.data.nextCursor
      this.loaded = true
    }
    this.emit()
    return result
  }

  private emit(): void {
    this.onChange({
      items: this.items,
      loaded: this.loaded,
      skeleton: this.skeleton,
      done: this.loaded && this.cursor === null,
    })
  }
}
