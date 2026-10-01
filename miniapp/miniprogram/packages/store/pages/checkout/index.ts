// S5 结算（06 章 S5）：状态区 → 下单日期、客户门店 → 备注 → 明细（改单时停订的行标「已停订」+ 垃圾桶）→ 订单金额。
// 没有出货日期（销售确认时定）。提交后进 S6、购物车清空；改单提交后回 S6，原购物车不变
import {
  contract,
  copy,
  fieldsOf,
  formatMoney,
  shanghaiDateOf,
  storeOrderCreateSchema,
  storeOrderUpdateSchema,
  type OrderDetail,
} from '@huazhong/shared'
import { withQty, type CartLine } from '../../../../core/cart'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { isChanged, syncUnloadAlert } from '../../../../core/guard'
import { lineCents, sumCents } from '../../../../core/money'
import { newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import {
  cartLinesOf,
  cartSourceOf,
  editDraft,
  endEdit,
  syncWithCatalog,
  type CartSource,
} from '../../cart-source'
import { loadShop } from '../../shop-data'

const DETAIL_URL = '/packages/store/pages/order-detail/index'
// 改单从 S6 → S1 → S5 进来，提交后回 S6
const EDIT_BACK_DELTA = 2

function entryOf(line: CartLine) {
  return { ...line, listPriceCents: line.priceCents }
}

Page({
  data: {
    title: copy.screen.title.checkout,
    isEdit: false,
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    notice: '',
    rows: [] as ReturnType<typeof cartLinesOf>,
    info: [] as { label: string; value: string }[],
    note: '',
    initialNote: '',
    amountRows: [] as { label: string; value: string }[],
    saving: false,
    texts: {
      note: copy.field.note,
      optional: copy.placeholder.optional,
      submit: copy.screen.action.submitOrder,
      confirmEdit: copy.screen.action.confirmEdit,
    },
  },
  source: null as CartSource | null,
  lines: [] as CartLine[],
  idempotencyKey: '',
  onLoad(query: Record<string, string | undefined>) {
    const isEdit = query.mode === 'edit'
    const note = isEdit ? (editDraft()?.note ?? '') : ''
    this.idempotencyKey = newIdempotencyKey()
    this.setData({ isEdit, note, initialNote: note })
  },
  onShow() {
    void this.load()
  },
  onUnload() {
    syncUnloadAlert(false)
  },
  async load() {
    const result = await loadShop()
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    const { me, home, catalog } = result.data
    const draft = this.data.isEdit ? editDraft() : null
    this.source = cartSourceOf(this.data.isEdit, me.id)
    this.setData({
      loaded: true,
      failure: null,
      notice: home.lockedReason ?? '',
      info: [
        {
          label: copy.screen.label.orderDate,
          value: draft?.orderDate ?? shanghaiDateOf(Date.now()),
        },
        { label: copy.screen.label.customerStore, value: me.orgLabel ?? '' },
      ],
    })
    this.show(syncWithCatalog(this.source, catalog?.items ?? null, this.data.isEdit))
  },
  show(lines: CartLine[]) {
    this.lines = lines
    this.setData({
      rows: cartLinesOf(lines, this.data.isEdit),
      amountRows: [
        {
          label: copy.screen.label.orderAmount,
          value: formatMoney(sumCents(lines, (line) => lineCents(line.qty, line.priceCents))),
        },
      ],
    })
  },
  change(lines: CartLine[]) {
    this.source?.save(lines)
    this.show(lines)
  },
  onQty(event: DetailEvent<{ index: number; qty: number }>) {
    const line = this.lines[event.detail.index]
    if (line) this.change(withQty(this.lines, entryOf(line), event.detail.qty))
  },
  onRemove(event: DetailEvent<number>) {
    const line = this.lines[event.detail]
    if (line) this.change(withQty(this.lines, entryOf(line), 0))
  },
  // 放弃修改只看备注：购物车改了照常保存在购物车里
  onNote(event: DetailEvent<string>) {
    this.setData({ note: event.detail, formError: '' })
    syncUnloadAlert(isChanged(this.data.initialNote, event.detail))
  },
  async onSubmit(): Promise<void> {
    const lines = this.lines.map(({ productId, qty }) => ({ productId, qty }))
    const draft = this.data.isEdit ? editDraft() : null
    const parsed = draft
      ? storeOrderUpdateSchema.safeParse({ version: draft.version, note: this.data.note, lines })
      : storeOrderCreateSchema.safeParse({ note: this.data.note, lines })
    if (!parsed.success) {
      this.setData({ formError: Object.values(fieldsOf(parsed.error))[0] ?? '' })
      return
    }
    this.setData({ saving: true, formError: '' })
    const result = draft
      ? await request(contract.updateStoreOrder, {
          params: { id: draft.orderId },
          body: { version: draft.version, note: this.data.note, lines },
        })
      : await request(
          contract.createStoreOrder,
          { body: { note: this.data.note, lines } },
          { idempotencyKey: this.idempotencyKey },
        )
    this.setData({ saving: false })
    this.afterSubmit(result)
  },
  afterSubmit(result: Result<OrderDetail>) {
    if (!result.ok) {
      const view = failureOf(result.failure, 'submit')
      if (view?.kind === 'page') this.setData({ failure: view })
      else if (view) this.setData({ formError: view.message })
      return
    }
    syncUnloadAlert(false)
    showSuccess(copy.action.saved)
    if (this.data.isEdit) {
      endEdit()
      void wx.navigateBack({ delta: EDIT_BACK_DELTA })
      return
    }
    this.source?.save([])
    void wx.redirectTo({ url: `${DETAIL_URL}?id=${result.data.id}` })
  },
  onFailureAction() {
    void this.load()
  },
})
