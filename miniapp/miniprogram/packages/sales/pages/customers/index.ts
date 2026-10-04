// X8 客户：左侧客户，右侧门店 / 订货目录；门店资料和目录产品分别进入 X12 / X13 整页。
import { contract, copy, redesignCopy, type CustomerItem } from '@huazhong/shared'
import { hasAction } from '../../../../core/actions'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import { unplacedErrorOf } from '../../../../core/form'
import type { FailureView } from '../../../../core/failure-view'
import { isChanged, syncUnloadAlert } from '../../../../core/guard'
import { firstFailure, newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { unwatch } from '../../../../core/live'
import { catalogPanelData } from './catalog-state'
import { catalogPanelMethods } from './catalog-panel'
import { catalogCopyMethods } from '../directory/catalog-copy'
import { loadCustomers } from '../../../../views/customers'
import {
  checkCustomerCreate,
  checkCustomerUpdate,
  customerFormOf,
  customerSideOf,
  storeRowsOf,
  type CustomerForm,
} from './form'

Page({
  ...catalogCopyMethods,
  ...catalogPanelMethods,
  data: {
    section: 'stores',
    sections: [
      { key: 'stores', text: redesignCopy.stores },
      { key: 'catalog', text: copy.screen.title.directory },
    ],
    catalogTitle: copy.screen.title.directory,

    ...catalogPanelData,
    title: copy.screen.label.customer,
    loaded: false,
    failure: null as FailureView | null,
    side: [] as ReturnType<typeof customerSideOf>,
    customerId: '',
    customerName: '',
    stores: [] as ReturnType<typeof storeRowsOf>,
    canCreate: false,
    canCreateCustomer: false,
    customerSheet: false,
    customerChanged: false,
    editingCustomer: false,
    customerForm: customerFormOf(null),
    fields: {},
    formError: '',
    saving: false,
    texts: {
      stores: redesignCopy.stores,
      editCustomer: copy.screen.action.editCustomer,
      createCustomer: copy.screen.action.createCustomer,
      createStore: copy.screen.action.createStore,
      customerTitle: copy.screen.title.editCustomer,
      newCustomerTitle: copy.screen.title.createCustomer,
      name: copy.screen.label.name,
      enabled: copy.screen.label.enabled,
      saveCustomer: copy.action.saveCustomer,
      empty: copy.screen.empty.customers,
      noStores: copy.state.empty(copy.screen.label.store),
    },
  },
  customers: [] as CustomerItem[],
  idempotencyKey: '',
  onLoad() {
    void wx.hideShareMenu({})
  },
  onShow() {
    void this.load()
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
    syncUnloadAlert(false)
  },
  async load(selectId = ''): Promise<void> {
    const [customers, page] = await Promise.all([
      loadCustomers(),
      request(contract.listCustomers, { query: {} }),
    ])
    if (!customers.ok || !page.ok) {
      const failure = firstFailure([customers, page])
      if (failure)
        this.setData({ failure: failureOf(failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.customers = customers.data
    const keep = selectId || this.data.customerId
    const selected = customers.data.find((c) => c.id === keep) ?? customers.data[0]
    this.setData({
      loaded: true,
      failure: null,
      side: customerSideOf(customers.data),
      canCreate: hasAction(page.data.actions, 'create'),
      canCreateCustomer: hasAction(page.data.actions, 'createCustomer'),
    })
    this.select(selected?.id ?? '')
    await this.loadCatalogPanel()
  },
  select(customerId: string) {
    const customer = this.customers.find((c: CustomerItem) => c.id === customerId)
    this.setData({
      customerId,
      customerName: customer?.name ?? '',
      stores: storeRowsOf(customer),
      groups: [],
    })
  },
  onCustomer(event: DetailEvent<string>) {
    this.select(event.detail)
    void this.selectCatalog(event.detail)
  },
  onSection(event: DetailEvent<string>) {
    this.setData({ section: event.detail })
  },
  currentCustomer(): CustomerItem | undefined {
    return this.customers.find((c: CustomerItem) => c.id === this.data.customerId)
  },
  resetForm() {
    this.idempotencyKey = newIdempotencyKey()
    this.setData({ fields: {}, formError: '', customerChanged: false })
  },
  onNewCustomer() {
    this.resetForm()
    this.setData({
      customerSheet: true,
      editingCustomer: false,
      customerForm: customerFormOf(null),
    })
  },
  onEditCustomer() {
    this.resetForm()
    const form = customerFormOf(this.currentCustomer() ?? null)
    this.setData({ customerSheet: true, editingCustomer: true, customerForm: form })
  },
  onNewStore() {
    void wx.navigateTo({
      url: `/packages/sales/pages/store-form/index?customerId=${this.data.customerId}`,
    })
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/sales/pages/store-form/index?customerId=${this.data.customerId}&id=${event.currentTarget.dataset.key}`,
    })
  },
  onCloseSheet() {
    this.setData({ customerSheet: false, customerChanged: false })
    syncUnloadAlert(false)
  },
  patchCustomer(patch: Partial<CustomerForm>) {
    const form = { ...this.data.customerForm, ...patch }
    const initial = customerFormOf(
      this.data.editingCustomer ? (this.currentCustomer() ?? null) : null,
    )
    const customerChanged = isChanged(initial, form)
    this.setData({ customerForm: form, fields: {}, formError: '', customerChanged })
    syncUnloadAlert(customerChanged)
  },
  onCustomerName(event: DetailEvent<string>) {
    this.patchCustomer({ name: event.detail })
  },
  onCustomerEnabled(event: DetailEvent<boolean>) {
    this.patchCustomer({ enabled: event.detail })
  },
  async onSaveCustomer(): Promise<void> {
    const customer = this.data.editingCustomer ? this.currentCustomer() : undefined
    const form = this.data.customerForm
    const checked = customer
      ? checkCustomerUpdate(form, customer.version)
      : checkCustomerCreate(form)
    if (!checked.ok) {
      this.showFields(checked.fields)
      return
    }
    this.setData({ saving: true })
    const result = customer
      ? await request(contract.updateCustomer, {
          params: { id: customer.id },
          body: { ...form, version: customer.version },
        })
      : await request(
          contract.createCustomer,
          { body: form },
          { idempotencyKey: this.idempotencyKey },
        )
    this.afterSave(result, result.ok ? result.data.id : '')
  },
  showFields(fields: Record<string, string>): null {
    this.setData({ fields, formError: unplacedErrorOf(fields, ['name']), saving: false })
    return null
  },
  afterSave(result: Result<unknown>, selectId: string) {
    this.setData({ saving: false })
    if (result.ok) {
      this.onCloseSheet()
      showSuccess(copy.action.saved)
      void this.load(selectId)
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'fields') this.showFields(view.fields)
    else if (view?.kind === 'stale') {
      this.setData({ formError: view.message })
      void this.load()
    } else if (view) this.setData({ formError: view.message })
  },
  onFailureAction() {
    void this.load()
  },
})
