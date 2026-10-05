// X4 订单表单（06 章 X4）：新建（从 X2）、修改（edit）、确认（confirm）。
// 状态区 → 客户门店（只在新建时可选，一次选：按客户分组列启用客户的启用门店，可搜）→ 出货日期 → 备注 → 明细 →「添加产品」→ 订单金额 → 修改原因
import {
  contract,
  copy,
  redesignCopy,
  entryCopy,
  formatMoney,
  type CatalogCategory,
  type CatalogItem,
  type CustomerItem,
  type OrderDetail,
} from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import { unplacedErrorOf } from '../../../../core/form'
import type { FailureView } from '../../../../core/failure-view'
import { isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { unwatch, watchNewer } from '../../../../core/live'
import { newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showNotice, showSuccess } from '../../../../core/toast'
import { loadCustomers } from '../../../../views/customers'
import { pickChosen, pickData, pickHandlers, pickOpen } from '../../../../views/pick'
import {
  addableOf,
  blankForm,
  checkCreate,
  checkUpdate,
  checkConfirm,
  linesChanged,
  formOf,
  lineOfCatalog,
  lineViewsOf,
  type FormMode,
  type OrderForm,
} from './form'

const titles: Record<FormMode, string> = {
  create: copy.screen.title.createOrder,
  edit: copy.screen.title.editOrder,
  confirm: copy.screen.title.confirmOrder,
}
const submitTexts: Record<FormMode, string> = {
  create: copy.screen.action.submitOrder,
  edit: copy.screen.action.saveEdit,
  confirm: copy.screen.action.confirm,
}

function modeOf(value: string | undefined): FormMode {
  return value === 'edit' || value === 'confirm' ? value : 'create'
}

// 选门店：启用客户的启用门店，按客户分组；框里显示「客户 · 门店」
function storeOptionsOf(customers: readonly CustomerItem[]) {
  return customers
    .filter((customer) => customer.enabled)
    .flatMap((customer) =>
      customer.stores
        .filter((store) => store.enabled)
        .map((store) => ({
          id: store.id,
          name: store.name,
          group: customer.name,
          shown: copy.org.store(customer.name, store.name),
          customerId: customer.id,
        })),
    )
}

Page({
  data: {
    changed: false,
    linesChanged: false,
    overdue: '',
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
    customerTitle: '',
    storeOptions: [] as ReturnType<typeof storeOptionsOf>,
    lineViews: [] as ReturnType<typeof lineViewsOf>,
    pickSheet: false,
    ...pickData(),
    saving: false,
    texts: {
      lines: copy.screen.section.lines,
      orderInfo: copy.screen.section.orderInfo,
      customerStore: entryCopy.customerStore,
      pickStore: entryCopy.pickStore,
      searchStore: entryCopy.searchStore,
      shipDate: copy.field.shipDate,
      note: copy.field.note,
      reason: copy.screen.label.editReason,
      optional: copy.placeholder.optional,
      add: copy.screen.action.addProduct,
      pickTitle: copy.screen.title.pickProduct,
      noPick: copy.state.empty(copy.screen.empty.addableProducts),
      searchProduct: entryCopy.searchProduct,
    },
  },
  id: '',
  order: null as OrderDetail | null,
  customers: [] as CustomerItem[],
  catalog: [] as CatalogItem[],
  categories: [] as CatalogCategory[],
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
    this.setData({ loaded: true, storeOptions: storeOptionsOf(result.data) })
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
      overdue: order.overdue
        ? redesignCopy.overdueNotice(
            order.customerName,
            formatMoney(order.overdue.amountCents),
            order.overdue.days,
          )
        : '',
    })
    this.setData({
      loaded: true,
      realtime: '',
      customerTitle: copy.org.store(order.customerName, order.storeName),
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
    this.categories = result.data.categories
    return true
  },
  render(form: OrderForm, isInitial = false) {
    const initial = isInitial ? form : this.data.initial
    this.setData({
      form,
      initial,
      linesChanged: linesChanged(form, initial),
      lineViews: lineViewsOf(form.lines),
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
  // 选门店：同一客户只换门店；换了客户，明细跟着这个客户的目录重来（有明细时提示已清空）
  async onStore(event: DetailEvent<string>): Promise<void> {
    const storeId = event.detail
    const customerId = this.data.storeOptions.find((row) => row.id === storeId)?.customerId ?? ''
    if (customerId === this.data.form.customerId) {
      this.update({ storeId }, 'storeId')
      return
    }
    if (this.data.form.lines.length) showNotice(entryCopy.linesCleared)
    this.update({ customerId, storeId, lines: [] }, 'customerId')
    this.update({}, 'storeId')
    const customer = this.customers.find((row) => row.id === customerId)
    this.setData({
      overdue: customer?.overdue
        ? redesignCopy.overdueNotice(
            customer.name,
            formatMoney(customer.overdue.amountCents),
            customer.overdue.days,
          )
        : '',
    })
    await this.loadCatalog(customerId)
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
    this.setData({
      pickSheet: true,
      ...pickOpen(addableOf(this.catalog, this.categories, this.data.form.lines)),
    })
  },
  onClosePick() {
    this.setData({ pickSheet: false })
  },
  ...pickHandlers,
  // 选好的产品按选的数量一次加入，单价默认订货价；不再打开小窗口
  onPickConfirm() {
    const added = pickChosen(this.data).flatMap(({ id, qty }) => {
      const item = this.catalog.find((entry) => entry.productId === id)
      return item ? [lineOfCatalog(item, qty)] : []
    })
    this.setData({ pickSheet: false })
    if (added.length) this.update({ lines: [...this.data.form.lines, ...added] }, 'lines')
  },
  showFields(fields: Record<string, string>) {
    this.setData({
      fields,
      formError: unplacedErrorOf(fields, [
        'customerId',
        'storeId',
        'shipDate',
        'reason',
        'lines.*.qty',
        'lines.*.priceCents',
      ]),
    })
  },
  async onSubmit(): Promise<void> {
    const order = this.order
    if (order) await this.submitUpdate(order)
    else await this.submitCreate()
  },
  async submitCreate(): Promise<void> {
    const checked = checkCreate(this.data.form)
    if (!checked.ok) {
      this.showFields(checked.fields)
      return
    }
    this.setData({ saving: true, formError: '' })
    const options = { idempotencyKey: this.idempotencyKey }
    this.afterSubmit(await request(contract.createOrder, { body: checked.body }, options))
  },
  async submitUpdate(order: OrderDetail): Promise<void> {
    const checked =
      this.data.mode === 'confirm'
        ? checkConfirm(this.data.form, order.version)
        : checkUpdate(this.data.form, order.version)
    if (!checked.ok) {
      this.showFields(checked.fields)
      return
    }
    this.setData({ saving: true, formError: '' })
    const input = { params: { id: order.id }, body: checked.body }
    this.afterSubmit(
      await request(
        this.data.mode === 'confirm' ? contract.confirmOrder : contract.updateOrder,
        input,
      ),
    )
  },
  afterSubmit(result: Result<OrderDetail>) {
    this.setData({ saving: false })
    if (result.ok) {
      markChanged(this, false)
      showSuccess(copy.action.saved)
      // 新建的：直接看这张订单的详情；修改、确认的：回到原来的详情
      if (this.data.mode === 'create')
        void wx.redirectTo({ url: `/packages/sales/pages/order-detail/index?id=${result.data.id}` })
      else void wx.navigateBack()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'fields') this.showFields(view.fields)
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
