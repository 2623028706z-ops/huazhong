// X8 客户门店：左侧客户，右侧门店，点一行进 X12 门店资料。订货目录是单独的入口（2026-10-05）。
// 底栏「邀请订货 / 新建门店」（2026-10-05 体验改版第 1 批，邀请订货从 X2 挪来）
import {
  contract,
  copy,
  redesignCopy,
  type Action,
  type CustomerItem,
  type StoreItem,
} from '@huazhong/shared'
import { hasAction } from '../../../../core/actions'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import { unplacedErrorOf } from '../../../../core/form'
import type { FailureView } from '../../../../core/failure-view'
import { isChanged, syncUnloadAlert } from '../../../../core/guard'
import { firstFailure, newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { unwatch, pullToRefresh } from '../../../../core/live'
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
  ...pullToRefresh,
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
    pickedStoreId: '',
    inviteSheet: false,
    inviteCustomers: [] as CustomerItem[],
    inviteStoreId: '',
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
      invite: copy.screen.action.inviteStore,
      disabled: copy.tag.disabled,
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
  sharing: null as { path: string; title: string } | null,
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
    this.show(customers.data, page.data.actions, selectId)
  },
  show(customers: CustomerItem[], actions: readonly Action[], selectId: string) {
    this.customers = customers
    const keep = selectId || this.data.customerId
    const selected = customers.find((c) => c.id === keep) ?? customers[0]
    this.setData({
      loaded: true,
      failure: null,
      side: customerSideOf(customers),
      canCreate: hasAction(actions, 'create'),
      canCreateCustomer: hasAction(actions, 'createCustomer'),
    })
    this.select(selected?.id ?? '')
  },
  select(customerId: string) {
    const customer = this.customers.find((c: CustomerItem) => c.id === customerId)
    // 换了客户，原来点选的门店不再算
    const picked = customerId === this.data.customerId ? this.data.pickedStoreId : ''
    this.setData({
      customerId,
      customerName: customer?.name ?? '',
      pickedStoreId: picked,
      stores: storeRowsOf(customer, picked),
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
  // 行首单选圈：点选一家门店，「邀请订货」就直接给这家；再点一次取消
  onPickStore(event: KeyEvent) {
    const id = event.currentTarget.dataset.key
    const picked = id === this.data.pickedStoreId ? '' : id
    this.setData({
      pickedStoreId: picked,
      stores: storeRowsOf(this.currentCustomer(), picked),
    })
  },
  // 邀请订货：弹层（hz-store-invite，同 X2 原来那个）；点选了门店时直接给这家生成邀请
  async onInvite(): Promise<void> {
    this.sharing = null
    // 绑定、手机号状态随时会变：每次打开重新取，取不到再用缓存
    const result = await loadCustomers()
    if (result.ok) this.customers = result.data
    this.setData({
      inviteSheet: true,
      inviteCustomers: this.customers,
      inviteStoreId: this.data.pickedStoreId,
    })
  },
  onCloseInvite() {
    this.setData({ inviteSheet: false })
  },
  onInvited(event: DetailEvent<{ path: string; title: string } | null>) {
    this.sharing = event.detail
  },
  // 弹层里补了登录手机号：同步页面缓存的门店
  onStoreUpdated(event: DetailEvent<StoreItem>) {
    const store = event.detail
    this.customers = this.customers.map((customer) => ({
      ...customer,
      stores: customer.stores.map((s) => (s.id === store.id ? store : s)),
    }))
  },
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const invited = this.sharing
    return invited
      ? { title: invited.title, path: invited.path, imageUrl: '/assets/backdrop.jpg' }
      : { title: copy.invite.storeTitle }
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
      const created = !this.data.editingCustomer
      this.onCloseSheet()
      showSuccess(copy.action.saved)
      void this.load(selectId)
      // 新建的客户还没有门店：保存完直接进新建门店
      if (created)
        void wx.navigateTo({
          url: `/packages/sales/pages/store-form/index?customerId=${selectId}`,
        })
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
