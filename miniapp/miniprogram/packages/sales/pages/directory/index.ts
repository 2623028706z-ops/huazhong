// X11 订货目录（06 章 X11，2026-10-03 确认）：左侧客户，右侧按这个客户的订货分类分组列目录项。
// 点一项弹层改「这个客户」（编码、分类、订货价、可订）和配方（所有客户共用，改了先确认），一起保存。
// 底栏「管理分类」（这个客户的订货分类）、「添加产品」（先选产品，再进同一个弹层）
import {
  contract,
  copy,
  type Catalog,
  type CatalogCategory,
  type InventoryItem,
  type ProductItem,
  type OutputOf,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import { canDo } from '../../../../core/actions'
import { catalogCopyMethods } from './catalog-copy'
import type { FailureView } from '../../../../core/failure-view'
import { confirmAsk, isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { unwatch, watch } from '../../../../core/live'
import { firstFailure, newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import {
  addMaterial,
  loadMaterials,
  materialPicksOf,
  removeBomLine,
  setBomQty,
} from '../../../../views/bom'
import { loadCustomers } from '../../../../views/customers'
import { customerSideOf } from '../customers/form'
import {
  addableOf,
  bomChanged,
  checkItem,
  formOfItem,
  formOfProduct,
  groupsOf,
  type ItemForm,
} from './form'

type IndexDetail<T> = DetailEvent<T, { index: number }>

Page({
  ...catalogCopyMethods,
  data: {
    changed: false,
    title: copy.screen.title.directory,
    loaded: false,
    failure: null as FailureView | null,
    realtime: '',
    side: [] as ReturnType<typeof customerSideOf>,
    customerId: '',
    customerName: '',
    categories: [] as CatalogCategory[],
    categoryOptions: [] as { id: string; name: string }[],
    groups: [] as ReturnType<typeof groupsOf>,
    // 目录项弹层
    layer: '',
    form: null as ItemForm | null,
    initial: null as ItemForm | null,
    adding: false,
    priceLabel: '',
    fields: {},
    bomError: '',
    formError: '',
    materialPicks: [] as ReturnType<typeof materialPicksOf>,
    // 选产品弹层、管理分类弹层
    pickSheet: false,
    picks: [] as ReturnType<typeof addableOf>,
    categorySheet: false,
    categoryError: '',
    saving: false,
    canCopy: false,
    copySheet: false,
    copySourceId: '',
    copyOptions: [] as { id: string; name: string }[],
    copyPreview: null as OutputOf<typeof contract.previewCatalogCopy> | null,
    copyError: '',
    copyBusy: false,
    texts: {
      customerItem: copy.screen.section.customerItem,
      sharedBom: copy.screen.section.sharedBom,
      sharedNote: copy.screen.sharedBomNote,
      code: copy.screen.label.customerCode,
      category: copy.screen.label.catalogCategory,
      enabled: copy.statusValue.orderable,
      optional: copy.placeholder.optional,
      addMaterial: copy.screen.action.addMaterial,
      pickMaterial: copy.screen.title.pickMaterial,
      noMaterial: copy.state.empty(copy.screen.empty.addableMaterials),
      itemTitle: copy.screen.title.catalogItem,
      manage: copy.screen.action.manageCategories,
      categories: copy.screen.title.categories,
      add: copy.screen.action.addProduct,
      needCategory: copy.screen.needCategory,
      save: copy.action.saveCatalogItem,
      pickTitle: copy.screen.title.pickProduct,
      noPick: copy.state.empty(copy.screen.empty.addableProducts),
      empty: copy.state.empty(copy.screen.empty.directory),
      noCustomers: copy.screen.empty.customers,
      copy: copy.rework.copyCatalog,
      copySource: copy.rework.copySource,
      copyPreview: copy.rework.copyPreview,
      copyConfirm: copy.rework.copyConfirm,
    },
  },
  catalog: null as Catalog | null,
  products: [] as ProductItem[],
  materials: [] as InventoryItem[],
  idempotencyKey: '',
  onLoad() {
    void this.load()
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
    syncUnloadAlert(false)
  },
  async load(): Promise<void> {
    const [customers, products, materials] = await Promise.all([
      loadCustomers(),
      request(contract.listProducts, { query: {} }),
      loadMaterials(),
    ])
    if (!customers.ok || !products.ok || !materials.ok) {
      const failure = firstFailure([customers, products, materials])
      if (failure) this.setData({ failure: failureOf(failure, 'load') })
      return
    }
    this.products = products.data.items
    this.materials = materials.data
    const [first] = customers.data
    this.setData({ loaded: true, failure: null, side: customerSideOf(customers.data) })
    if (first) await this.select(first.id)
  },
  async select(customerId: string): Promise<void> {
    const customer = this.data.side.find((row) => row.id === customerId)
    this.setData({ customerId, customerName: customer?.name ?? '', realtime: '' })
    const result = await request(contract.getCatalog, { params: { customerId } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'refresh') })
      return
    }
    this.show(result.data)
    // 弹层开着时只提示，关着时直接刷新
    watch(this, [`catalog:${customerId}`], () => {
      if (this.data.copySheet)
        this.setData({ copyPreview: null, copyError: copy.rework.catalogChanged })
      else if (this.data.layer === '' && !this.data.categorySheet) void this.select(customerId)
      else if (!this.data.saving) this.setData({ realtime: copy.screen.realtime.editing })
    })
  },
  show(catalog: Catalog) {
    this.catalog = catalog
    this.setData({
      categories: catalog.categories,
      categoryOptions: catalog.categories.map(({ id, name }) => ({ id, name })),
      groups: groupsOf(catalog),
      canCopy: canDo(catalog.actions, 'copyCatalog'),
      realtime: '',
    })
  },
  onCustomer(event: DetailEvent<string>) {
    void this.select(event.detail)
  },
  onRealtime() {
    void this.select(this.data.customerId)
  },
  // 目录项弹层
  openItem(form: ItemForm, adding: boolean) {
    this.setData({
      layer: 'item',
      form,
      initial: form,
      adding,
      priceLabel: copy.screen.priceLabel(form.unit),
      fields: {},
      bomError: '',
      formError: '',
    })
    markChanged(this, false)
  },
  onOpenItem(event: KeyEvent) {
    const item = this.catalog?.items.find((i) => i.productId === event.currentTarget.dataset.key)
    if (item) this.openItem(formOfItem(item), false)
  },
  closeItem() {
    this.setData({ layer: '', form: null, initial: null })
    markChanged(this, false)
  },
  patch(change: Partial<ItemForm>, field: string) {
    const { form, initial } = this.data
    if (!form) return
    const next = { ...form, ...change }
    const fields = Object.fromEntries(
      Object.entries(this.data.fields).filter(([key]) => !key.startsWith(field)),
    )
    const bomError = field === 'product' ? '' : this.data.bomError
    this.setData({ form: next, fields, bomError, formError: '' })
    markChanged(this, isChanged(initial, next))
  },
  onCode(event: DetailEvent<string>) {
    this.patch({ customerCode: event.detail }, 'customerCode')
  },
  onCategory(event: DetailEvent<string>) {
    this.patch({ categoryId: event.detail }, 'categoryId')
  },
  onPrice(event: DetailEvent<string>) {
    this.patch({ priceText: event.detail }, 'priceCents')
  },
  onEnabled(event: DetailEvent<boolean>) {
    this.patch({ enabled: event.detail }, 'enabled')
  },
  onBomQty(event: IndexDetail<number>) {
    const bom = this.data.form?.bom ?? []
    this.patch({ bom: setBomQty(bom, event.currentTarget.dataset.index, event.detail) }, 'product')
  },
  onRemoveBom(event: IndexDetail<unknown>) {
    const bom = this.data.form?.bom ?? []
    this.patch({ bom: removeBomLine(bom, event.currentTarget.dataset.index) }, 'product')
  },
  onAddBom() {
    const bom = this.data.form?.bom ?? []
    this.setData({ layer: 'material', materialPicks: materialPicksOf(this.materials, bom) })
  },
  onPickMaterial(event: KeyEvent) {
    const bom = addMaterial(
      this.materials,
      this.data.form?.bom ?? [],
      event.currentTarget.dataset.key,
    )
    this.setData({ layer: 'item' })
    this.patch({ bom }, 'product')
  },
  // 选花材那层返回到目录项；目录项那层关闭（改过会问，hz-sheet guard）
  onItemBack() {
    if (this.data.layer === 'material') this.setData({ layer: 'item' })
  },
  onItemClose() {
    this.closeItem()
  },
  showFields(fields: Record<string, string>, message: string) {
    const bomKey = Object.keys(fields).find((key) => key.startsWith('product'))
    const bomError = bomKey ? (fields[bomKey] ?? '') : ''
    const own = Object.keys(fields).some((key) => !key.startsWith('product'))
    this.setData({ fields, bomError, formError: own || bomError ? '' : message })
  },
  async onSaveItem(): Promise<void> {
    const { form, initial, customerId } = this.data
    if (!form || !initial) return
    const checked = checkItem(form, initial)
    if (!checked.ok) {
      this.showFields(checked.fields, Object.values(checked.fields)[0] ?? '')
      return
    }
    if (bomChanged(form, initial)) {
      const confirmed = await confirmAsk(this, {
        title: copy.catalog.sharedBomTitle,
        body: copy.catalog.sharedBomBody,
        cancel: copy.confirm.cancel,
        confirm: copy.action.confirmSave,
      })
      if (!confirmed) return
    }
    this.setData({ saving: true, formError: '' })
    const params = { customerId, productId: form.productId }
    const result = await request(contract.saveCatalogItem, { params, body: checked.body })
    this.setData({ saving: false })
    if (result.ok) {
      this.show(result.data)
      this.closeItem()
      showSuccess(copy.action.saved)
      return
    }
    this.itemFailed(result)
  },
  // 过期：换成最新的目录项（新加的还按原样留着），报错写在弹层里
  itemFailed(result: Extract<Result<Catalog>, { ok: false }>) {
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'fields') this.showFields(view.fields, view.message)
    else if (view?.kind === 'stale') {
      const latest = view.latest as Catalog
      this.show(latest)
      const productId = this.data.form?.productId
      const item = latest.items.find((i) => i.productId === productId)
      if (item) this.openItem(formOfItem(item), false)
      this.setData({ formError: view.message })
    } else if (view?.kind === 'page') {
      this.closeItem()
      this.setData({ failure: view })
    } else if (view) this.setData({ formError: messageOf(view) })
  },

  // 添加产品：先选产品（重新取产品，配方是最新的），再进目录项弹层
  async onOpenPick(): Promise<void> {
    const products = await request(contract.listProducts, { query: {} })
    if (products.ok) this.products = products.data.items
    if (this.catalog)
      this.setData({ pickSheet: true, picks: addableOf(this.products, this.catalog) })
  },
  onClosePick() {
    this.setData({ pickSheet: false })
  },
  onPick(event: KeyEvent) {
    const product = this.products.find((p) => p.id === event.currentTarget.dataset.key)
    this.setData({ pickSheet: false })
    if (product && this.catalog) this.openItem(formOfProduct(product, this.catalog), true)
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
      this.show(result.data)
      this.setData({ categoryError: '' })
      return true
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'stale') this.show(view.latest as Catalog)
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
