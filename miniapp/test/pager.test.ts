import { SKELETON_DELAY_MS } from '@huazhong/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pager, type PagerView } from '../miniprogram/core/pager'
import type { Result } from '../miniprogram/core/request'

type Page = { items: number[]; nextCursor: string | null }

function deferred() {
  let resolve!: (value: Result<Page>) => void
  const promise = new Promise<Result<Page>>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const ok = (items: number[], nextCursor: string | null): Result<Page> => ({
  ok: true,
  data: { items, nextCursor },
})

describe('分页列表', () => {
  let views: PagerView<number>[]
  beforeEach(() => {
    vi.useFakeTimers()
    views = []
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('首次加载超过骨架屏延迟才出骨架屏，回来后收起', async () => {
    const pending = deferred()
    const pager = new Pager<number>(
      () => pending.promise,
      (view) => views.push(view),
    )
    const loading = pager.reload()
    vi.advanceTimersByTime(SKELETON_DELAY_MS - 1)
    expect(views).toEqual([])
    vi.advanceTimersByTime(1)
    expect(views.at(-1)).toMatchObject({ skeleton: true, loaded: false })
    pending.resolve(ok([1, 2], null))
    await loading
    // 只有一页：不显示「已显示全部」
    expect(views.at(-1)).toEqual({ items: [1, 2], loaded: true, skeleton: false, done: false })
  })

  it('触底接着上一页的游标查，拼在后面', async () => {
    const fetch = vi.fn((cursor: string | undefined) =>
      Promise.resolve(cursor === undefined ? ok([1], 'c1') : ok([2], null)),
    )
    const pager = new Pager<number>(fetch, (view) => views.push(view))
    await pager.reload()
    expect(views.at(-1)?.done).toBe(false)
    await pager.more()
    expect(fetch).toHaveBeenLastCalledWith('c1')
    expect(views.at(-1)).toMatchObject({ items: [1, 2], done: true })
    expect(pager.more()).toBeNull()
  })

  it('重新查询时丢掉还没回来的旧请求', async () => {
    const first = deferred()
    const second = deferred()
    const replies = [first.promise, second.promise]
    const pager = new Pager<number>(
      () => replies.shift() ?? second.promise,
      (view) => views.push(view),
    )
    const stale = pager.reload()
    const fresh = pager.reload()
    second.resolve(ok([9], null))
    await fresh
    first.resolve(ok([1], null))
    await stale
    expect(views.at(-1)?.items).toEqual([9])
  })

  it('失败时保留已有的列表并把结果交给页面', async () => {
    const fetch = vi
      .fn<(cursor: string | undefined) => Promise<Result<Page>>>()
      .mockResolvedValueOnce(ok([1], null))
      .mockResolvedValueOnce({ ok: false, failure: { kind: 'network' } })
    const pager = new Pager<number>(fetch, (view) => views.push(view))
    await pager.reload()
    const result = await pager.reload()
    expect(result.ok).toBe(false)
    expect(views.at(-1)).toMatchObject({ items: [1], loaded: true })
  })
})
