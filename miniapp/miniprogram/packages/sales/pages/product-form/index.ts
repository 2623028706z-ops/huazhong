// X10 产品表单（06 章 X10）：名称、分类、单位、产品图（1:1）、启用 → 配方明细（花材、用量）→「添加花材」。
// 保存后回 X9
import { contract, copy, type InventoryItem, type ProductItem } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { firstFailure, newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { uploadImage, type LocalImage } from '../../../../core/upload'
import { checkCreate, checkUpdate, loadMaterials, productFormOf, type ProductForm } from './form'

const DEFAULT_TITLE: string = copy.screen.title.createProduct

type IndexDetail<T> = DetailEvent<T, { index: number }>

Page({
  data: {
    changed: false,
    title: DEFAULT_TITLE,
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    fields: {},
    form: productFormOf(null),
    initial: productFormOf(null),
    images: [] as { url: string }[],
    categoryOptions: [] as { id: string; name: string }[],
    pickSheet: false,
    picks: [] as { id: string; name: string; sub: string }[],
    saving: false,
    uploading: false,
    texts: {
      name: copy.screen.label.name,
      category: copy.field.category,
      unit: copy.field.unit,
      image: copy.screen.label.productImage,
      enabled: copy.screen.label.enabled,
      bom: copy.field.bom,
      add: copy.screen.action.addMaterial,
      save: copy.action.save,
      pickTitle: copy.screen.title.pickMaterial,
      noPick: copy.state.empty(copy.screen.empty.addableMaterials),
    },
  },
  id: '',
  product: null as ProductItem | null,
  materials: [] as InventoryItem[],
  idempotencyKey: '',
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.idempotencyKey = newIdempotencyKey()
    if (this.id) this.setData({ title: copy.screen.title.editProduct })
    void this.load()
  },
  onUnload() {
    syncUnloadAlert(false)
  },
  async load(): Promise<void> {
    const [categories, products, materials] = await Promise.all([
      request(contract.listProductCategories),
      request(contract.listProducts, { query: {} }),
      loadMaterials(),
    ])
    if (!categories.ok || !products.ok || !materials.ok) {
      const failure = firstFailure([categories, products, materials])
      if (failure) this.setData({ failure: failureOf(failure, 'load') })
      return
    }
    this.materials = materials.data
    this.product = products.data.items.find((item) => item.id === this.id) ?? null
    const form = productFormOf(this.product)
    this.setData({
      loaded: true,
      failure: null,
      categoryOptions: categories.data.items.map(({ id, name }) => ({ id, name })),
      initial: form,
    })
    this.render(form)
  },
  render(form: ProductForm) {
    this.setData({ form, images: form.imageUrl ? [{ url: form.imageUrl }] : [] })
    markChanged(this, isChanged(this.data.initial, form))
  },
  update(patch: Partial<ProductForm>, field: string) {
    const fields = Object.fromEntries(
      Object.entries(this.data.fields).filter(([key]) => !key.startsWith(field)),
    )
    this.setData({ fields, formError: '' })
    this.render({ ...this.data.form, ...patch })
  },
  onName(event: DetailEvent<string>) {
    this.update({ name: event.detail }, 'name')
  },
  onCategory(event: DetailEvent<string>) {
    this.update({ categoryId: event.detail }, 'categoryId')
  },
  onUnit(event: DetailEvent<string>) {
    this.update({ unit: event.detail }, 'unit')
  },
  onEnabled(event: DetailEvent<boolean>) {
    this.update({ enabled: event.detail }, 'enabled')
  },
  async onAddImage(event: DetailEvent<LocalImage[]>): Promise<void> {
    const file = event.detail[0]
    if (!file) return
    this.setData({ uploading: true, formError: '' })
    const result = await uploadImage('product_image', file)
    this.setData({ uploading: false })
    if (!result.ok) {
      this.setData({ formError: result.message })
      return
    }
    this.update({ imageFileId: result.image.fileId, imageUrl: result.image.url }, 'imageFileId')
  },
  onRemoveImage() {
    this.update({ imageFileId: null, imageUrl: '' }, 'imageFileId')
  },
  onBomQty(event: IndexDetail<number>) {
    const { index } = event.currentTarget.dataset
    const bom = this.data.form.bom.map((line, i) =>
      i === index ? { ...line, qty: event.detail } : line,
    )
    this.update({ bom }, 'bom')
  },
  onRemoveBom(event: DetailEvent<unknown, { index: number }>) {
    const { index } = event.currentTarget.dataset
    this.update({ bom: this.data.form.bom.filter((_, i) => i !== index) }, 'bom')
  },
  onOpenPick() {
    const added = new Set(this.data.form.bom.map((line) => line.materialId))
    const picks = this.materials
      .filter((item) => !added.has(item.id))
      .map((item) => ({
        id: item.id,
        name: item.name,
        sub: [item.code, item.unit].join(copy.separator),
      }))
    this.setData({ pickSheet: true, picks })
  },
  onClosePick() {
    this.setData({ pickSheet: false })
  },
  onPick(event: KeyEvent) {
    const item = this.materials.find((m) => m.id === event.currentTarget.dataset.key)
    this.setData({ pickSheet: false })
    if (!item) return
    const line = { materialId: item.id, name: item.name, unit: item.unit, qty: 1 }
    this.update({ bom: [...this.data.form.bom, line] }, 'bom')
  },
  showFields(fields: Record<string, string>, message: string) {
    this.setData({ fields, formError: message, saving: false })
  },
  async onSave(): Promise<void> {
    const product = this.product
    const { form } = this.data
    if (product) {
      const checked = checkUpdate(form, product.version)
      if (!checked.ok) {
        this.showFields(checked.fields, Object.values(checked.fields)[0] ?? '')
        return
      }
      this.setData({ saving: true })
      const input = { params: { id: product.id }, body: checked.body }
      this.afterSave(await request(contract.updateProduct, input))
      return
    }
    const checked = checkCreate(form)
    if (!checked.ok) {
      this.showFields(checked.fields, Object.values(checked.fields)[0] ?? '')
      return
    }
    this.setData({ saving: true })
    const options = { idempotencyKey: this.idempotencyKey }
    this.afterSave(await request(contract.createProduct, { body: checked.body }, options))
  },
  afterSave(result: Result<ProductItem>) {
    this.setData({ saving: false })
    if (result.ok) {
      markChanged(this, false)
      showSuccess(copy.action.saved)
      void wx.navigateBack()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'fields') this.showFields(view.fields, view.message)
    else if (view.kind === 'page') this.setData({ failure: view })
    else if (view.kind === 'stale') {
      this.product = view.latest as ProductItem
      const form = productFormOf(this.product)
      this.setData({ initial: form, formError: view.message })
      this.render(form)
    } else this.setData({ formError: view.message })
  },
  onFailureAction() {
    void this.load()
  },
})
