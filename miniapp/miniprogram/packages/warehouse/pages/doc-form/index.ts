import {
  contract,
  copy,
  formatQty,
  type InventoryItem,
  type OutCategory,
  type WhDocKind,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { checkedOf, unplacedErrorOf } from '../../../../core/form'
import { formOnLeave, isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { watch } from '../../../../core/live'
import { centsOfText } from '../../../../core/money'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf, messageOf, type ShownFailure } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { uploadImage, type LocalImage, type UploadedImage } from '../../../../core/upload'
import { loadInventory, loadSuppliers } from '../../../../views/purchase-load'

interface Line {
  materialId: string
  name: string
  code: string
  unit: string
  qty: number
  priceText: string
  stockQty: number
}
interface Form {
  supplierId: string
  outCategoryId: string
  reason: string
  lines: Line[]
  images: UploadedImage[]
}
const blank: Form = { supplierId: '', outCategoryId: '', reason: '', lines: [], images: [] }
const placedFields = ['supplierId', 'outCategoryId', 'reason', 'lines.*.qty', 'lines.*.priceCents']
function kindOf(value?: string): WhDocKind {
  return value === 'out' || value === 'loss' ? value : 'in'
}
function lineViews(form: Form, fields: Record<string, string>, kind: WhDocKind) {
  return form.lines.map((line, index) => ({
    ...line,
    key: line.materialId,
    tags: [],
    meta: kind === 'in' ? '' : copy.stock.available(formatQty(line.stockQty, line.unit)),
    priceCents: centsOfText(line.priceText) ?? 0,
    amountCents: line.qty * (centsOfText(line.priceText) ?? 0),
    qtyError: fields[`lines.${index}.qty`] ?? '',
    priceError: fields[`lines.${index}.priceCents`] ?? '',
  }))
}
Page({
  ...formOnLeave,
  data: {
    title: '',
    kind: kindOf(),
    loaded: false,
    changed: false,
    saving: false,
    uploading: false,
    failure: null as FailureView | null,
    formError: '',
    fields: {},
    form: blank,
    initial: blank,
    lines: [] as ReturnType<typeof lineViews>,
    supplierOptions: [] as { id: string; name: string }[],
    categoryOptions: [] as { id: string; name: string }[],
    categories: [] as OutCategory[],
    categorySheet: false,
    categoryError: '',
    categorySaving: false,
    picks: [] as { id: string; name: string; sub: string }[],
    pickSheet: false,
    editKey: '',
    pickError: '',
    realtime: '',
    submitText: '',
    texts: {
      ...copy.stock.screen,
      supplier: copy.screen.label.supplier,
      materials: copy.screen.section.materials,
      add: copy.screen.action.addMaterial,
      pick: copy.screen.title.pickMaterial,
      noPick: copy.stock.screen.noPickMaterial,
      manage: copy.screen.action.manageCategories,
    },
  },
  inventory: [] as InventoryItem[],
  materialId: '',
  key: '',
  categoryKey: '',
  onLoad(query: Record<string, string | undefined>) {
    const kind = kindOf(query.kind)
    this.materialId = query.materialId ?? ''
    this.key = newIdempotencyKey()
    this.setData({
      kind,
      title: copy.stock.screen.create[kind],
      submitText: copy.stock.screen.submit[kind],
    })
  },
  onShow() {
    syncUnloadAlert(this.data.changed)
    void this.load()
    watch(this, ['stock'], () => {
      this.setData({ realtime: copy.stock.screen.refreshStock })
      void this.load()
    })
  },
  async load() {
    const inventory = await loadInventory()
    if (!inventory.ok) {
      this.setData({ failure: failureOf(inventory.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.inventory = inventory.data
    if (!(await this.loadOptions())) return
    const form = {
      ...this.data.form,
      lines: this.data.form.lines.map((line) => ({
        ...line,
        stockQty: this.inventory.find((row) => row.id === line.materialId)?.stockQty ?? 0,
      })),
    }
    if (!this.data.loaded && this.materialId) {
      const item = this.inventory.find((row) => row.id === this.materialId)
      if (item && (item.enabled || this.data.kind !== 'in')) form.lines = [this.lineOf(item)]
    }
    if (!this.data.loaded) this.setData({ initial: form })
    this.setData({ loaded: true, failure: null })
    this.render(form)
  },
  async loadOptions() {
    if (this.data.kind === 'in') {
      const suppliers = await loadSuppliers({ enabled: 'true' })
      if (!suppliers.ok) {
        this.setData({ failure: failureOf(suppliers.failure, 'load') })
        return false
      }
      this.setData({
        supplierOptions: suppliers.data.map((row) => ({ id: row.id, name: row.name })),
      })
    }
    if (this.data.kind === 'out') {
      const categories = await request(contract.listOutCategories)
      if (!categories.ok) {
        this.setData({ failure: failureOf(categories.failure, 'load') })
        return false
      }
      this.setData({
        categories: categories.data.items,
        categoryOptions: categories.data.items
          .filter((row) => row.enabled)
          .map((row) => ({ id: row.id, name: row.name })),
      })
    }
    return true
  },
  lineOf(item: InventoryItem): Line {
    return {
      materialId: item.id,
      name: item.name,
      code: item.code,
      unit: item.unit,
      qty: 1,
      priceText: '',
      stockQty: item.stockQty,
    }
  },
  render(form: Form, inputFields?: Record<string, string>) {
    const fields = inputFields ?? this.data.fields
    this.setData({
      form,
      fields,
      lines: lineViews(form, fields, this.data.kind),
    })
    const normalize = (value: Form) => ({
      ...value,
      lines: value.lines.map(({ stockQty: _stockQty, ...line }) => line),
    })
    markChanged(this, isChanged(normalize(this.data.initial), normalize(form)))
  },
  onSupplier(event: DetailEvent<string>) {
    this.render({ ...this.data.form, supplierId: event.detail }, {})
  },
  onCategory(event: DetailEvent<string>) {
    this.render({ ...this.data.form, outCategoryId: event.detail }, {})
  },
  onReason(event: DetailEvent<string>) {
    this.render({ ...this.data.form, reason: event.detail }, {})
  },
  onQty(event: DetailEvent<{ index: number; qty: number }>) {
    const lines = this.data.form.lines.map((line, index) =>
      index === event.detail.index ? { ...line, qty: event.detail.qty } : line,
    )
    this.render({ ...this.data.form, lines }, {})
  },
  onPrice(event: DetailEvent<{ index: number; text: string }>) {
    const lines = this.data.form.lines.map((line, index) =>
      index === event.detail.index ? { ...line, priceText: event.detail.text } : line,
    )
    this.render({ ...this.data.form, lines }, {})
  },
  onRemove(event: DetailEvent<number>) {
    this.render(
      {
        ...this.data.form,
        lines: this.data.form.lines.filter((_, index) => index !== event.detail),
      },
      {},
    )
  },
  onOpenPick() {
    const selected = new Set(this.data.form.lines.map((line) => line.materialId))
    this.setData({
      editKey: '',
      pickSheet: true,
      picks: this.inventory
        .filter((row) => !selected.has(row.id) && (this.data.kind !== 'in' || row.enabled))
        .map((row) => ({
          id: row.id,
          name: row.name,
          sub: copy.stock.available(formatQty(row.stockQty, row.unit)),
        })),
    })
  },
  onPick(event: KeyEvent) {
    const item = this.inventory.find((row) => row.id === event.currentTarget.dataset.key)
    if (!item || this.data.form.lines.some((line) => line.materialId === item.id)) return
    this.render({ ...this.data.form, lines: [...this.data.form.lines, this.lineOf(item)] }, {})
    this.setData({ pickSheet: false, editKey: item.id })
  },
  onClosePick() {
    this.setData({ pickSheet: false })
  },
  // 管理分类在弹层里做，维护完回到表单，草稿还在（06 章 W5）
  onManageCategories() {
    this.categoryKey = newIdempotencyKey()
    this.setData({ categorySheet: true, categoryError: '' })
  },
  onCloseCategories() {
    if (!this.data.categorySaving) this.setData({ categorySheet: false })
  },
  async onSaveCategory(event: DetailEvent<{ id: string; name: string; enabled: boolean }>) {
    if (this.data.categorySaving) return
    const { id, name, enabled } = event.detail
    const checked = checkedOf(contract.createOutCategory.body.safeParse({ name, enabled }))
    if (!checked.ok) {
      this.setData({ categoryError: Object.values(checked.fields)[0] ?? '' })
      return
    }
    this.setData({ categorySaving: true, categoryError: '' })
    const result = id
      ? await request(contract.updateOutCategory, { params: { id }, body: checked.body })
      : await request(
          contract.createOutCategory,
          { body: checked.body },
          { idempotencyKey: this.categoryKey },
        )
    this.setData({ categorySaving: false })
    if (!result.ok) {
      const failure = failureOf(result.failure, 'submit')
      if (failure) this.setData({ categoryError: messageOf(failure) })
      return
    }
    this.categoryKey = newIdempotencyKey()
    if (!(await this.loadOptions())) return
    // 选中的分类刚被停用：清掉，提交时提示重新选
    const selected = this.data.form.outCategoryId
    if (selected && !this.data.categoryOptions.some((option) => option.id === selected))
      this.render({ ...this.data.form, outCategoryId: '' })
  },
  async onAddImages(event: DetailEvent<LocalImage[]>) {
    if (this.data.uploading || this.data.saving) return
    this.setData({ uploading: true, formError: '' })
    try {
      const images = [...this.data.form.images]
      for (const file of event.detail) {
        const result = await uploadImage('loss_image', file)
        if (!result.ok) {
          this.setData({
            formError: result.failure
              ? (failureOf(result.failure, 'submit')?.message ?? '')
              : result.message,
          })
          break
        }
        images.push(result.image)
      }
      this.render({ ...this.data.form, images }, {})
    } finally {
      this.setData({ uploading: false })
    }
  },
  onRemoveImage(event: DetailEvent<number>) {
    this.render(
      {
        ...this.data.form,
        images: this.data.form.images.filter((_, index) => index !== event.detail),
      },
      {},
    )
  },
  onRealtime() {
    this.setData({ realtime: '' })
    void this.load()
  },
  onFailureAction() {
    void this.load()
  },
  showFields(fields: Record<string, string>) {
    this.render(this.data.form, fields)
    this.setData({ formError: unplacedErrorOf(fields, placedFields) })
  },
  showFailure(failure: ShownFailure | null) {
    if (!failure) return
    if (failure.kind === 'fields') this.showFields(failure.fields)
    else this.setData({ formError: messageOf(failure) })
  },
  async onSubmit() {
    if (this.data.saving || this.data.uploading) return
    const form = this.data.form
    const checked = checkedOf(
      contract.createWhDoc.body.safeParse({
        kind: this.data.kind,
        supplierId: form.supplierId,
        outCategoryId: form.outCategoryId,
        reason: form.reason,
        imageFileIds: form.images.map((image) => image.fileId),
        lines: form.lines.map((line) => ({
          materialId: line.materialId,
          qty: line.qty,
          ...(this.data.kind === 'in' ? { priceCents: centsOfText(line.priceText) } : {}),
        })),
      }),
    )
    if (!checked.ok) {
      this.showFields(checked.fields)
      return
    }
    this.setData({ saving: true, formError: '', fields: {} })
    try {
      const result = await request(
        contract.createWhDoc,
        { body: checked.body },
        { idempotencyKey: this.key },
      )
      if (!result.ok) {
        this.showFailure(failureOf(result.failure, 'submit'))
        return
      }
      markChanged(this, false)
      showSuccess(copy.action.saved)
      void wx.redirectTo({ url: `/packages/warehouse/pages/doc-detail/index?id=${result.data.id}` })
    } finally {
      this.setData({ saving: false })
    }
  },
})
