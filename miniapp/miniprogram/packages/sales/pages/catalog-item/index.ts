// X13 目录产品（2026-10-05 产品归客户，原 X10 产品表单并进来）：抬头「某客户的产品」→ 顶卡产品图 + 名称 + 单位 →
// 订货信息（订货价大字、订货分类、客户产品编码、可订）→ 配方明细（每单位用量）→ 底栏保存。
// 带 productId 是修改，不带是新建；改的只是这个客户的产品
import {
  contract,
  copy,
  entryCopy,
  type Catalog,
  type CatalogItem,
  type InventoryItem,
} from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { firstFailure, newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { unwatch, watch } from '../../../../core/live'
import { uploadImage, type LocalImage } from '../../../../core/upload'
import {
  addMaterials,
  bomTableRowsOf,
  loadMaterials,
  materialPicksOf,
  removeBomLine,
  setBomQty,
} from '../../../../views/bom'
import { pickChosen, pickData, pickHandlers, pickOpen } from '../../../../views/pick'
import { blankForm, checkCreate, checkUpdate, formOfItem, type ItemForm } from '../directory/form'

const OWN_FIELDS = ['name', 'unit', 'imageFileId', 'categoryId', 'customerCode', 'priceCents']

Page({
  data: {
    title: '',
    loaded: false,
    failure: null as FailureView | null,
    customerId: '',
    owner: '',
    realtime: '',
    changed: false,
    form: null as ItemForm | null,
    initial: null as ItemForm | null,
    images: [] as { url: string }[],
    bomHint: '',
    categoryOptions: [] as { id: string; name: string }[],
    pickSheet: false,
    fields: {},
    formError: '',
    bomError: '',
    saving: false,
    uploading: false,
    bomRows: [] as ReturnType<typeof bomTableRowsOf>,
    ...pickData(),
    texts: {
      orderInfo: copy.screen.section.customerItem,
      bom: copy.screen.section.bom,
      material: copy.screen.label.material,
      name: copy.screen.catalog.productName,
      unit: copy.field.unit,
      code: copy.screen.label.customerCode,
      category: copy.screen.label.catalogCategory,
      price: copy.field.listPrice,
      yuan: copy.unit.yuan,
      enabled: copy.statusValue.orderable,
      optional: copy.placeholder.optional,
      fill: copy.placeholder.fill,
      addMaterial: copy.screen.action.addMaterial,
      searchMaterial: entryCopy.searchMaterial,
      pickMaterial: copy.screen.title.pickMaterial,
      noMaterial: copy.state.empty(copy.screen.empty.addableMaterials),
      save: copy.action.saveProduct,
    },
  },
  productId: '',
  item: null as CatalogItem | null,
  materials: [] as InventoryItem[],
  idempotencyKey: '',
  onLoad(query: Record<string, string | undefined>) {
    this.productId = query.productId ?? ''
    this.idempotencyKey = newIdempotencyKey()
    this.setData({
      title: this.productId ? copy.screen.title.catalogItem : copy.screen.title.createProduct,
      customerId: query.customerId ?? '',
    })
    void this.load()
  },
  onShow() {
    if (this.data.loaded) this.watchCatalog()
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
    syncUnloadAlert(false)
  },
  // 开着时别人改了这个客户的目录：只提示，不覆盖正在填的内容
  watchCatalog() {
    watch(this, [`catalog:${this.data.customerId}`], () => {
      if (!this.data.saving) this.setData({ realtime: copy.screen.realtime.editing })
    })
  },
  async load(): Promise<void> {
    const [catalog, materials] = await Promise.all([
      request(contract.getCatalog, { params: { customerId: this.data.customerId } }),
      loadMaterials(),
    ])
    if (!catalog.ok || !materials.ok) {
      const failure = firstFailure([catalog, materials])
      if (failure) this.setData({ failure: failureOf(failure, 'load') })
      return
    }
    this.materials = materials.data
    this.open(catalog.data)
    this.watchCatalog()
  },
  open(catalog: Catalog) {
    this.showCatalog(catalog)
    const item = catalog.items.find((row) => row.productId === this.productId) ?? null
    if (this.productId && !item) {
      this.setData({
        failure: { kind: 'page', state: 'notFound', message: copy.error.notFound, requestId: null },
      })
      return
    }
    this.item = item
    const form = item ? formOfItem(item) : blankForm(catalog)
    this.setData({ loaded: true, failure: null, realtime: '', initial: form, fields: {} })
    this.setData({ bomError: '', formError: '' })
    this.render(form)
  },
  showCatalog(catalog: Catalog) {
    this.setData({
      owner: copy.screen.catalog.owner(catalog.customerName),
      categoryOptions: catalog.categories.map(({ id, name }) => ({ id, name })),
    })
  },
  render(form: ItemForm) {
    this.setData({
      form,
      bomRows: bomTableRowsOf(form.bom, this.materials),
      images: form.imageUrl ? [{ url: form.imageUrl }] : [],
      bomHint: form.bom.length
        ? copy.screen.catalog.bomHint(form.unit || copy.field.unit, form.bom.length)
        : '',
    })
    markChanged(this, isChanged(this.data.initial, form))
  },
  onFailureAction() {
    void this.load()
  },
  async onRealtime(): Promise<void> {
    const result = await request(contract.getCatalog, {
      params: { customerId: this.data.customerId },
    })
    if (result.ok) this.open(result.data)
  },
  patch(change: Partial<ItemForm>, field: string) {
    const form = this.data.form
    if (!form) return
    const fields = Object.fromEntries(
      Object.entries(this.data.fields).filter(([key]) => !key.startsWith(field)),
    )
    const bomError = field === 'bom' ? '' : this.data.bomError
    this.setData({ fields, bomError, formError: '' })
    this.render({ ...form, ...change })
  },
  onName(event: DetailEvent<string>) {
    this.patch({ name: event.detail }, 'name')
  },
  onUnit(event: DetailEvent<string>) {
    this.patch({ unit: event.detail }, 'unit')
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
  async onAddImage(event: DetailEvent<LocalImage[]>): Promise<void> {
    const file = event.detail[0]
    if (!file) return
    this.setData({ uploading: true, formError: '' })
    const result = await uploadImage('product_image', file)
    this.setData({ uploading: false })
    if (!result.ok) {
      this.setData({
        formError: result.failure
          ? (failureOf(result.failure, 'submit')?.message ?? '')
          : result.message,
      })
      return
    }
    this.patch({ imageFileId: result.image.fileId, imageUrl: result.image.url }, 'imageFileId')
  },
  onRemoveImage() {
    this.patch({ imageFileId: null, imageUrl: '' }, 'imageFileId')
  },
  onBomQty(event: DetailEvent<{ index: number; qty: number }>) {
    const bom = this.data.form?.bom ?? []
    this.patch({ bom: setBomQty(bom, event.detail.index, event.detail.qty) }, 'bom')
  },
  onRemoveBom(event: DetailEvent<number>) {
    const bom = this.data.form?.bom ?? []
    this.patch({ bom: removeBomLine(bom, event.detail) }, 'bom')
  },
  onAddBom() {
    const bom = this.data.form?.bom ?? []
    this.setData({ pickSheet: true, ...pickOpen(materialPicksOf(this.materials, bom)) })
  },
  ...pickHandlers,
  // 选好的花材按选的用量一次加入，不再打开小窗口
  onPickConfirm() {
    const chosen = pickChosen(this.data)
    this.setData({ pickSheet: false })
    if (chosen.length)
      this.patch({ bom: addMaterials(this.materials, this.data.form?.bom ?? [], chosen) }, 'bom')
  },
  onClosePick() {
    this.setData({ pickSheet: false })
  },
  // 配方的报错写在配方组上；能对上字段的写字段下，其余写顶上
  showFields(fields: Record<string, string>, message = '') {
    const bomKey = Object.keys(fields).find((key) => key.startsWith('bom'))
    const bomError = bomKey ? (fields[bomKey] ?? '') : ''
    const placed = Object.keys(fields).some((key) => OWN_FIELDS.includes(key))
    const first = Object.values(fields)[0] ?? message
    this.setData({ fields, bomError, saving: false, formError: placed || bomError ? '' : first })
  },
  async onSave(): Promise<void> {
    const { form, customerId } = this.data
    if (!form) return
    const item = this.item
    const checked = item ? checkUpdate(form, item.version) : checkCreate(form)
    if (!checked.ok) {
      this.showFields(checked.fields)
      return
    }
    this.setData({ saving: true, formError: '' })
    const result = item
      ? await request(contract.updateCatalogItem, {
          params: { customerId, productId: item.productId },
          body: { ...checked.body, version: item.version },
        })
      : await request(
          contract.createCatalogItem,
          { params: { customerId }, body: checked.body },
          { idempotencyKey: this.idempotencyKey },
        )
    this.setData({ saving: false })
    if (result.ok) {
      markChanged(this, false)
      void wx.navigateBack()
      showSuccess(copy.action.saved)
      return
    }
    this.failed(result)
  },
  // 过期：换成最新内容（修改的那个产品），报错写在表单顶上
  failed(result: Extract<Result<Catalog>, { ok: false }>) {
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'fields') this.showFields(view.fields, view.message)
    else if (view?.kind === 'stale') {
      this.open(view.latest as Catalog)
      this.setData({ formError: view.message })
    } else if (view?.kind === 'page') this.setData({ failure: view })
    else if (view) this.setData({ formError: messageOf(view) })
  },
})
