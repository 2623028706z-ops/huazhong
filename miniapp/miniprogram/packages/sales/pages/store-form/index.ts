import { contract, copy, formatTime, type StoreItem } from '@huazhong/shared'
import { findAction, hasAction } from '../../../../core/actions'
import type { DetailEvent } from '../../../../core/events'
import { unplacedErrorOf } from '../../../../core/form'
import type { FailureView } from '../../../../core/failure-view'
import { confirmAsk, isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { unwatch, watch } from '../../../../core/live'
import { loadCustomers } from '../../../../views/customers'
import { checkStoreCreate, checkStoreUpdate, storeFormOf, type StoreForm } from '../customers/form'
interface Invite {
  path: string
  title: string
  expiresText: string
}
const DEFAULT_TITLE: string = copy.screen.title.createStore
Page({
  data: {
    title: DEFAULT_TITLE,
    loaded: false,
    changed: false,
    failure: null as FailureView | null,
    customerName: '',
    customerId: '',
    editingStore: null as StoreItem | null,
    storeForm: storeFormOf(null, ''),
    initial: storeFormOf(null, ''),
    invite: null as { enabled: boolean; reason: string } | null,
    canUnbind: false,
    shared: null as Invite | null,
    fields: {},
    formError: '',
    saving: false,
    realtime: '',
    texts: {
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
      saveStore: copy.action.saveStore,
    },
  },
  id: '',
  idempotencyKey: '',
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.idempotencyKey = newIdempotencyKey()
    this.setData({
      customerId: query.customerId ?? '',
      title: this.id ? copy.screen.title.editStore : copy.screen.title.createStore,
    })
    void wx.hideShareMenu({})
    void this.load()
  },
  onShow() {
    if (this.data.editingStore)
      watch(this, [`store_invites:${this.data.editingStore.id}`], () => {
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
    const result = await loadCustomers()
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    const customer = result.data.find((c) => c.id === this.data.customerId)
    const store = customer?.stores.find((s) => s.id === this.id) ?? null
    if (!customer || (this.id && !store)) {
      this.setData({ failure: { kind: 'page', state: 'notFound', message: copy.error.notFound } })
      return
    }
    this.setData({ loaded: true, failure: null, customerName: customer.name })
    this.openStore(store)
    if (store)
      watch(this, [`store_invites:${store.id}`], () => {
        this.setData({ realtime: copy.screen.realtime.editing })
      })
  },
  openStore(store: StoreItem | null) {
    const action = store ? findAction(store.actions, 'inviteStore') : null
    const form = storeFormOf(store, this.data.customerId)
    this.setData({
      editingStore: store,
      storeForm: form,
      initial: form,
      realtime: '',
      invite: action ? { enabled: action.enabled, reason: action.disabledReason ?? '' } : null,
      canUnbind: store ? hasAction(store.actions, 'unbindStoreWechat') : false,
    })
    markChanged(this, false)
  },
  patchStore(event: DetailEvent<string | boolean, { field: keyof StoreForm }>) {
    const form = { ...this.data.storeForm, [event.currentTarget.dataset.field]: event.detail }
    this.setData({ storeForm: form, fields: {}, formError: '' })
    markChanged(this, isChanged(this.data.initial, form))
  },
  async onSaveStore(): Promise<void> {
    const store = this.data.editingStore
    const form = this.data.storeForm
    this.setData({ saving: true })
    const result = store ? await this.updateStore(store, form) : await this.createStore(form)
    if (result) this.afterSave(result)
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
    this.setData({
      fields,
      formError: unplacedErrorOf(fields, [
        'name',
        'customerId',
        'contact',
        'phone',
        'address',
        'loginPhone',
      ]),
      saving: false,
    })
    return null
  },
  afterSave(result: Result<StoreItem>) {
    this.setData({ saving: false })
    if (result.ok) {
      markChanged(this, false)
      showSuccess(copy.action.saved)
      void wx.navigateBack()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'fields') this.showFields(view.fields)
    else if (view?.kind === 'stale') {
      this.openStore(view.latest as StoreItem)
      this.setData({ formError: view.message })
    } else if (view?.kind === 'page') this.setData({ failure: view })
    else if (view) this.setData({ formError: view.message })
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
  // 只在账号卡里的分享按钮触发（06 章第 11 节），图片用内置品牌背景
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
  },
  onFailureAction() {
    void this.load()
  },
  onRealtime() {
    void this.load()
  },
})
