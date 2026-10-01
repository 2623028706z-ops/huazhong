// X8 客户门店（06 章 X8）：左侧客户（停用的标「已停用」）、右侧门店；右侧顶部当前客户名 +「编辑客户」。
// 底栏「新建客户」（createCustomer，次）、「新建门店」（create）。门店弹层里「邀请下单」（inviteStore）
// →「生成邀请」→ 分享卡片；「解绑微信」（unbindStoreWechat）
import { contract, copy, formatTime, type CustomerItem, type StoreItem } from '@huazhong/shared'
import { findAction, hasAction } from '../../../../core/actions'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { confirmAsk, isChanged, syncUnloadAlert } from '../../../../core/guard'
import { firstFailure, newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { loadCustomers } from '../../../../views/customers'
import {
  checkCustomerCreate,
  checkCustomerUpdate,
  checkStoreCreate,
  checkStoreUpdate,
  customerFormOf,
  customerSideOf,
  storeFormOf,
  storeRowsOf,
  type CustomerForm,
  type StoreForm,
} from './form'

interface Invite {
  path: string
  title: string
  expiresText: string
}

Page({
  data: {
    title: copy.screen.title.customers,
    loaded: false,
    failure: null as FailureView | null,
    side: [] as ReturnType<typeof customerSideOf>,
    customerId: '',
    customerName: '',
    stores: [] as ReturnType<typeof storeRowsOf>,
    canCreate: false,
    canCreateCustomer: false,
    customerSheet: false,
    editingCustomer: false,
    customerForm: customerFormOf(null),
    storeSheet: false,
    editingStore: null as StoreItem | null,
    storeForm: storeFormOf(null, ''),
    customerOptions: [] as { id: string; name: string }[],
    invite: null as { enabled: boolean; reason: string } | null,
    canUnbind: false,
    shared: null as Invite | null,
    fields: {},
    formError: '',
    saving: false,
    texts: {
      editCustomer: copy.screen.action.editCustomer,
      createCustomer: copy.screen.action.createCustomer,
      createStore: copy.screen.action.createStore,
      customerTitle: copy.screen.title.editCustomer,
      newCustomerTitle: copy.screen.title.createCustomer,
      storeTitle: copy.screen.title.editStore,
      newStoreTitle: copy.screen.title.createStore,
      name: copy.screen.label.name,
      enabled: copy.screen.label.enabled,
      customer: copy.screen.label.customer,
      contact: copy.field.contact,
      phone: copy.field.storePhone,
      address: copy.field.address,
      loginPhone: copy.screen.label.loginPhone,
      wechat: copy.field.wechat,
      bound: copy.statusValue.bound,
      invite: copy.screen.action.inviteStore,
      generate: copy.screen.action.generateInvite,
      share: copy.screen.action.shareInvite,
      unbind: copy.screen.action.unbindStoreWechat,
      save: copy.action.save,
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
  onUnload() {
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
      customerOptions: customers.data.map(({ id, name }) => ({ id, name })),
      canCreate: hasAction(page.data.actions, 'create'),
      canCreateCustomer: hasAction(page.data.actions, 'createCustomer'),
    })
    this.select(selected?.id ?? '')
  },
  select(customerId: string) {
    const customer = this.customers.find((c: CustomerItem) => c.id === customerId)
    this.setData({
      customerId,
      customerName: customer?.name ?? '',
      stores: storeRowsOf(customer),
    })
  },
  onCustomer(event: DetailEvent<string>) {
    this.select(event.detail)
  },
  currentCustomer(): CustomerItem | undefined {
    return this.customers.find((c: CustomerItem) => c.id === this.data.customerId)
  },
  resetForm() {
    this.idempotencyKey = newIdempotencyKey()
    this.setData({ fields: {}, formError: '', shared: null })
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
    this.resetForm()
    this.openStore(null)
  },
  onOpen(event: KeyEvent) {
    this.resetForm()
    const store = this.currentCustomer()?.stores.find(
      (s: StoreItem) => s.id === event.currentTarget.dataset.key,
    )
    if (store) this.openStore(store)
  },
  openStore(store: StoreItem | null) {
    const action = store ? findAction(store.actions, 'inviteStore') : null
    this.setData({
      storeSheet: true,
      editingStore: store,
      storeForm: storeFormOf(store, this.data.customerId),
      invite: action ? { enabled: action.enabled, reason: action.disabledReason ?? '' } : null,
      canUnbind: store ? hasAction(store.actions, 'unbindStoreWechat') : false,
    })
  },
  onCloseSheet() {
    this.setData({ customerSheet: false, storeSheet: false })
    syncUnloadAlert(false)
  },
  patchCustomer(patch: Partial<CustomerForm>) {
    const form = { ...this.data.customerForm, ...patch }
    this.setData({ customerForm: form, fields: {}, formError: '' })
    syncUnloadAlert(isChanged(customerFormOf(this.currentCustomer() ?? null), form))
  },
  onCustomerName(event: DetailEvent<string>) {
    this.patchCustomer({ name: event.detail })
  },
  onCustomerEnabled(event: DetailEvent<boolean>) {
    this.patchCustomer({ enabled: event.detail })
  },
  patchStore(event: DetailEvent<string | boolean, { field: keyof StoreForm }>) {
    const form = { ...this.data.storeForm, [event.currentTarget.dataset.field]: event.detail }
    this.setData({ storeForm: form, fields: {}, formError: '' })
    syncUnloadAlert(isChanged(storeFormOf(this.data.editingStore, this.data.customerId), form))
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
  async onSaveStore(): Promise<void> {
    const store = this.data.editingStore
    const form = this.data.storeForm
    this.setData({ saving: true })
    const result = store ? await this.updateStore(store, form) : await this.createStore(form)
    if (result) this.afterSave(result, this.data.customerId)
    else this.setData({ saving: false })
  },
  async createStore(form: StoreForm): Promise<Result<StoreItem> | null> {
    const checked = checkStoreCreate(form)
    if (!checked.ok) return this.showFields(checked.fields)
    const options = { idempotencyKey: this.idempotencyKey }
    return request(contract.createStore, { body: checked.body }, options)
  },
  async updateStore(store: StoreItem, form: StoreForm): Promise<Result<StoreItem> | null> {
    const checked = checkStoreUpdate(form, store.version)
    if (!checked.ok) return this.showFields(checked.fields)
    return request(contract.updateStore, { params: { id: store.id }, body: checked.body })
  },
  showFields(fields: Record<string, string>): null {
    this.setData({ fields, formError: Object.values(fields)[0] ?? '', saving: false })
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
    if (view?.kind === 'fields') this.setData({ fields: view.fields, formError: view.message })
    else if (view?.kind === 'stale') {
      this.setData({ formError: view.message })
      void this.load()
    } else if (view) this.setData({ formError: view.message })
  },
  async onGenerateInvite(): Promise<void> {
    const store = this.data.editingStore
    if (!store) return
    this.setData({ saving: true, formError: '' })
    const options = { idempotencyKey: this.idempotencyKey }
    const result = await request(contract.createStoreInvite, { params: { id: store.id } }, options)
    this.setData({ saving: false })
    if (!result.ok) {
      this.setData({ formError: failureOf(result.failure, 'submit')?.message ?? '' })
      return
    }
    const { path, title, expiresAt } = result.data
    this.setData({
      shared: { path, title, expiresText: copy.screen.inviteExpires(formatTime(expiresAt)) },
    })
  },
  // 只在弹层里的分享按钮触发（06 章第 11 节），图片用内置品牌背景
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const shared = this.data.shared
    return shared
      ? { title: shared.title, path: shared.path, imageUrl: '/assets/backdrop.jpg' }
      : { title: copy.invite.storeTitle }
  },
  async onUnbind(): Promise<void> {
    const store = this.data.editingStore
    if (store?.accountVersion == null) return
    const confirmed = await confirmAsk(this, {
      title: copy.confirm.unbindTitle,
      body: copy.screen.confirm.unbindStore,
      cancel: copy.confirm.cancel,
      confirm: copy.screen.action.unbindStoreWechat,
    })
    if (!confirmed) return
    const body = { version: store.accountVersion }
    const result = await request(contract.unbindStoreWechat, { params: { id: store.id }, body })
    if (!result.ok) {
      this.setData({ formError: failureOf(result.failure, 'submit')?.message ?? '' })
      return
    }
    this.openStore(result.data)
    showSuccess(copy.action.unbound)
    void this.load()
  },
  onFailureAction() {
    void this.load()
  },
})
