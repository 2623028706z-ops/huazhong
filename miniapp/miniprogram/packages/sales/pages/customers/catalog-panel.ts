import { contract, copy, type Catalog } from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import { confirmAsk } from '../../../../core/guard'
import { newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { watch } from '../../../../core/live'
import { groupsOf } from '../directory/form'
import type { catalogPanelData } from './catalog-state'
interface Host {
  data: typeof catalogPanelData & {
    customerId: string
    customerName: string
    side: { id: string; name: string }[]
    saving: boolean
  }
  catalog: Catalog | null
  idempotencyKey: string
  setData(patch: Record<string, unknown>): void
  selectComponent(selector: string): unknown
  loadCatalogPanel(): Promise<void>
  selectCatalog(id: string): Promise<void>
  showCatalog(catalog: Catalog): void
  settleCategory(result: Result<Catalog>): boolean
}
export const catalogPanelMethods = {
  catalog: null as Catalog | null,
  async loadCatalogPanel(this: Host): Promise<void> {
    if (this.data.customerId) await this.selectCatalog(this.data.customerId)
  },
  onOpenItem(this: Host, event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/sales/pages/catalog-item/index?customerId=${this.data.customerId}&productId=${event.currentTarget.dataset.key}`,
    })
  },
  onOpenPick(this: Host) {
    void wx.navigateTo({
      url: `/packages/sales/pages/catalog-pick/index?customerId=${this.data.customerId}`,
    })
  },
  async selectCatalog(this: Host, customerId: string): Promise<void> {
    const customer = this.data.side.find((row) => row.id === customerId)
    this.setData({ customerId, customerName: customer?.name ?? '', realtime: '' })
    const result = await request(contract.getCatalog, { params: { customerId } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'refresh') })
      return
    }
    this.showCatalog(result.data)
    // 弹层开着时只提示，关着时直接刷新
    watch(this, [`catalog:${customerId}`], () => {
      if (this.data.copySheet)
        this.setData({ copyPreview: null, copyError: copy.rework.catalogChanged })
      else if (!this.data.categorySheet) void this.selectCatalog(customerId)
      else if (!this.data.saving) this.setData({ realtime: copy.screen.realtime.editing })
    })
  },
  showCatalog(this: Host, catalog: Catalog) {
    this.catalog = catalog
    this.setData({
      categories: catalog.categories,
      groups: groupsOf(catalog),
      canCopy: canDo(catalog.actions, 'copyCatalog'),
      realtime: '',
    })
  },
  onRealtime(this: Host) {
    void this.selectCatalog(this.data.customerId)
  },
  // 管理分类：这个客户的订货分类
  onManage(this: Host) {
    this.idempotencyKey = newIdempotencyKey()
    this.setData({ categorySheet: true, categoryError: '' })
  },
  onCloseCategories(this: Host) {
    this.setData({ categorySheet: false })
  },
  settleCategory(this: Host, result: Result<Catalog>): boolean {
    this.setData({ saving: false })
    if (result.ok) {
      this.showCatalog(result.data)
      this.setData({ categoryError: '' })
      return true
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'stale') this.showCatalog(view.latest as Catalog)
    if (view?.kind === 'page') this.setData({ categorySheet: false, failure: view })
    else if (view) this.setData({ categoryError: messageOf(view) })
    return false
  },
  async onSaveCategory(
    this: Host,
    event: DetailEvent<{ id: string; name: string }>,
  ): Promise<void> {
    const { id, name } = event.detail
    const { customerId } = this.data
    this.setData({ saving: true })
    const result = id
      ? await request(contract.updateCatalogCategory, {
          params: { customerId, id },
          body: { name },
        })
      : await request(
          contract.createCatalogCategory,
          { params: { customerId }, body: { name } },
          { idempotencyKey: this.idempotencyKey },
        )
    if (this.settleCategory(result) && !id) this.idempotencyKey = newIdempotencyKey()
  },
  // 上移：和上一个交换后整组提交
  async onUpCategory(this: Host, event: DetailEvent<number>): Promise<void> {
    const index = event.detail
    const ids = this.data.categories.map((c) => c.id)
    const [previous, current] = [ids[index - 1], ids[index]]
    if (previous === undefined || current === undefined) return
    ids[index - 1] = current
    ids[index] = previous
    const params = { customerId: this.data.customerId }
    this.settleCategory(await request(contract.orderCatalogCategories, { params, body: { ids } }))
  },
  async onRemoveCategory(this: Host, event: DetailEvent<string>): Promise<void> {
    const confirmed = await confirmAsk(this, {
      title: copy.screen.confirm.deleteCategory,
      body: '',
      cancel: copy.confirm.cancel,
      confirm: copy.screen.action.delete,
    })
    if (!confirmed) return
    const params = { customerId: this.data.customerId, id: event.detail }
    this.settleCategory(await request(contract.deleteCatalogCategory, { params }))
  },
  onCatalogFailureAction(this: Host) {
    void this.loadCatalogPanel()
  },
}
