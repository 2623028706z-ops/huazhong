// X11 订货目录（2026-10-05 从客户页拆出来的单独入口，产品归客户）：左侧客户，右侧按这个客户的订货分类
// 分组列产品（名称、订货价/单位；小字客户产品编码、配方几种花材），点一行进 X13 目录产品。
// 底栏「管理分类 / 添加产品」；添加产品先选「新建产品」或「从其他客户复制」（X14，空目录整份复制也走这里）
import {
  contract,
  copy,
  type Catalog,
  type CatalogCategory,
  type CustomerItem,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { confirmAsk } from '../../../../core/guard'
import { newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { pullToRefresh, unwatch, watch } from '../../../../core/live'
import { loadCustomers } from '../../../../views/customers'
import { customerSideOf } from '../customers/form'
import { groupsOf } from '../directory/form'

const PAGES = '/packages/sales/pages'

Page({
  ...pullToRefresh,
  data: {
    title: copy.screen.title.directory,
    loaded: false,
    failure: null as FailureView | null,
    realtime: '',
    side: [] as ReturnType<typeof customerSideOf>,
    customerId: '',
    customerName: '',
    count: '',
    categories: [] as CatalogCategory[],
    groups: [] as ReturnType<typeof groupsOf>,
    categorySheet: false,
    categoryError: '',
    addSheet: false,
    saving: false,
    texts: {
      manage: copy.screen.action.manageCategories,
      categories: copy.screen.title.categories,
      add: copy.screen.action.addProduct,
      needCategory: copy.screen.needCategory,
      empty: copy.state.empty(copy.screen.empty.directory),
      noCustomers: copy.screen.empty.customers,
      disabled: copy.screen.tag.discontinued,
      create: copy.screen.title.createProduct,
      createHint: copy.screen.catalog.createHint,
      copy: copy.screen.title.catalogCopy,
      copyHint: copy.screen.catalog.copyHint,
    },
  },
  idempotencyKey: '',
  onShow() {
    void this.load()
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
  },
  async load(): Promise<void> {
    const customers = await loadCustomers()
    if (!customers.ok) {
      this.setData({
        failure: failureOf(customers.failure, this.data.loaded ? 'refresh' : 'load'),
      })
      return
    }
    const side = customerSideOf(customers.data)
    const keep = side.find((row) => row.id === this.data.customerId) ?? side[0]
    this.setData({ side, failure: null })
    if (keep) await this.select(keep.id, customers.data)
    else this.setData({ loaded: true })
  },
  async select(customerId: string, customers?: CustomerItem[]): Promise<void> {
    const name =
      customers?.find((row) => row.id === customerId)?.name ??
      this.data.side.find((row) => row.id === customerId)?.name ??
      ''
    this.setData({ customerId, customerName: name, realtime: '' })
    const result = await request(contract.getCatalog, { params: { customerId } })
    if (customerId !== this.data.customerId) return
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.showCatalog(result.data)
    // 管理分类开着时只提示，关着时直接刷新
    watch(this, [`catalog:${customerId}`], () => {
      if (!this.data.categorySheet) void this.select(customerId)
      else if (!this.data.saving) this.setData({ realtime: copy.screen.realtime.editing })
    })
  },
  showCatalog(catalog: Catalog) {
    this.setData({
      loaded: true,
      failure: null,
      categories: catalog.categories,
      groups: groupsOf(catalog),
      count: catalog.items.length ? copy.screen.catalog.productCount(catalog.items.length) : '',
      realtime: '',
    })
  },
  onCustomer(event: DetailEvent<string>) {
    void this.select(event.detail)
  },
  onRealtime() {
    void this.select(this.data.customerId)
  },
  onOpenItem(event: KeyEvent) {
    void wx.navigateTo({
      url: `${PAGES}/catalog-item/index?customerId=${this.data.customerId}&productId=${event.currentTarget.dataset.key}`,
    })
  },
  onAdd() {
    this.setData({ addSheet: true })
  },
  onCloseAdd() {
    this.setData({ addSheet: false })
  },
  // 新建要先有订货分类（从其他客户复制会顺带建分类，不受限）
  onCreate() {
    if (this.data.categories.length === 0) return
    this.setData({ addSheet: false })
    void wx.navigateTo({ url: `${PAGES}/catalog-item/index?customerId=${this.data.customerId}` })
  },
  onCopy() {
    this.setData({ addSheet: false })
    void wx.navigateTo({ url: `${PAGES}/catalog-copy/index?customerId=${this.data.customerId}` })
  },
  // 管理分类：这个客户的订货分类
  onManage() {
    this.idempotencyKey = newIdempotencyKey()
    this.setData({ categorySheet: true, categoryError: '' })
  },
  onCloseCategories() {
    this.setData({ categorySheet: false })
  },
  settleCategory(result: Result<Catalog>): boolean {
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
  async onSaveCategory(event: DetailEvent<{ id: string; name: string }>): Promise<void> {
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
  async onUpCategory(event: DetailEvent<number>): Promise<void> {
    const index = event.detail
    const ids = this.data.categories.map((c) => c.id)
    const [previous, current] = [ids[index - 1], ids[index]]
    if (previous === undefined || current === undefined) return
    ids[index - 1] = current
    ids[index] = previous
    const params = { customerId: this.data.customerId }
    this.settleCategory(await request(contract.orderCatalogCategories, { params, body: { ids } }))
  },
  async onRemoveCategory(event: DetailEvent<string>): Promise<void> {
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
  onFailureAction() {
    void this.load()
  },
})
