import {
  contract,
  copy,
  redesignCopy,
  labels,
  type InviteDetail,
  type PoDetail,
  type OutputOf,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { isChanged, syncUnloadAlert } from '../core/guard'
import { unwatch, watch, watchNewer } from '../core/live'
import { newIdempotencyKey, request, type Failure } from '../core/request'
import { failureOf, messageOf } from '../core/session'
import { showSuccess } from '../core/toast'
import { materialPickOf, type poViewOf } from './purchase'
import {
  reviewDraft,
  purchaseReviewData,
  purchaseReviewMethods,
  purchaseReviewTexts,
} from './purchase-review'
import { submitPurchase } from './purchase-submit'
import { purchaseFormDetails } from './purchase-form-detail'
import type { Checked } from '../core/form'
import type { inviteViewOf } from './invite-detail'
import {
  loadInventory,
  loadPendingInvites,
  loadMaterials,
  loadSuppliers,
  loadSupplyMaterials,
} from './purchase-load'
import {
  blankPurchaseForm,
  checkPurchaseForm,
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
  supplierEditing: false,
  title: '',
  submitText: '',
  loaded: false,
  changed: false,
  failure: null as FailureView | null,
  formError: '',
  fields: {} as Record<string, string>,
  realtime: '',
  saving: false,
  reviewing: false,
  ...purchaseReviewData,
  editing: false,
  form: blankPurchaseForm(),
  initial: blankPurchaseForm(),
  lineViews: [] as ReturnType<typeof purchaseLineViews>,
  supplierOptions: [] as { id: string; name: string }[],
  supplierName: '',
  canChangeSupplier: true,
  editable: true,
  lockedReason: '',
  pickSheet: false,
  editKey: '',
  picks: [] as ReturnType<typeof materialPickOf>[],
  inviteView: null as ReturnType<typeof inviteViewOf> | null,
  poView: null as ReturnType<typeof poViewOf> | null,
  texts: {
    ...copy.screen.label,
    separator: copy.separator,
    no: redesignCopy.no,
    lines: copy.screen.section.materials,
    add: copy.screen.action.addMaterial,
    pickTitle: copy.screen.title.pickMaterial,
    noPick: copy.state.empty(copy.screen.empty.addableMaterials),
    note: copy.field.note,
    supplierPlaceholder: copy.screen.supplierPlaceholder,
    ...purchaseReviewTexts,
    inviteTitle: copy.screen.title.invite,
    reasonOptional: copy.placeholder.optional,
  },
}
export interface PurchaseFormHost {
  data: typeof data
  id: string
  key: string
  po: PoDetail | null
  invite: InviteDetail | null
  pendingMaterialNames: string[]
  loadInviteWarnings(): Promise<boolean>
  materials: MaterialOption[]
  draft: PurchaseDraft | null
  setData(patch: Record<string, unknown>): void
  selectComponent(selector: string): unknown
  getOpenerEventChannel(): {
    on?: (event: string, fn: (draft: PurchaseDraft) => void) => void
    emit?: (event: string, data: unknown) => void
  }
  load(preserve?: boolean): Promise<void>
  loadChoices(): Promise<boolean>
  loadInternalChoices(): Promise<boolean>
  loadExternalMaterials(): Promise<boolean>
  loadStock(): Promise<boolean>
  loadDetail(preserve?: boolean): Promise<boolean>
  loadPo(preserve: boolean): Promise<boolean>
  loadInvite(preserve: boolean): Promise<boolean>
  render(form: PurchaseForm, initial?: boolean): void
  update(patch: Partial<PurchaseForm>): void
  fail(failure: Failure): Promise<void>
  save(body: unknown): Promise<void>
  prepare(): Promise<Checked<unknown> | null>
  saveSupply(body: unknown): Promise<void>
  reviewResolve: ((confirmed: boolean) => void) | null
  confirmReview(review: OutputOf<typeof contract.reviewPurchase>): Promise<boolean>
}
type Host = PurchaseFormHost
const methods = {
  ...purchaseFormDetails,
  ...purchaseReviewMethods,
  id: '',
  key: '',
  po: null as PoDetail | null,
  invite: null as InviteDetail | null,
  materials: [] as MaterialOption[],
  pendingMaterialNames: [] as string[],
  draft: null as PurchaseDraft | null,
  onLoad(this: Host, query: Record<string, string | undefined>) {
    if (query.poId && this.data.mode === 'supply')
      this.setData({ mode: 'po', supplierEditing: true })
    this.id = query.poId ?? query.id ?? ''
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
    if (!this.id) {
      watch(this, ['demand'], () => {
        this.setData({ realtime: copy.screen.realtime.editing })
      })
      return
    }
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
  onUnload(this: Host) {
    this.reviewResolve?.(false)
    unwatch(this)
    syncUnloadAlert(false)
  },
  async load(this: Host, preserve = this.data.changed) {
    if (!(await this.loadChoices())) return
    if (this.id && !(await this.loadDetail(preserve))) return
    this.setData({ loaded: true, failure: null, realtime: '' })
    if (!this.id && !this.data.changed) {
      this.render({ ...blankPurchaseForm(), ...this.draft }, true)
      this.setData({
        supplierName:
          this.data.supplierOptions.find((s) => s.id === this.data.form.supplierId)?.name ?? '',
      })
    }
  },
  async loadChoices(this: Host) {
    if (this.data.mode === 'supply' || this.data.supplierEditing)
      return this.loadExternalMaterials()
    if (!(await this.loadInternalChoices())) return false
    if (!this.id && !(await this.loadInviteWarnings())) return false
    return this.data.mode !== 'invite' || (await this.loadStock())
  },
  async loadInternalChoices(this: Host) {
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
    return true
  },
  async loadInviteWarnings(this: Host) {
    const result = await loadPendingInvites()
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return false
    }
    this.pendingMaterialNames = result.data.flatMap((invite) => invite.materialNames)
    return true
  },
  async loadExternalMaterials(this: Host) {
    const result = await loadSupplyMaterials()
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return false
    }
    this.materials = result.data
    return true
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
  render(this: Host, form: PurchaseForm, initial = false) {
    form = {
      ...form,
      lines: form.lines.map((line) => {
        const code = this.materials.find((material) => material.id === line.id)?.code
        return code === undefined ? line : { ...line, code }
      }),
    }
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
      lineViews: purchaseLineViews(form.lines, this.data.mode, this.data.fields).map((line) => ({
        ...line,
        notice: this.pendingMaterialNames.includes(line.name) ? copy.screen.invitedPending : '',
      })),
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
      editKey: '',
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
    if (material) {
      this.update({ lines: [...this.data.form.lines, purchaseLineOf(material)] })
      this.setData({ editKey: material.id })
    }
  },
  async prepare(this: Host): Promise<Checked<unknown> | null> {
    const version = this.po?.version ?? this.invite?.version ?? null
    const options = {
      reviewToken: 'pending-review',
      demandContext: this.draft?.demandContext,
      supplierEditing: this.data.supplierEditing,
    }
    const preliminary = checkPurchaseForm(this.data.form, this.data.mode, version, options)
    if (!preliminary.ok || version !== null || this.data.mode === 'supply') return preliminary
    const reviewToken = await reviewDraft(this, this.data.mode, options.demandContext)
    if (!reviewToken) return null
    return checkPurchaseForm(this.data.form, this.data.mode, version, { ...options, reviewToken })
  },
  async onSubmit(this: Host) {
    if (this.data.saving || this.data.reviewing || this.data.reviewSheet) return
    if (this.data.mode === 'supply' && this.data.form.lines.some((line) => !line.enabled)) {
      this.setData({ fields: {}, formError: copy.finance.inviteMaterialDisabled })
      return
    }
    const checked = await this.prepare()
    if (!checked) return
    if (!checked.ok) {
      this.setData({ fields: checked.fields, formError: purchaseErrorOf(checked.fields) })
      this.render(this.data.form)
      return
    }
    this.setData({ saving: true, formError: '' })
    await this.save(checked.body)
    this.setData({ saving: false })
  },
  async save(this: Host, body: unknown) {
    if (this.data.mode === 'supply') {
      await this.saveSupply(body)
      return
    }
    const result = await submitPurchase({
      mode: this.data.mode,
      id: this.id,
      body,
      key: this.key,
      supplierEditing: this.data.supplierEditing,
    })
    if (!result.ok) {
      await this.fail(result.failure)
      return
    }
    syncUnloadAlert(false)
    this.setData({ changed: false })
    showSuccess(purchaseSuccessOf(this.data.mode, !!this.id, this.data.supplierName))
    if (this.data.mode === 'invite') {
      this.getOpenerEventChannel().emit?.('saved', { id: result.data.id })
      void wx.navigateBack()
      return
    }
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
      if (view.kind === 'stale' && this.id) await this.load()
      this.setData({
        formError: view.kind === 'fields' ? purchaseErrorOf(view.fields) : messageOf(view),
        fields: view.kind === 'fields' ? view.fields : {},
      })
      this.render(this.data.form)
    }
  },
}
export const purchaseFormPage = { ...methods, data }
