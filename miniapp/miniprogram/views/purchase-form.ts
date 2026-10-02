import { contract, copy, labels, type InviteDetail, type PoDetail } from '@huazhong/shared'
import { canDo } from '../core/actions'
import type { DetailEvent, KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { formTotalOf } from '../core/form'
import { isChanged, syncUnloadAlert } from '../core/guard'
import { unwatch, watchNewer } from '../core/live'
import { newIdempotencyKey, request, type Failure } from '../core/request'
import { failureOf, messageOf } from '../core/session'
import { showSuccess } from '../core/toast'
import { materialPickOf, poViewOf } from './purchase'
import { inviteViewOf, openInvitePo } from './invite-detail'
import { loadInventory, loadMaterials, loadSuppliers, loadSupplyMaterials } from './purchase-load'
import {
  blankPurchaseForm,
  checkPurchaseForm,
  inviteFormOf,
  poFormOf,
  purchaseAmount,
  purchaseLineOf,
  purchaseLineViews,
  purchaseErrorOf,
  purchaseSuccessOf,
  purchaseTitles,
  type MaterialOption,
  type PurchaseDraft,
  type PurchaseForm,
  type PurchaseMode,
} from './purchase-form-data'

const data = {
  mode: 'po' as PurchaseMode,
  title: '',
  submitText: '',
  loaded: false,
  changed: false,
  failure: null as FailureView | null,
  formError: '',
  fields: {} as Record<string, string>,
  realtime: '',
  saving: false,
  editing: false,
  form: blankPurchaseForm(),
  initial: blankPurchaseForm(),
  lineViews: [] as ReturnType<typeof purchaseLineViews>,
  supplierOptions: [] as { id: string; name: string }[],
  supplierName: '',
  canChangeSupplier: true,
  editable: true,
  lockedReason: '',
  amount: '',
  pickSheet: false,
  picks: [] as ReturnType<typeof materialPickOf>[],
  inviteView: null as ReturnType<typeof inviteViewOf> | null,
  poView: null as ReturnType<typeof poViewOf> | null,
  texts: {
    ...copy.screen.label,
    lines: copy.screen.section.materials,
    add: copy.screen.action.addMaterial,
    pickTitle: copy.screen.title.pickMaterial,
    noPick: copy.state.empty(copy.screen.empty.addableMaterials),
    note: copy.field.note,
    supplierPlaceholder: copy.screen.supplierPlaceholder,
  },
}
interface Host {
  data: typeof data
  id: string
  key: string
  po: PoDetail | null
  invite: InviteDetail | null
  materials: MaterialOption[]
  draft: PurchaseDraft | null
  setData(patch: Record<string, unknown>): void
  getOpenerEventChannel(): {
    on?: (event: string, fn: (draft: PurchaseDraft) => void) => void
    emit?: (event: string, data: unknown) => void
  }
  load(): Promise<void>
  loadChoices(): Promise<boolean>
  loadStock(): Promise<boolean>
  loadDetail(preserve?: boolean): Promise<boolean>
  loadPo(preserve: boolean): Promise<boolean>
  loadInvite(preserve: boolean): Promise<boolean>
  render(form: PurchaseForm, initial?: boolean): void
  update(patch: Partial<PurchaseForm>): void
  fail(failure: Failure): Promise<void>
  save(body: unknown): Promise<void>
  saveSupply(body: unknown): Promise<void>
}
const methods = {
  id: '',
  key: '',
  po: null as PoDetail | null,
  invite: null as InviteDetail | null,
  materials: [] as MaterialOption[],
  draft: null as PurchaseDraft | null,
  onLoad(this: Host, query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.key = newIdempotencyKey()
    this.setData({ ...purchaseTitles(this.data.mode, !!this.id), editing: !!this.id })
    if (this.data.mode === 'supply')
      this.setData({ texts: { ...this.data.texts, add: copy.screen.action.extraMaterial } })
    this.getOpenerEventChannel().on?.('selection', (draft) => {
      this.draft = draft
      if (this.data.loaded) this.render({ ...blankPurchaseForm(), ...draft }, true)
    })
    void this.load()
  },
  onShow(this: Host) {
    if (!this.id) return
    const topic =
      this.data.mode === 'po' ? (`po:${this.id}` as const) : (`invite:${this.id}` as const)
    watchNewer(
      this,
      topic,
      () => this.po?.version ?? this.invite?.version,
      () => void this.loadDetail(true),
    )
    if (this.data.loaded) void this.loadDetail(true)
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
    syncUnloadAlert(false)
  },
  async load(this: Host) {
    if (!(await this.loadChoices())) return
    if (this.id && !(await this.loadDetail())) return
    this.setData({ loaded: true, failure: null, realtime: '' })
    if (!this.id) {
      this.render({ ...blankPurchaseForm(), ...this.draft }, true)
      this.setData({
        supplierName:
          this.data.supplierOptions.find((s) => s.id === this.data.form.supplierId)?.name ?? '',
      })
    }
  },
  async loadChoices(this: Host) {
    if (this.data.mode === 'supply') {
      const result = await loadSupplyMaterials()
      if (!result.ok) {
        this.setData({ failure: failureOf(result.failure, 'load') })
        return false
      }
      this.materials = result.data
      return true
    }
    const materials = await loadMaterials()
    const suppliers = await loadSuppliers({
      enabled: 'true',
      ...(this.data.mode === 'invite' ? { hasAccount: 'true' as const } : {}),
    })
    if (!materials.ok || !suppliers.ok) {
      const failure = !materials.ok ? materials.failure : !suppliers.ok ? suppliers.failure : null
      if (failure) this.setData({ failure: failureOf(failure, 'load') })
      return false
    }
    this.materials = materials.data
    this.setData({ supplierOptions: suppliers.data.map((s) => ({ id: s.id, name: s.name })) })
    return this.data.mode !== 'invite' || (await this.loadStock())
  },
  async loadStock(this: Host) {
    const stock = await loadInventory()
    if (!stock.ok) {
      this.setData({ failure: failureOf(stock.failure, 'load') })
      return false
    }
    this.materials = this.materials.map((m) => ({
      ...m,
      stockQty: stock.data.find((s) => s.id === m.id)?.stockQty ?? 0,
    }))
    return true
  },
  async loadDetail(this: Host, preserve = false) {
    return this.data.mode === 'po' ? this.loadPo(preserve) : this.loadInvite(preserve)
  },
  async loadPo(this: Host, preserve: boolean) {
    const result = await request(contract.getPurchaseOrder, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return false
    }
    const editable = canDo(result.data.actions, 'editPo')
    this.setData({
      supplierName: result.data.supplierName,
      canChangeSupplier: canDo(result.data.actions, 'changeSupplier'),
      editable,
      lockedReason: result.data.lockedReason ?? labels.poStatus[result.data.status],
      poView: poViewOf(result.data),
    })
    if (preserve && editable) {
      if (this.po?.version !== result.data.version)
        this.setData({ realtime: copy.screen.realtime.editing })
      return true
    }
    this.po = result.data
    this.render(poFormOf(result.data, this.data.form.reason), true)
    return true
  },
  async loadInvite(this: Host, preserve: boolean) {
    const endpoint = this.data.mode === 'supply' ? contract.supplierInvite : contract.getInvite
    const result = await request(endpoint, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return false
    }
    const editable = canDo(
      result.data.actions,
      this.data.mode === 'supply' ? 'submitSupply' : 'editInvite',
    )
    if (preserve && editable) {
      if (this.invite?.version !== result.data.version)
        this.setData({
          realtime:
            this.data.mode === 'supply' ? copy.screen.supplyEdited : copy.screen.realtime.editing,
        })
      if (this.data.mode === 'supply') {
        const enabled = new Set(this.materials.map((material) => material.id))
        this.render({
          ...this.data.form,
          lines: this.data.form.lines.map((line) => ({ ...line, enabled: enabled.has(line.id) })),
        })
      }
      return true
    }
    this.invite = result.data
    this.setData({
      supplierName: result.data.supplierName,
      canChangeSupplier: false,
      editable,
      inviteView: inviteViewOf(result.data),
    })
    this.render(inviteFormOf(result.data), true)
    return true
  },
  render(this: Host, form: PurchaseForm, initial = false) {
    if (this.data.mode === 'invite')
      form = {
        ...form,
        lines: form.lines.map((l) => ({
          ...l,
          stockQty: this.materials.find((m) => m.id === l.id)?.stockQty ?? 0,
        })),
      }
    const base = initial ? form : this.data.initial
    const changed = isChanged(base, form)
    this.setData({
      form,
      initial: base,
      changed,
      lineViews: purchaseLineViews(form.lines, this.data.mode, this.data.fields),
      amount: formTotalOf(purchaseAmount(form.lines), form.lines),
    })
    syncUnloadAlert(changed)
  },
  update(this: Host, patch: Partial<PurchaseForm>) {
    this.setData({ fields: {}, formError: '' })
    this.render({ ...this.data.form, ...patch })
  },
  onSupplier(this: Host, event: DetailEvent<string>) {
    this.update({ supplierId: event.detail })
  },
  onNote(this: Host, event: DetailEvent<string>) {
    this.update({ note: event.detail })
  },
  onReason(this: Host, event: DetailEvent<string>) {
    this.update({ reason: event.detail })
  },
  onQty(this: Host, event: DetailEvent<{ index: number; qty: number }>) {
    this.update({
      lines: this.data.form.lines.map((l, i) =>
        i === event.detail.index ? { ...l, qty: event.detail.qty } : l,
      ),
    })
  },
  onPrice(this: Host, event: DetailEvent<{ index: number; text: string }>) {
    this.update({
      lines: this.data.form.lines.map((l, i) =>
        i === event.detail.index ? { ...l, priceText: event.detail.text } : l,
      ),
    })
  },
  onRemove(this: Host, event: DetailEvent<number>) {
    this.update({ lines: this.data.form.lines.filter((_, i) => i !== event.detail) })
  },
  onOpenPick(this: Host) {
    const added = new Set(this.data.form.lines.map((l) => l.id))
    this.setData({
      pickSheet: true,
      picks: this.materials.filter((m) => !added.has(m.id)).map(materialPickOf),
    })
  },
  onClosePick(this: Host) {
    this.setData({ pickSheet: false })
  },
  onPick(this: Host, event: KeyEvent) {
    const material = this.materials.find((m) => m.id === event.currentTarget.dataset.key)
    this.setData({ pickSheet: false })
    if (material) this.update({ lines: [...this.data.form.lines, purchaseLineOf(material)] })
  },
  async onSubmit(this: Host) {
    if (this.data.mode === 'supply' && this.data.form.lines.some((line) => !line.enabled)) {
      this.setData({ fields: {}, formError: copy.finance.inviteMaterialDisabled })
      return
    }
    const version = this.po?.version ?? this.invite?.version ?? null
    const checked = checkPurchaseForm(this.data.form, this.data.mode, version)
    if (!checked.ok) {
      this.setData({
        fields: checked.fields,
        formError: purchaseErrorOf(checked.fields),
      })
      this.render(this.data.form)
      return
    }
    this.setData({ saving: true, formError: '' })
    await this.save(checked.body)
    this.setData({ saving: false })
  },
  async save(this: Host, body: unknown) {
    const params = { id: this.id },
      options = { idempotencyKey: this.key }
    if (this.data.mode === 'supply') {
      await this.saveSupply(body)
      return
    }
    const result =
      this.data.mode === 'po'
        ? this.id
          ? await request(contract.updatePurchaseOrder, {
              params,
              body: contract.updatePurchaseOrder.body.parse(body),
            })
          : await request(
              contract.createPurchaseOrder,
              { body: contract.createPurchaseOrder.body.parse(body) },
              options,
            )
        : this.id
          ? await request(contract.updateInvite, {
              params,
              body: contract.updateInvite.body.parse(body),
            })
          : await request(
              contract.createInvite,
              { body: contract.createInvite.body.parse(body) },
              options,
            )
    if (!result.ok) {
      await this.fail(result.failure)
      return
    }
    syncUnloadAlert(false)
    this.setData({ changed: false })
    if (this.data.mode === 'invite')
      this.getOpenerEventChannel().emit?.('saved', { id: result.data.id })
    showSuccess(purchaseSuccessOf(this.data.mode, !!this.id, this.data.supplierName))
    void wx.navigateBack()
  },
  async saveSupply(this: Host, body: unknown) {
    const result = await request(
      contract.submitSupplierInvite,
      { params: { id: this.id }, body: contract.submitSupplierInvite.body.parse(body) },
      { idempotencyKey: this.key },
    )
    if (!result.ok) {
      await this.fail(result.failure)
      return
    }
    this.invite = result.data.invite
    await this.load()
    showSuccess(labels.inviteStatus.submitted)
  },
  async fail(this: Host, failure: Failure) {
    const view = failureOf(failure, 'submit')
    if (!view) return
    if (view.kind === 'page') this.setData({ failure: view })
    else {
      if (view.kind === 'stale') await this.load()
      this.setData({
        formError: view.kind === 'fields' ? purchaseErrorOf(view.fields) : messageOf(view),
        fields: view.kind === 'fields' ? view.fields : {},
      })
      this.render(this.data.form)
    }
  },
  onRealtime(this: Host) {
    void this.load()
  },
  onFailureAction(this: Host) {
    void this.load()
  },
  onPo(this: Host) {
    openInvitePo(this.invite, this.data.mode === 'supply')
  },
}
export const purchaseFormPage = { ...methods, data }
