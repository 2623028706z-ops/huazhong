import {
  contract,
  copy,
  type Catalog,
  type InventoryItem,
  type ProductItem,
  type CustomerItem,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { confirmAsk, isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { firstFailure, request, type Result } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { unwatch, watch } from '../../../../core/live'
import { loadCustomers } from '../../../../views/customers'
import {
  addMaterial,
  bomTableRowsOf,
  loadMaterials,
  materialPicksOf,
  removeBomLine,
  setBomQty,
} from '../../../../views/bom'
import { bomChanged, checkItem, formOfItem, formOfProduct, type ItemForm } from '../directory/form'
Page({
  data: {
    title: copy.screen.title.catalogItem,
    loaded: false,
    failure: null as FailureView | null,
    customerId: '',
    customerName: '',
    realtime: '',
    changed: false,
    form: null as ItemForm | null,
    initial: null as ItemForm | null,
    categoryOptions: [] as { id: string; name: string }[],
    layer: '',
    fields: {},
    formError: '',
    bomError: '',
    saving: false,
    bomRows: [] as ReturnType<typeof bomTableRowsOf>,
    editKey: '',
    materialPicks: [] as ReturnType<typeof materialPicksOf>,
    texts: {
      customerItem: copy.screen.section.customerItem,
      sharedBom: copy.screen.section.sharedBom,
      sharedNote: copy.screen.sharedBomNote,
      code: copy.screen.label.customerCode,
      category: copy.screen.label.catalogCategory,
      price: copy.screen.label.price,
      yuan: copy.unit.yuan,
      enabled: copy.statusValue.orderable,
      optional: copy.placeholder.optional,
      addMaterial: copy.screen.action.addMaterial,
      pickMaterial: copy.screen.title.pickMaterial,
      noMaterial: copy.state.empty(copy.screen.empty.addableMaterials),
      save: copy.action.saveCatalogItem,
    },
  },
  productId: '',
  materials: [] as InventoryItem[],
  onLoad(query: Record<string, string | undefined>) {
    this.productId = query.productId ?? ''
    this.setData({ customerId: query.customerId ?? '' })
    void this.load()
  },
  onShow() {
    if (this.data.loaded)
      watch(this, [`catalog:${this.data.customerId}`], () => {
        this.setData({ realtime: copy.screen.realtime.editing })
      })
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
    syncUnloadAlert(false)
  },
  async load(): Promise<void> {
    const [catalog, products, materials, customers] = await Promise.all([
      request(contract.getCatalog, { params: { customerId: this.data.customerId } }),
      request(contract.listProducts, { query: {} }),
      loadMaterials(),
      loadCustomers(),
    ])
    if (!catalog.ok || !products.ok || !materials.ok || !customers.ok) {
      const failure = firstFailure([catalog, products, materials, customers])
      if (failure) this.setData({ failure: failureOf(failure, 'load') })
      return
    }
    this.materials = materials.data
    this.showCatalog(catalog.data)
    this.openCatalogProduct(catalog.data, products.data.items, customers.data)
    watch(this, [`catalog:${this.data.customerId}`], () => {
      this.setData({ realtime: copy.screen.realtime.editing })
    })
  },
  openCatalogProduct(catalog: Catalog, products: ProductItem[], customers: CustomerItem[]) {
    const item = catalog.items.find((row) => row.productId === this.productId)
    const product = products.find((row) => row.id === this.productId)
    if (!item && !product) {
      this.setData({
        failure: { kind: 'page', state: 'notFound', message: copy.error.notFound, requestId: null },
      })
      return
    }
    this.setData({
      loaded: true,
      failure: null,
      customerName: customers.find((row) => row.id === this.data.customerId)?.name ?? '',
    })
    if (item) this.openItem(formOfItem(item))
    else if (product) this.openItem(formOfProduct(product, catalog))
  },
  showCatalog(catalog: Catalog) {
    this.setData({ categoryOptions: catalog.categories.map(({ id, name }) => ({ id, name })) })
  },
  onFailureAction() {
    void this.load()
  },
  onRealtime() {
    void this.load()
  },
  openItem(form: ItemForm) {
    this.setData({
      layer: '',
      form,
      bomRows: bomTableRowsOf(form.bom, this.materials),
      initial: form,
      fields: {},
      bomError: '',
      formError: '',
    })
    markChanged(this, false)
  },
  closeItem() {
    this.setData({ layer: '' })
  },
  patch(change: Partial<ItemForm>, field: string) {
    const { form, initial } = this.data
    if (!form) return
    const next = { ...form, ...change }
    const fields = Object.fromEntries(
      Object.entries(this.data.fields).filter(([key]) => !key.startsWith(field)),
    )
    const bomError = field === 'product' ? '' : this.data.bomError
    this.setData({
      form: next,
      bomRows: bomTableRowsOf(next.bom, this.materials),
      fields,
      bomError,
      formError: '',
    })
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
  onBomQty(event: DetailEvent<{ index: number; qty: number }>) {
    const bom = this.data.form?.bom ?? []
    this.patch({ bom: setBomQty(bom, event.detail.index, event.detail.qty) }, 'product')
  },
  onRemoveBom(event: DetailEvent<number>) {
    const bom = this.data.form?.bom ?? []
    this.patch({ bom: removeBomLine(bom, event.detail) }, 'product')
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
    this.setData({ layer: '', editKey: event.currentTarget.dataset.key })
    this.patch({ bom }, 'product')
  },
  onItemClose() {
    this.closeItem()
  },
  showCatalogFields(fields: Record<string, string>, message: string) {
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
      this.showCatalogFields(checked.fields, Object.values(checked.fields)[0] ?? '')
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
      markChanged(this, false)
      void wx.navigateBack()
      showSuccess(copy.action.saved)
      return
    }
    this.itemFailed(result)
  },
  // 过期：换成最新的目录项（新加的还按原样留着），报错写在表单里
  itemFailed(result: Extract<Result<Catalog>, { ok: false }>) {
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'fields') this.showCatalogFields(view.fields, view.message)
    else if (view?.kind === 'stale') {
      const latest = view.latest as Catalog
      this.showCatalog(latest)
      const productId = this.data.form?.productId
      const item = latest.items.find((i) => i.productId === productId)
      if (item) this.openItem(formOfItem(item))
      this.setData({ formError: view.message })
    } else if (view?.kind === 'page') {
      this.setData({ failure: view })
    } else if (view) this.setData({ formError: messageOf(view) })
  },
})
