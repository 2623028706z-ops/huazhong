// X11 订货目录（06 章 X11）：左侧客户，右侧目录（产品、订货价、启用开关）。
// 底栏「添加产品」（弹层；都加过了写「暂无可添加产品」）、「保存」。改了目录价，待确认订单的单价同时更新（后端做）
import { contract, copy, type Catalog, type CustomerItem, type ProductItem } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { confirmLeave, isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { unwatch, watch } from '../../../../core/live'
import { firstFailure, request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { loadCustomers } from '../../../../views/customers'
import { customerSideOf } from '../customers/form'
import { addableOf, checkSave, rowOfProduct, rowsOfCatalog, type DirectoryRow } from './form'

type RowEvent<T> = DetailEvent<T, { key: string }>

Page({
  data: {
    changed: false,
    title: copy.screen.title.directory,
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    rowErrors: {},
    realtime: '',
    side: [] as ReturnType<typeof customerSideOf>,
    customerId: '',
    rows: [] as DirectoryRow[],
    initial: [] as DirectoryRow[],
    pickSheet: false,
    picks: [] as ReturnType<typeof addableOf>,
    saving: false,
    texts: {
      price: copy.field.listPrice,
      enabled: copy.statusValue.orderable,
      add: copy.screen.action.addProduct,
      save: copy.action.save,
      pickTitle: copy.screen.title.pickProduct,
      noPick: copy.state.empty(copy.screen.empty.addableProducts),
      empty: copy.state.empty(copy.screen.empty.directory),
      noCustomers: copy.screen.empty.customers,
    },
  },
  products: [] as ProductItem[],
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
    const [customers, products] = await Promise.all([
      loadCustomers(),
      request(contract.listProducts, { query: {} }),
    ])
    if (!customers.ok || !products.ok) {
      const failure = firstFailure([customers, products])
      if (failure) this.setData({ failure: failureOf(failure, 'load') })
      return
    }
    this.products = products.data.items
    const first: CustomerItem | undefined = customers.data[0]
    this.setData({ loaded: true, failure: null, side: customerSideOf(customers.data) })
    if (first) await this.select(first.id)
  },
  async select(customerId: string): Promise<void> {
    this.setData({ customerId, formError: '', rowErrors: {}, realtime: '' })
    const result = await request(contract.getCatalog, { params: { customerId } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'refresh') })
      return
    }
    this.show(result.data)
    watch(this, [`catalog:${customerId}`], () => {
      if (!this.data.saving) this.setData({ realtime: copy.screen.realtime.editing })
    })
  },
  show(catalog: Catalog) {
    const rows = rowsOfCatalog(catalog)
    this.setData({ rows, initial: rows, realtime: '' })
    markChanged(this, false)
  },
  async onCustomer(event: DetailEvent<string>): Promise<void> {
    const changed = isChanged(this.data.initial, this.data.rows)
    if (await confirmLeave(this, changed)) await this.select(event.detail)
  },
  setRows(rows: DirectoryRow[]) {
    this.setData({ rows, formError: '', rowErrors: {} })
    markChanged(this, isChanged(this.data.initial, rows))
  },
  patch(productId: string, patch: Partial<DirectoryRow>) {
    this.setRows(
      this.data.rows.map((row) => (row.productId === productId ? { ...row, ...patch } : row)),
    )
  },
  onPrice(event: RowEvent<string>) {
    this.patch(event.currentTarget.dataset.key, { priceText: event.detail })
  },
  onEnabled(event: RowEvent<boolean>) {
    this.patch(event.currentTarget.dataset.key, { enabled: event.detail })
  },
  onOpenPick() {
    this.setData({ pickSheet: true, picks: addableOf(this.products, this.data.rows) })
  },
  onClosePick() {
    this.setData({ pickSheet: false })
  },
  onPick(event: KeyEvent) {
    const product = this.products.find((p) => p.id === event.currentTarget.dataset.key)
    this.setData({ pickSheet: false })
    if (product) this.setRows([...this.data.rows, rowOfProduct(product)])
  },
  onRealtime() {
    void this.select(this.data.customerId)
  },
  async onSave(): Promise<void> {
    const checked = checkSave(this.data.initial, this.data.rows)
    if (!checked.ok) {
      this.setData({ rowErrors: checked.errors, formError: checked.message })
      return
    }
    this.setData({ saving: true, formError: '' })
    const input = { params: { customerId: this.data.customerId }, body: checked.body }
    const result = await request(contract.saveCatalog, input)
    this.setData({ saving: false })
    if (result.ok) {
      this.show(result.data)
      showSuccess(copy.action.saved)
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'stale') {
      this.show(view.latest as Catalog)
      this.setData({ formError: view.message })
    } else if (view?.kind === 'page') this.setData({ failure: view })
    else if (view) this.setData({ formError: view.message })
  },
  onFailureAction() {
    void this.load()
  },
})
