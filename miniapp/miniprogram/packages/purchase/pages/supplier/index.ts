import { contract, copy, type Supplier } from '@huazhong/shared'
import type { Failure } from '../../../../core/request'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { checkedOf, unplacedErrorOf } from '../../../../core/form'
import { isChanged, syncUnloadAlert } from '../../../../core/guard'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'

function blank() {
  return {
    name: '',
    contact: '',
    phone: '',
    address: '',
    enabled: true,
    account: { enabled: false, loginPhone: '' },
  }
}
function formOf(s: Supplier) {
  return {
    name: s.name,
    contact: s.contact,
    phone: s.phone,
    address: s.address,
    enabled: s.enabled,
    account: { enabled: s.account.enabled, loginPhone: s.account.loginPhone },
  }
}
const DEFAULT_TITLE: string = copy.screen.title.createSupplier
Page({
  data: {
    title: DEFAULT_TITLE,
    supplierId: '',
    loaded: false,
    failure: null as FailureView | null,
    form: blank(),
    initial: blank(),
    changed: false,
    fields: {},
    error: '',
    saving: false,
    texts: {
      ...copy.field,
      ...copy.screen.label,
      phone: copy.field.storePhone,
      enabled: copy.statusValue.enabled,
      save: copy.screen.action.saveSupplier,
      orders: copy.screen.title.purchaseOrders,
      invites: copy.screen.title.invites,
    },
  },
  supplier: null as Supplier | null,
  id: '',
  key: '',
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.setData({ supplierId: this.id })
    this.key = newIdempotencyKey()
    if (this.id) this.setData({ title: copy.screen.title.editSupplier })
    void this.load()
  },
  onUnload() {
    syncUnloadAlert(false)
  },
  async load() {
    if (!this.id) {
      this.setData({ loaded: true })
      return
    }
    const result = await request(contract.getSupplier, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    this.supplier = result.data
    const form = formOf(result.data)
    this.setData({ loaded: true, failure: null, form, initial: form, changed: false })
    syncUnloadAlert(false)
  },
  onOrders() {
    void wx.navigateTo({ url: `/packages/purchase/pages/orders/index?supplierId=${this.id}` })
  },
  onInvites() {
    void wx.navigateTo({
      url: `/packages/purchase/pages/demand/index?tab=invites&supplierId=${this.id}`,
    })
  },
  onFailureAction() {
    void this.load()
  },
  update(patch: Partial<ReturnType<typeof blank>>) {
    const form = { ...this.data.form, ...patch },
      changed = isChanged(this.data.initial, form)
    this.setData({ form, changed, fields: {}, error: '' })
    syncUnloadAlert(changed)
  },
  onText(event: DetailEvent<string, { field: 'name' | 'contact' | 'phone' | 'address' }>) {
    this.update({ [event.currentTarget.dataset.field]: event.detail })
  },
  onEnabled(event: DetailEvent<boolean>) {
    this.update({ enabled: event.detail })
  },
  onAccount(event: DetailEvent<boolean>) {
    this.update({ account: { ...this.data.form.account, enabled: event.detail } })
  },
  onLoginPhone(event: DetailEvent<string>) {
    this.update({ account: { ...this.data.form.account, loginPhone: event.detail } })
  },
  async onSave() {
    const input = {
      ...this.data.form,
      ...(this.supplier ? { version: this.supplier.version } : {}),
    }
    const parsed = this.supplier
      ? contract.updateSupplier.body.safeParse(input)
      : contract.createSupplier.body.safeParse(input)
    const checked = checkedOf(parsed)
    if (!checked.ok) {
      this.setData({
        fields: checked.fields,
        error: unplacedErrorOf(checked.fields, [
          'name',
          'contact',
          'phone',
          'address',
          'account.loginPhone',
        ]),
      })
      return
    }
    this.setData({ saving: true, error: '' })
    const result = this.supplier
      ? await request(contract.updateSupplier, {
          params: { id: this.supplier.id },
          body: contract.updateSupplier.body.parse(checked.body),
        })
      : await request(contract.createSupplier, { body: checked.body }, { idempotencyKey: this.key })
    this.setData({ saving: false })
    if (result.ok) {
      syncUnloadAlert(false)
      this.setData({ changed: false })
      void wx.navigateBack()
      showSuccess(copy.action.saved)
      return
    }
    this.showFailure(result.failure)
  },
  showFailure(failure: Failure) {
    const view = failureOf(failure, 'submit')
    if (!view) return
    if (view.kind === 'page') this.setData({ failure: view })
    else {
      if (view.kind === 'stale') {
        this.supplier = view.latest as Supplier
        const form = formOf(this.supplier)
        this.setData({ form, initial: form, changed: false })
        syncUnloadAlert(false)
      }
      this.setData({
        error:
          view.kind === 'fields'
            ? unplacedErrorOf(view.fields, [
                'name',
                'contact',
                'phone',
                'address',
                'account.loginPhone',
              ])
            : messageOf(view),
        fields: view.kind === 'fields' ? view.fields : {},
      })
    }
  },
})
