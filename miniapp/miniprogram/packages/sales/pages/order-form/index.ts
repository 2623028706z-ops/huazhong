// X4 订单表单（06 章 X4）：新建（从 X2）、修改（edit）、修改并确认（editAndConfirm）。
// 状态区 → 客户、门店（只在新建时可选，只列启用的）→ 出货日期 → 备注 → 明细 →「添加产品」→ 订单金额 → 修改原因
import {
  contract,
  copy,
  type CatalogItem,
  type CustomerItem,
  type OrderDetail,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { unwatch, watchNewer } from '../../../../core/live'
import { newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { loadCustomers } from '../../../../views/customers'
import {
  addableOf,
  amountRowsOf,
  blankForm,
  checkCreate,
  checkUpdate,
  formOf,
  lineOfCatalog,
  lineViewsOf,
  type FormMode,
  type OrderForm,
} from './form'

const titles: Record<FormMode, string> = {
  create: copy.screen.title.createOrder,
  edit: copy.screen.title.editOrder,
  editAndConfirm: copy.screen.title.editAndConfirm,
}
const submitTexts: Record<FormMode, string> = {
  create: copy.screen.action.confirm,
  edit: copy.screen.action.saveEdit,
  editAndConfirm: copy.screen.action.editAndConfirm,
}

function modeOf(value: string | undefined): FormMode {
  return value === 'edit' || value === 'editAndConfirm' ? value : 'create'
}

function storeOptionsOf(customers: readonly CustomerItem[], customerId: string) {
  const customer = customers.find((item) => item.id === customerId)
  return (customer?.stores ?? [])
    .filter((store) => store.enabled)
    .map(({ id, name }) => ({ id, name }))
}

Page({
  data: {
    changed: false,
    mode: 'create',
    title: '',
    submitText: '',
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    fields: {},
    realtime: '',
    form: blankForm(),
    initial: blankForm(),
    customerRows: [] as { label: string; value: string }[],
    customerOptions: [] as { id: string; name: string }[],
    storeOptions: [] as { id: string; name: string }[],
    lineViews: [] as ReturnType<typeof lineViewsOf>,
    amountRows: [] as ReturnType<typeof amountRowsOf>,
    pickSheet: false,
    picks: [] as ReturnType<typeof addableOf>,
    saving: false,
    texts: {
      lines: copy.screen.section.lines,
      customer: copy.screen.label.customer,
      store: copy.screen.label.store,
      shipDate: copy.field.shipDate,
      note: copy.field.note,
      reason: copy.screen.label.editReason,
      optional: copy.placeholder.optional,
      add: copy.screen.action.addProduct,
      pickTitle: copy.screen.title.pickProduct,
      noPick: copy.state.empty(copy.screen.empty.addableProducts),
    },
  },
  id: '',
  order: null as OrderDetail | null,
  customers: [] as CustomerItem[],
  catalog: [] as CatalogItem[],
  idempotencyKey: '',
  onLoad(query: Record<string, string | undefined>) {
    const mode = modeOf(query.mode)
    this.id = query.id ?? ''
    this.idempotencyKey = newIdempotencyKey()
    this.setData({ mode, title: titles[mode], submitText: submitTexts[mode] })
    void (mode === 'create' ? this.loadCustomers() : this.loadOrder())
  },
  onShow() {
    if (this.data.mode === 'create') return
    watchNewer(
      this,
      `order:${this.id}`,
      () => this.order?.version,
      () => {
        this.setData({ realtime: copy.screen.realtime.editing })
      },
    )
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
    syncUnloadAlert(false)
  },
  async loadCustomers(): Promise<void> {
    const result = await loadCustomers()
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    this.customers = result.data
    const customerOptions = result.data
      .filter((customer) => customer.enabled)
      .map(({ id, name }) => ({ id, name }))
    this.setData({ loaded: true, customerOptions })
    this.render(blankForm(), true)
  },
  async loadOrder(): Promise<void> {
    const result = await request(contract.getOrder, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    const order = result.data
    const catalog = await this.loadCatalog(order.customerId)
    if (!catalog) return
    this.order = order
    this.setData({
      loaded: true,
      realtime: '',
      customerRows: [
        {
          label: copy.screen.label.customerStore,
          value: copy.org.store(order.customerName, order.storeName),
        },
      ],
    })
    this.render(formOf(order, this.data.form.reason), true)
  },
  async loadCatalog(customerId: string): Promise<boolean> {
    const result = await request(contract.getCatalog, { params: { customerId } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return false
    }
    this.catalog = result.data.items
    return true
  },
  render(form: OrderForm, isInitial = false) {
    const initial = isInitial ? form : this.data.initial
    this.setData({
      form,
      initial,
      lineViews: lineViewsOf(form.lines),
      amountRows: amountRowsOf(form.lines),
    })
    markChanged(this, isChanged(initial, form))
  },
  update(patch: Partial<OrderForm>, field: string) {
    const fields = Object.fromEntries(
      Object.entries(this.data.fields).filter(([key]) => !key.startsWith(field)),
    )
    this.setData({ fields, formError: '' })
    this.render({ ...this.data.form, ...patch })
  },
  async onCustomer(event: DetailEvent<string>): Promise<void> {
    const customerId = event.detail
    this.setData({ storeOptions: storeOptionsOf(this.customers, customerId) })
    // 换了客户：门店和明细都跟着这个客户的目录重来
    this.update({ customerId, storeId: '', lines: [] }, 'customerId')
    await this.loadCatalog(customerId)
  },
  onStore(event: DetailEvent<string>) {
    this.update({ storeId: event.detail }, 'storeId')
  },
  onShipDate(event: DetailEvent<string>) {
    this.update({ shipDate: event.detail }, 'shipDate')
  },
  onNote(event: DetailEvent<string>) {
    this.update({ note: event.detail }, 'note')
  },
  onReason(event: DetailEvent<string>) {
    this.update({ reason: event.detail }, 'reason')
  },
  patchLine(index: number, patch: Partial<OrderForm['lines'][number]>) {
    const lines = this.data.form.lines.map((line, i) =>
      i === index ? { ...line, ...patch } : line,
    )
    this.update({ lines }, 'lines')
  },
  onQty(event: DetailEvent<{ index: number; qty: number }>) {
    this.patchLine(event.detail.index, { qty: event.detail.qty })
  },
  onPrice(event: DetailEvent<{ index: number; text: string }>) {
    this.patchLine(event.detail.index, { priceText: event.detail.text })
  },
  onRemove(event: DetailEvent<number>) {
    this.update({ lines: this.data.form.lines.filter((_, i) => i !== event.detail) }, 'lines')
  },
  onOpenPick() {
    this.setData({ pickSheet: true, picks: addableOf(this.catalog, this.data.form.lines) })
  },
  onClosePick() {
    this.setData({ pickSheet: false })
  },
  onPick(event: KeyEvent) {
    const item = this.catalog.find((entry) => entry.productId === event.currentTarget.dataset.key)
    this.setData({ pickSheet: false })
    if (item) this.update({ lines: [...this.data.form.lines, lineOfCatalog(item)] }, 'lines')
  },
  showFields(fields: Record<string, string>, message: string) {
    this.setData({ fields, formError: message })
  },
  async onSubmit(): Promise<void> {
    const order = this.order
    if (order) await this.submitUpdate(order)
    else await this.submitCreate()
  },
  async submitCreate(): Promise<void> {
    const checked = checkCreate(this.data.form)
    if (!checked.ok) {
      this.showFields(checked.fields, Object.values(checked.fields)[0] ?? '')
      return
    }
    this.setData({ saving: true, formError: '' })
    const options = { idempotencyKey: this.idempotencyKey }
    this.afterSubmit(await request(contract.createOrder, { body: checked.body }, options))
  },
  async submitUpdate(order: OrderDetail): Promise<void> {
    const checked = checkUpdate(this.data.form, order.version)
    if (!checked.ok) {
      this.showFields(checked.fields, Object.values(checked.fields)[0] ?? '')
      return
    }
    this.setData({ saving: true, formError: '' })
    const input = { params: { id: order.id }, body: checked.body }
    this.afterSubmit(await request(contract.updateOrder, input))
  },
  afterSubmit(result: Result<OrderDetail>) {
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
      // 刷新成最新内容，已填的修改原因保留
      const latest = view.latest as OrderDetail
      this.order = latest
      this.render(formOf(latest, this.data.form.reason), true)
      this.setData({ formError: view.message, realtime: '' })
    } else this.setData({ formError: view.message })
  },
  onRealtime() {
    void this.loadOrder()
  },
  onFailureAction() {
    void (this.data.mode === 'create' ? this.loadCustomers() : this.loadOrder())
  },
})
