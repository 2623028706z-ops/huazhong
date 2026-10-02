import { contract, copy, type Supplier } from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import type { Failure } from '../../../../core/request'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import { checkedOf, unplacedErrorOf } from '../../../../core/form'
import { isChanged, syncUnloadAlert } from '../../../../core/guard'
import type { PagedList } from '../../../../core/list'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { listHandlers, listOf, showList } from '../../../../views/list'

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
function rowOf(s: Supplier) {
  return {
    id: s.id,
    title: s.name,
    total: s.contact,
    meta: s.enabled ? s.phone : copy.screen.openPoCount(s.openPoCount),
    tags: s.enabled ? [] : [{ text: copy.tag.disabled, warn: false }],
  }
}
Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.suppliers,
    filter: emptyFilter,
    rows: [] as ReturnType<typeof rowOf>[],
    loaded: false,
    canCreate: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.suppliers,
    allLoaded: copy.state.allLoaded,
    dimensions: [
      {
        key: 'enabled',
        label: copy.field.status,
        options: [
          { id: 'true', name: copy.statusValue.enabled },
          { id: 'false', name: copy.statusValue.disabled },
        ],
      },
    ],
    sheet: false,
    sheetTitle: '',
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
      create: copy.screen.title.createSupplier,
      save: copy.screen.action.saveSupplier,
      search: copy.filter.search(copy.screen.title.suppliers),
    },
  },
  list: null as PagedList<Supplier> | null,
  supplier: null as Supplier | null,
  key: '',
  onLoad() {
    this.list = listOf(
      this,
      async (cursor) => {
        const result = await request(contract.listSuppliers, {
          query: {
            cursor,
            q: this.data.filter.keyword,
            enabled: this.data.filter.picks.enabled as 'true' | 'false' | undefined,
          },
        })
        if (result.ok) this.setData({ canCreate: canDo(result.data.actions, 'create') })
        return result
      },
      rowOf,
    )
  },
  onShow() {
    showList(this, ['todo:purchase'])
  },
  onUnload() {
    listHandlers.onUnload.call(this)
    syncUnloadAlert(false)
  },
  onCreate() {
    this.supplier = null
    this.key = newIdempotencyKey()
    const form = blank()
    this.setData({
      sheet: true,
      sheetTitle: copy.screen.title.createSupplier,
      form,
      initial: form,
      error: '',
      fields: {},
      changed: false,
    })
  },
  async onOpen(event: KeyEvent) {
    const result = await request(contract.getSupplier, {
      params: { id: event.currentTarget.dataset.key },
    })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'refresh') })
      return
    }
    this.supplier = result.data
    const form = formOf(result.data)
    this.setData({
      sheet: true,
      sheetTitle: copy.screen.title.editSupplier,
      form,
      initial: form,
      error: '',
      fields: {},
      changed: false,
    })
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
  onClose() {
    this.setData({ sheet: false, changed: false })
    syncUnloadAlert(false)
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
      this.onClose()
      showSuccess(copy.action.saved)
      void this.list?.refresh()
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
