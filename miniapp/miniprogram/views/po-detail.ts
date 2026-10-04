import { contract, copy, redesignCopy, labels, type PoDetail } from '@huazhong/shared'
import { buttonsOf, canDo, type ButtonView } from '../core/actions'
import type { CodeEvent, DetailEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { checkedOf, unplacedErrorOf } from '../core/form'
import { confirmAsk, isChanged, syncUnloadAlert } from '../core/guard'
import { unwatch, watchNewer } from '../core/live'
import { centsOfText } from '../core/money'
import { request, type Result } from '../core/request'
import { failureOf, messageOf } from '../core/session'
import { showSuccess } from '../core/toast'
import { poViewOf } from './purchase'
import { receiveInputOf, receiveLinesOf, receiveViewsOf, type ReceiveLine } from './po-receive-form'

function isOldResponse(next: PoDetail, current: PoDetail | null) {
  const version = current?.version ?? 0
  return next.version < version
}
function skipsResponse(next: PoDetail, current: PoDetail | null, pushed: boolean) {
  return (
    isOldResponse(next, current) || (pushed && JSON.stringify(next) === JSON.stringify(current))
  )
}

const data = {
  kind: 'purchase' as 'purchase' | 'warehouse',
  title: copy.screen.title.purchaseOrder as string,
  loaded: false,
  failure: null as FailureView | null,
  realtime: '',
  view: null as ReturnType<typeof poViewOf> | null,
  buttons: [] as ButtonView[],
  busy: '',
  cancelSheet: false,
  cancelMode: 'cancelPo',
  cancelRequired: true,
  error: '',
  fields: {} as Record<string, string>,
  lines: [] as ReceiveLine[],
  lineViews: [] as ReturnType<typeof receiveViewsOf>,
  initial: [] as ReceiveLine[],
  changed: false,
  receiving: false,
  recvNote: '',
  reason: '',
  repriced: false,
  sheet: '' as '' | 'return' | 'reprice',
  sheetTitle: '',
  texts: {
    ...copy.screen.label,
    lines: copy.screen.section.materials,
    reject: redesignCopy.rejectPurchaseConfirm,
    confirmCancel: copy.screen.action.confirmCancel,
    cancelPo: copy.screen.action.cancelPo as string,
    receive: copy.screen.action.receive,
    confirmReturn: copy.screen.confirmReturn,
    confirmReprice: copy.screen.confirmReprice,
  },
}
interface Host {
  data: typeof data
  id: string
  financeScope: boolean
  readonlyScope: boolean
  sourceType: 'po' | 'purchase_return' | 'price_change'
  order: PoDetail | null
  setData(patch: Record<string, unknown>): void
  selectComponent(selector: string): unknown
  load(pushed?: boolean, replace?: boolean): Promise<void>
  show(po: PoDetail, recvNote?: string): void
  preserve(po: PoDetail): boolean
  render(lines: ReceiveLine[]): void
  settle(result: Result<PoDetail>, done: string): void
}
function readPurchaseOrder(host: Host) {
  return request(host.financeScope ? contract.getFinancePurchaseOrder : contract.getPurchaseOrder, {
    params: { id: host.id },
    query: { sourceType: host.sourceType },
  })
}
const methods = {
  id: '',
  financeScope: false,
  readonlyScope: false,
  sourceType: 'po' as 'po' | 'purchase_return' | 'price_change',
  order: null as PoDetail | null,
  onLoad(this: Host, query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.financeScope = query.scope === 'finance'
    this.readonlyScope = query.scope === 'internal'
    this.sourceType =
      query.sourceType === 'purchase_return' || query.sourceType === 'price_change'
        ? query.sourceType
        : 'po'
  },
  onShow(this: Host) {
    void this.load()
    watchNewer(
      this,
      `po:${this.id}`,
      () => this.order?.version,
      () => {
        void this.load(true)
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
  async load(this: Host, pushed = false, replace = false) {
    const result = await readPurchaseOrder(this)
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    const po = result.data
    // version: null 的派生通知（如自己改价引起的全账重算）重读后内容没变，不提示
    if (skipsResponse(po, this.order, pushed)) return
    if (!replace && this.preserve(po)) return
    this.show(po, replace ? this.data.recvNote : '')
    if (pushed) this.setData({ realtime: copy.screen.realtime.refreshed })
  },
  preserve(this: Host, po: PoDetail) {
    if (!this.data.changed && !this.data.sheet) return false
    if (this.order?.version === po.version) {
      this.setData({ realtime: copy.screen.realtime.editing })
      return true
    }
    if (canDo(po.actions, this.data.sheet || 'receive')) {
      this.setData({ realtime: copy.screen.realtime.editing })
      return true
    }
    this.setData({ sheet: '' })
    return false
  },
  show(this: Host, po: PoDetail, recvNote = '') {
    this.order = po
    const receiving =
      !this.readonlyScope && this.data.kind === 'warehouse' && canDo(po.actions, 'receive')
    const specs =
      this.data.kind === 'purchase'
        ? ([{ code: 'cancelPo', secondary: true }, { code: 'editPo' }] as const)
        : ([
            { code: 'return', secondary: true },
            { code: 'reprice' },
            { code: 'voidPo', secondary: true },
          ] as const)
    const lines = receiveLinesOf(po, 'receive')
    this.setData({
      loaded: true,
      failure: null,
      view: poViewOf(po, false, this.financeScope),
      buttons: this.readonlyScope ? [] : buttonsOf(po.actions, specs),
      receiving,
      initial: lines,
      recvNote,
      reason: '',
      changed: false,
      realtime: '',
      error: '',
      fields: {},
    })
    this.render(lines)
  },
  render(this: Host, lines: ReceiveLine[]) {
    const changed =
      isChanged(this.data.initial, lines) || !!this.data.reason || !!this.data.recvNote
    this.setData({
      lines,
      lineViews: receiveViewsOf(lines, this.data.receiving && !this.data.sheet, this.data.fields),
      repriced: lines.some((l) => centsOfText(l.priceText) !== l.orderPriceCents),
      changed,
    })
    syncUnloadAlert(changed)
  },
  onAction(this: Host, event: CodeEvent) {
    const code = event.currentTarget.dataset.code
    if (code === 'editPo') {
      void wx.navigateTo({ url: `/packages/purchase/pages/order-form/index?id=${this.id}` })
      return
    }
    if (code === 'cancelPo' || code === 'voidPo') {
      this.setData({
        cancelSheet: true,
        error: '',
        cancelMode: code,
        texts: {
          ...this.data.texts,
          cancelPo: code === 'voidPo' ? copy.rework.voidPurchaseOrder : copy.screen.action.cancelPo,
          confirmCancel:
            code === 'voidPo' ? copy.screen.action.confirmVoid : copy.screen.action.confirmCancel,
        },
      })
      return
    }
    if ((code === 'return' || code === 'reprice') && this.order) {
      const lines = receiveLinesOf(this.order, code)
      this.setData({
        sheet: code,
        sheetTitle: copy.screen.action[code],
        reason: '',
        error: '',
        fields: {},
        initial: lines,
      })
      this.render(lines)
    }
  },
  onQty(this: Host, event: DetailEvent<{ index: number; qty: number }>) {
    this.setData({ fields: {}, error: '' })
    this.render(
      this.data.lines.map((line, i) =>
        i === event.detail.index ? { ...line, qty: event.detail.qty } : line,
      ),
    )
  },
  onPrice(this: Host, event: DetailEvent<{ index: number; text: string }>) {
    this.setData({ fields: {}, error: '' })
    this.render(
      this.data.lines.map((line, i) =>
        i === event.detail.index ? { ...line, priceText: event.detail.text } : line,
      ),
    )
  },
  onReason(this: Host, event: DetailEvent<string>) {
    this.setData({ reason: event.detail, fields: {}, error: '' })
    this.render(this.data.lines)
  },
  onRecvNote(this: Host, event: DetailEvent<string>) {
    this.setData({ recvNote: event.detail, fields: {}, error: '' })
    this.render(this.data.lines)
  },
  onCloseCancel(this: Host) {
    this.setData({ cancelSheet: false, error: '' })
  },
  onCloseSheet(this: Host) {
    this.setData({ sheet: '', changed: false })
    syncUnloadAlert(false)
    if (this.order) this.show(this.order)
  },
  async onCancel(this: Host, event: DetailEvent<string>) {
    if (!this.order || this.data.busy) return
    this.setData({ busy: 'cancelPo', error: '' })
    const result = await request(
      this.data.cancelMode === 'voidPo' ? contract.voidPurchaseOrder : contract.cancelPurchaseOrder,
      {
        params: { id: this.id },
        body: { version: this.order.version, reason: event.detail },
      },
    )
    this.settle(result, result.ok ? labels.poStatus[result.data.status] : '')
  },
  async onReject(this: Host) {
    if (!this.order || this.data.busy) return
    const confirmed = await confirmAsk(this, {
      title: redesignCopy.rejectPurchaseTitle,
      body: redesignCopy.rejectPurchaseBody,
      cancel: copy.confirm.cancel,
      confirm: redesignCopy.rejectPurchaseConfirm,
    })
    if (!confirmed) return
    this.setData({ busy: 'receive', error: '' })
    const result = await request(contract.receivePurchaseOrder, {
      params: { id: this.id },
      body: {
        version: this.order.version,
        reason: '',
        recvNote: this.data.recvNote,
        lines: this.order.lines.map((line) => ({
          poLineId: line.id,
          receivedQty: 0,
          priceCents: line.priceCents,
        })),
      },
    })
    this.settle(result, result.ok ? labels.poStatus[result.data.status] : '')
  },
  async onReceive(this: Host) {
    if (!this.order) return
    const checked = checkedOf(
      contract.receivePurchaseOrder.body.safeParse({
        version: this.order.version,
        recvNote: this.data.recvNote,
        reason: this.data.reason,
        lines: receiveInputOf(this.data.lines),
      }),
    )
    if (!checked.ok) {
      this.setData({
        error: unplacedErrorOf(checked.fields, [
          'reason',
          'lines.*.receivedQty',
          'lines.*.priceCents',
        ]),
        fields: checked.fields,
      })
      this.render(this.data.lines)
      return
    }
    this.setData({ busy: 'receive', error: '' })
    const result = await request(contract.receivePurchaseOrder, {
      params: { id: this.id },
      body: checked.body,
    })
    this.settle(result, result.ok ? labels.poStatus[result.data.status] : '')
  },
  async onSaveSheet(this: Host) {
    if (!this.order) return
    const common = { version: this.order.version, reason: this.data.reason }
    const result =
      this.data.sheet === 'return'
        ? contract.returnPurchaseOrder.body.safeParse({
            ...common,
            lines: this.data.lines
              .filter((l) => l.qty > 0)
              .map((l) => ({ poLineId: l.key, qty: l.qty })),
          })
        : contract.repricePurchaseOrder.body.safeParse({
            ...common,
            lines: this.data.lines.map((l) => ({
              poLineId: l.key,
              priceCents: centsOfText(l.priceText),
            })),
          })
    const checked = checkedOf<unknown>(result)
    if (!checked.ok) {
      this.setData({
        error: unplacedErrorOf(checked.fields, ['reason', 'lines.*.qty', 'lines.*.priceCents']),
        fields: checked.fields,
      })
      this.render(this.data.lines)
      return
    }
    this.setData({ busy: this.data.sheet, error: '' })
    const input = { params: { id: this.id }, body: checked.body }
    const saved =
      this.data.sheet === 'return'
        ? await request(contract.returnPurchaseOrder, {
            ...input,
            body: contract.returnPurchaseOrder.body.parse(checked.body),
          })
        : await request(contract.repricePurchaseOrder, {
            ...input,
            body: contract.repricePurchaseOrder.body.parse(checked.body),
          })
    this.settle(saved, copy.action.saved)
  },
  settle(this: Host, result: Result<PoDetail>, done: string) {
    this.setData({ busy: '' })
    if (result.ok) {
      this.setData({ sheet: '', cancelSheet: false, error: '' })
      this.show(result.data)
      syncUnloadAlert(false)
      showSuccess(done)
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'page') this.setData({ failure: view })
    else {
      if (view.kind === 'stale') {
        this.setData({ sheet: '', cancelSheet: false })
        this.show(view.latest as PoDetail)
      }
      this.setData({
        error:
          view.kind === 'fields'
            ? unplacedErrorOf(view.fields, [
                'reason',
                'lines.*.receivedQty',
                'lines.*.qty',
                'lines.*.priceCents',
              ])
            : messageOf(view),
        fields: view.kind === 'fields' ? view.fields : {},
      })
      this.render(this.data.lines)
    }
  },
  onRealtime(this: Host) {
    void this.load(false, true)
  },
  onFailureAction(this: Host) {
    void this.load()
  },
}
export const poDetailPage = { ...methods, data }
