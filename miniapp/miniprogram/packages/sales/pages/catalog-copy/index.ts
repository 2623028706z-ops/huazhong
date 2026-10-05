// X14 从其他客户复制（2026-10-05 产品归客户）：顶上切换来源客户（不含当前客户），勾选要复制的产品；
// 和当前客户重名、已停用的不能勾，写明原因。复制带名称、单位、产品图、配方、订货价，不带客户产品编码；
// 复制后各管各的。来源或当前目录变了（previewToken 不对）就刷新，请重新勾选
import { contract, copy, type CatalogCopySource } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf, messageOf, type ShownFailure } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { toggled } from '../../../../views/pick'
import { copyRowsOf } from '../directory/form'

Page({
  data: {
    title: copy.screen.title.catalogCopy,
    loaded: false,
    failure: null as FailureView | null,
    error: '',
    tabs: [] as { key: string; text: string }[],
    fromCustomerId: '',
    rows: [] as ReturnType<typeof copyRowsOf>,
    picked: [] as string[],
    confirm: copy.screen.catalog.copyCount(0),
    busy: false,
    texts: {
      empty: copy.screen.catalog.noSources,
      emptyItems: copy.screen.empty.addableProducts,
    },
  },
  customerId: '',
  source: null as CatalogCopySource | null,
  idempotencyKey: '',
  onLoad(query: Record<string, string | undefined>) {
    this.customerId = query.customerId ?? ''
    this.idempotencyKey = newIdempotencyKey()
    void this.load()
  },
  async load(pick?: string): Promise<boolean> {
    const fromCustomerId = pick ?? this.data.fromCustomerId
    const result = await request(contract.catalogCopySources, {
      params: { customerId: this.customerId },
      query: fromCustomerId ? { fromCustomerId } : {},
    })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return false
    }
    this.source = result.data
    const from = result.data.fromCustomerId ?? ''
    // 换了来源客户就清空勾选；同一来源刷新时保留还能勾的
    const keep = from === this.data.fromCustomerId ? this.data.picked : []
    this.setData({
      loaded: true,
      failure: null,
      fromCustomerId: from,
      tabs: result.data.sources.map((row) => ({ key: row.customerId, text: row.customerName })),
    })
    this.render(keep)
    return true
  },
  render(ids: readonly string[]) {
    const source = this.source
    if (!source) return
    const usable = new Set(
      source.items.filter((i) => i.skipReason === null).map((i) => i.productId),
    )
    const picked = ids.filter((id) => usable.has(id))
    this.setData({
      picked,
      rows: copyRowsOf(source, picked),
      confirm: copy.screen.catalog.copyCount(picked.length),
    })
  },
  onSource(event: DetailEvent<string>) {
    if (event.detail === this.data.fromCustomerId) return
    this.setData({ error: '' })
    void this.load(event.detail)
  },
  onPick(event: KeyEvent) {
    const id = event.currentTarget.dataset.key
    if (this.data.rows.find((row) => row.id === id)?.disabled) return
    this.setData({ error: '' })
    this.render(toggled(this.data.picked, id))
  },
  async onCopy(): Promise<void> {
    const source = this.source
    const { picked, fromCustomerId, busy } = this.data
    if (!source || picked.length === 0 || busy) return
    this.setData({ busy: true, error: '' })
    const result = await request(
      contract.copyCatalog,
      {
        params: { customerId: this.customerId },
        body: { fromCustomerId, productIds: picked, previewToken: source.previewToken },
      },
      { idempotencyKey: this.idempotencyKey },
    )
    this.setData({ busy: false })
    if (result.ok) {
      showSuccess(copy.action.saved)
      void wx.navigateBack()
      return
    }
    await this.failed(failureOf(result.failure, 'submit'))
  },
  // 过期：来源或当前目录变了，重新拉一遍（保留还能勾的），不自动重试复制
  async failed(view: ShownFailure | null): Promise<void> {
    if (view?.kind === 'stale') {
      this.idempotencyKey = newIdempotencyKey()
      if (await this.load()) this.setData({ error: copy.screen.catalog.copyChanged })
    } else if (view?.kind === 'page') this.setData({ failure: view })
    else if (view) this.setData({ error: messageOf(view) })
  },
  onFailureAction() {
    void this.load()
  },
})
