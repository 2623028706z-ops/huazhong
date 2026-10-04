// S5 结算（06 章 S5）：状态区 → 下单日期、客户门店 → 备注 → 明细（改单时停用的行标「已停用」+ 垃圾桶）；订单金额固定在底栏左侧。
// 没有出货日期（销售确认时定）。提交后进 S6、购物车清空；改单提交后回 S6，原购物车不变
import {
  contract,
  copy,
  financeCopy,
  fieldsOf,
  shanghaiDateOf,
  storeOrderCreateSchema,
  storeOrderUpdateSchema,
  type OrderDetail,
} from '@huazhong/shared'
import { withQty, type CartLine } from '../../../../core/cart'
import { findAction } from '../../../../core/actions'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unitTotalsTextOf } from '../../../../core/form'
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
  reviewEdit,
  syncWithCatalog,
  type CartSource,
} from '../../cart-source'
import { loadShop, type ShopData } from '../../shop-data'

const DETAIL_URL = '/packages/store/pages/order-detail/index'
// 改单从 S6 → S1 → S5 进来，提交后回 S6
const EDIT_BACK_DELTA = 2

function entryOf(line: CartLine) {
  return { ...line, listPriceCents: line.priceCents }
}

const CHECKOUT_TITLE: string = copy.screen.action.submitOrder
Page({
  data: {
    title: CHECKOUT_TITLE,
    isEdit: false,
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    notice: '',
    rows: [] as ReturnType<typeof cartLinesOf>,
    info: { title: '', rows: [] as { label: string; value: string }[] },
    note: '',
    initialNote: '',
    totalCents: 0,
    totalMeta: '',
    saving: false,
    needsReview: false,
    texts: {
      lines: copy.screen.section.lines,
      note: copy.field.note,
      optional: copy.placeholder.optional,
      submit: copy.screen.action.submitOrder,
      confirmEdit: financeCopy.saveChanges,
      recheck: copy.rework.recheck,
    },
  },
  source: null as CartSource | null,
  lines: [] as CartLine[],
  idempotencyKey: '',
  onLoad(query: Record<string, string | undefined>) {
    const isEdit = query.mode === 'edit'
    const note = isEdit ? (editDraft()?.note ?? '') : ''
    this.idempotencyKey = newIdempotencyKey()
    this.setData({
      isEdit,
      note,
      initialNote: note,
      title: isEdit ? financeCopy.saveChanges : copy.screen.action.submitOrder,
    })
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
      info: {
        title: me.orgLabel ?? '',
        rows: [
          {
            label: copy.screen.label.orderDate,
            value: draft?.orderDate ?? shanghaiDateOf(Date.now()),
          },
        ],
      },
    })
    this.show(syncWithCatalog(this.source, catalog?.items ?? null, this.data.isEdit))
  },
  show(lines: CartLine[]) {
    this.lines = lines
    this.setData({
      rows: cartLinesOf(lines, this.data.isEdit),
      totalCents: sumCents(lines, (line) => lineCents(line.qty, line.priceCents)),
      totalMeta: unitTotalsTextOf(lines),
    })
  },
  change(lines: CartLine[]) {
    this.source?.save(lines)
    this.show(lines)
  },
  onRemove(event: DetailEvent<number>) {
    const line = this.lines[event.detail]
    if (line && this.data.rows[event.detail]?.removable)
      this.change(withQty(this.lines, entryOf(line), 0))
  },
  // 放弃修改只看备注：购物车改了照常保存在购物车里
  onNote(event: DetailEvent<string>) {
    this.setData({ note: event.detail, formError: '' })
    syncUnloadAlert(isChanged(this.data.initialNote, event.detail))
  },
  async onSubmit(): Promise<void> {
    if (this.data.saving) return
    if (this.data.needsReview) {
      await this.onReview()
      return
    }
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
      if (view?.kind === 'stale') this.setData({ needsReview: true })
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
  async onReview(): Promise<void> {
    const draft = editDraft()
    if (!draft) return
    this.setData({ saving: true })
    const result = await request(contract.getOrder, { params: { id: draft.orderId } })
    if (!result.ok) {
      this.setData({ saving: false })
      this.afterSubmit(result)
      return
    }
    const action = findAction(result.data.actions, 'storeEdit')
    if (!action?.enabled) {
      this.setData({
        saving: false,
        formError:
          action?.disabledReason ?? result.data.lockedReason ?? copy.rework.orderOperationLocked,
      })
      return
    }
    const shop = await loadShop()
    this.setData({ saving: false })
    if (!shop.ok) {
      const failure = failureOf(shop.failure, 'refresh')
      this.setData({ failure })
      return
    }
    this.applyReview(result.data, shop.data)
  },
  applyReview(order: OrderDetail, shop: ShopData) {
    if (shop.home.lockedReason) {
      this.setData({ formError: shop.home.lockedReason })
      return
    }
    this.source?.save(this.lines)
    const catalog = shop.catalog?.items ?? null
    reviewEdit(order, catalog)
    if (this.source) this.show(syncWithCatalog(this.source, catalog, true))
    this.setData({
      needsReview: false,
      failure: null,
      formError: '',
      notice: copy.rework.orderReviewed,
    })
  },
  onFailureAction() {
    void this.load()
  },
})
