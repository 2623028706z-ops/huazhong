// S1 订货（06 章 S1）：顶部客户门店、下单日期、可订款数、搜索（跨分类）→ 左侧分类 + 右侧产品 → 购物车条。
// 「去下单」打开购物车弹层：改数量、备注、提交都在弹层里，订货一页完成（不再有单独的结算页）。
// 从订单详情「修改订单」进来是改单模式（?mode=edit）：用单独一份购物车，底栏「核对修改」打开弹层看改了哪些行，
// 「保存修改」后直接回订单详情，原购物车不变。普通模式搜索框下有「上一单」条，可「再来一单」
import {
  contract,
  copy,
  fieldsOf,
  entryCopy,
  financeCopy,
  redesignCopy,
  formatUnitTotals,
  formatMoney,
  shanghaiDateOf,
  storeOrderCreateSchema,
  storeOrderUpdateSchema,
  type OrderDetail,
  type StoreCatalog,
  type StoreCatalogItem,
} from '@huazhong/shared'
import { findAction } from '../../../../core/actions'
import { countOf, qtyOf, withQty, type CartLine } from '../../../../core/cart'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unwatch, watch, pullToRefresh } from '../../../../core/live'
import { lineCents, sumCents } from '../../../../core/money'
import { confirmAsk, isChanged, syncUnloadAlert } from '../../../../core/guard'
import { newIdempotencyKey, request, type Result } from '../../../../core/request'
import { showNotice, showSuccess } from '../../../../core/toast'
import { tabsOf } from '../../../../core/session'
import { failureOf } from '../../../../core/session'
import {
  cartLinesOf,
  cartSourceOf,
  editDraft,
  editReviewOf,
  endEdit,
  reviewEdit,
  syncWithCatalog,
  type CartSource,
} from '../../cart-source'
import { lastOrderViewOf, loadLastOrder, reorderLines } from '../../last-order'
import { loadShop, type ShopData } from '../../shop-data'

const DETAIL_URL = '/packages/store/pages/order-detail/index'

function productRowsOf(
  catalog: StoreCatalog,
  categoryId: string,
  keyword: string,
  lines: CartLine[],
) {
  const word = keyword.trim()
  const items = word
    ? catalog.items.filter((item) => item.name.includes(word))
    : catalog.items.filter((item) => item.categoryId === categoryId)
  return items.map((item) => ({
    id: item.productId,
    name: item.name,
    code: item.customerCode,
    // 带图目录卡统一「¥68.00/束」（02 章第 6 节第 6 条）
    priceText: copy.screen.listPriceText(formatMoney(item.listPriceCents), item.unit),
    thumbUrl: item.thumbUrl ?? '',
    qty: qtyOf(lines, item.productId),
    unit: item.unit,
  }))
}

// 购物车里的行当作目录项：数量改了快照不变
function entryOf(line: CartLine) {
  return { ...line, listPriceCents: line.priceCents }
}

// 标成 string：搜索时换成「相关产品」
const SHOP_EMPTY: string = copy.screen.empty.shop

function catalogErrorOf(data: ShopData): string {
  return data.catalogFailure ? (failureOf(data.catalogFailure, 'refresh')?.message ?? '') : ''
}

const HEADER_COLLAPSE_SCROLL_PX = 40
function headerDateOf(isEdit: boolean) {
  return (isEdit ? editDraft()?.orderDate : undefined) ?? shanghaiDateOf(Date.now())
}
Page({
  ...pullToRefresh,
  data: {
    title: copy.screen.title.shop,
    headerCollapsed: false,
    isEdit: false,
    loaded: false,
    failure: null as FailureView | null,
    catalogError: '',
    head: '',
    date: '',
    countText: '',
    keyword: '',
    searchPlaceholder: copy.screen.label.search,
    categories: [] as { id: string; name: string; sub: string }[],
    categoryId: '',
    products: [] as ReturnType<typeof productRowsOf>,
    emptyObject: SHOP_EMPTY,
    cartCount: 0,
    cartTotal: 0,
    cartText: '',
    cartSheet: false,
    note: '',
    initialNote: '',
    formError: '',
    reviewNotice: '',
    saving: false,
    needsReview: false,
    pickedTitle: copy.screen.title.pickedWith(0),
    cartRows: [] as ReturnType<typeof cartLinesOf>,
    tabs: [] as ReturnType<typeof tabsOf>,
    notice: '',
    lastOrder: null as ReturnType<typeof lastOrderViewOf>,
    editChanges: [] as ReturnType<typeof editReviewOf>['changes'],
    texts: {
      code: copy.field.customerCode,
      checkout: copy.screen.action.toCheckout,
      note: copy.field.note,
      optional: copy.placeholder.optional,
      orderAmount: copy.screen.label.orderAmount,
      submit: copy.screen.action.submitOrder,
      saveEdit: financeCopy.saveChanges,
      reviewEdit: entryCopy.reviewEdit,
      changedLines: entryCopy.changedLines,
      noChange: entryCopy.noChange,
      reorder: entryCopy.reorder,
      recheck: copy.rework.recheck,
      clear: copy.screen.action.clear,
      picked: copy.screen.title.picked,
    },
  },
  source: null as CartSource | null,
  catalog: null as StoreCatalog | null,
  lastOrder: null as OrderDetail | null,
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
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
    syncUnloadAlert(false)
    if (this.data.isEdit) endEdit()
  },
  async load() {
    const [result, last] = await Promise.all([
      loadShop(),
      this.data.isEdit ? null : loadLastOrder(),
    ])
    // 上一单读不到不挡订货，只是不显示
    this.lastOrder = last?.ok ? last.data : null
    this.setData({ lastOrder: lastOrderViewOf(this.lastOrder) })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    const { me, home, catalog } = result.data
    this.source = cartSourceOf(this.data.isEdit, me.id)
    this.catalog = catalog
    this.setHead(result.data)
    this.showLines(syncWithCatalog(this.source, catalog?.items ?? null, this.data.isEdit))
    watch(this, [`catalog:${home.customerId}`], () => void this.load())
  },
  setHead(data: ShopData) {
    const categories = (data.catalog?.categories ?? []).map(({ id, name }) => ({
      id,
      name,
      sub: '',
    }))
    const kept = categories.some((category) => category.id === this.data.categoryId)
    this.setData({
      loaded: true,
      failure: null,
      catalogError: catalogErrorOf(data),
      head: data.me.orgLabel ?? '',
      date: this.data.isEdit ? '' : headerDateOf(false),
      countText: this.data.isEdit
        ? copy.screen.title.editOrderDated(headerDateOf(true))
        : copy.store.orderableCount(data.home.orderableCount),
      tabs: tabsOf(data.me, data.unseen),
      notice: data.home.lockedReason ?? '',
      categories,
      categoryId: kept ? this.data.categoryId : (categories[0]?.id ?? ''),
    })
  },
  showLines(lines: CartLine[]) {
    this.lines = lines
    const { categoryId, keyword, isEdit } = this.data
    const count = countOf(lines)
    const review = isEdit ? editReviewOf(lines) : null
    this.setData({
      editChanges: review?.changes ?? [],
      products: this.catalog ? productRowsOf(this.catalog, categoryId, keyword, lines) : [],
      emptyObject: keyword.trim() ? copy.screen.empty.shopSearch : copy.screen.empty.shop,
      cartCount: count,
      pickedTitle: copy.screen.title.pickedWith(lines.length),
      cartText: review
        ? entryCopy.editPicked(lines.length, review.diffText)
        : redesignCopy.pickedCount(
            lines.length,
            formatUnitTotals(
              [...new Set(lines.map((line) => line.unit))].map((unit) => ({
                unit,
                qty: lines
                  .filter((line) => line.unit === unit)
                  .reduce((sum, line) => sum + line.qty, 0),
              })),
            ),
          ),
      cartTotal: sumCents(lines, (line) => lineCents(line.qty, line.priceCents)),
      cartRows: cartLinesOf(lines, isEdit).map((line) => ({ ...line, removable: true })),
    })
  },
  change(lines: CartLine[]) {
    this.source?.save(lines)
    this.showLines(lines)
  },
  onImageError(event: DetailEvent<unknown, { key: string }>) {
    this.setData({
      products: this.data.products.map((row) =>
        row.id === event.currentTarget.dataset.key ? { ...row, thumbUrl: '' } : row,
      ),
    })
  },
  onCategory(event: DetailEvent<string>) {
    this.setData({ categoryId: event.detail })
    this.showLines(this.lines)
  },
  onSearch(event: DetailEvent<string>) {
    this.setData({ keyword: event.detail })
    this.showLines(this.lines)
  },
  onProductScroll(event: DetailEvent<{ scrollTop: number }>) {
    const collapsed = event.detail.scrollTop > HEADER_COLLAPSE_SCROLL_PX
    if (collapsed !== this.data.headerCollapsed) this.setData({ headerCollapsed: collapsed })
  },
  onQty(event: DetailEvent<number, { key: string }>) {
    const item = this.catalog?.items.find(
      (product: StoreCatalogItem) => product.productId === event.currentTarget.dataset.key,
    )
    if (item) this.change(withQty(this.lines, item, event.detail))
  },
  onAdd(event: DetailEvent<unknown, { key: string }>) {
    const item = this.catalog?.items.find(
      (product) => product.productId === event.currentTarget.dataset.key,
    )
    if (item) this.change(withQty(this.lines, item, 1))
  },
  // 再来一单：上一单的产品和数量加进购物车，不直接下单；客户停用（有 notice）时按钮禁用
  onReorder() {
    const order = this.lastOrder
    if (!order || !this.catalog || this.data.notice) return
    const { lines, skipped } = reorderLines(this.lines, order, this.catalog.items)
    if (skipped.length === order.lines.length) {
      showNotice(entryCopy.reorderAllSkipped)
      return
    }
    this.change(lines)
    showNotice(
      skipped.length
        ? entryCopy.reorderSkipped(skipped.join(copy.order.nameSeparator))
        : entryCopy.reordered,
    )
  },
  onOpenCart() {
    if (this.lines.length > 0) this.setData({ cartSheet: true })
  },
  onCloseCart() {
    this.setData({ cartSheet: false })
  },
  onCartQty(event: DetailEvent<{ index: number; qty: number }>) {
    const line = this.lines[event.detail.index]
    if (line) this.change(withQty(this.lines, entryOf(line), event.detail.qty))
  },
  onCartRemove(event: DetailEvent<number>) {
    const line = this.lines[event.detail]
    if (line) this.change(withQty(this.lines, entryOf(line), 0))
  },
  async onClear() {
    const confirmed = await confirmAsk(this, {
      title: copy.screen.action.clear,
      body: financeCopy.clearSelected,
      cancel: copy.confirm.keepEditing,
      confirm: copy.screen.action.clear,
    })
    if (confirmed) {
      this.change([])
      this.setData({ cartSheet: false })
    }
  },
  // 去下单：打开购物车弹层，备注和提交都在里面
  onCheckout() {
    if (!this.lines.length || this.data.notice) return
    this.setData({ cartSheet: true, formError: '' })
  },
  // 放弃修改只看备注：购物车改了照常保存在购物车里
  onNote(event: DetailEvent<string>) {
    this.setData({ note: event.detail, formError: '' })
    if (this.data.isEdit) syncUnloadAlert(isChanged(this.data.initialNote, event.detail))
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
      if (view?.kind === 'page') this.setData({ cartSheet: false, failure: view })
      else if (view) this.setData({ formError: view.message })
      return
    }
    syncUnloadAlert(false)
    showSuccess(copy.action.saved)
    this.setData({ cartSheet: false })
    if (this.data.isEdit) {
      // 改单：订货页直接保存，回到订单详情，原购物车不变
      endEdit()
      void wx.navigateBack()
      return
    }
    this.source?.save([])
    void wx.redirectTo({ url: `${DETAIL_URL}?id=${result.data.id}` })
  },
  // 改单提交时订单已被销售改过：重新核对订单和目录，保留已填的数量、备注，再次点才提交
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
      this.setData({ failure: failureOf(shop.failure, 'refresh') })
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
    this.catalog = shop.catalog
    if (this.source) this.showLines(syncWithCatalog(this.source, catalog, true))
    this.setData({
      needsReview: false,
      failure: null,
      formError: '',
      reviewNotice: copy.rework.orderReviewed,
    })
  },
  onFailureAction() {
    void this.load()
  },
})
