// S1 订货（06 章 S1）：顶部客户门店、下单日期、可订款数、搜索（跨分类）→ 左侧分类 + 右侧产品 → 购物车条。
// 从订单详情「修改订单」进来是改单模式（?mode=edit）：用单独一份购物车，返回后原购物车不变
import {
  copy,
  financeCopy,
  redesignCopy,
  formatUnitTotals,
  formatMoney,
  shanghaiDateOf,
  type StoreCatalog,
  type StoreCatalogItem,
} from '@huazhong/shared'
import { countOf, qtyOf, withQty, type CartLine } from '../../../../core/cart'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unwatch, watch } from '../../../../core/live'
import { lineCents, sumCents } from '../../../../core/money'
import { confirmAsk } from '../../../../core/guard'
import { tabsOf } from '../../../../core/session'
import { failureOf } from '../../../../core/session'
import {
  cartLinesOf,
  cartSourceOf,
  editDraft,
  endEdit,
  syncWithCatalog,
  type CartSource,
} from '../../cart-source'
import { loadShop, type ShopData } from '../../shop-data'

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
    priceText: copy.screen.pricePer(formatMoney(item.listPriceCents), item.unit),
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
  data: {
    title: copy.screen.title.shop,
    headerCollapsed: false,
    isEdit: false,
    loaded: false,
    failure: null as FailureView | null,
    catalogError: '',
    head: '',
    dateLabel: copy.screen.label.orderDate,
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
    cartRows: [] as ReturnType<typeof cartLinesOf>,
    tabs: [] as ReturnType<typeof tabsOf>,
    notice: '',
    texts: {
      checkout: copy.screen.action.toCheckout,
      clear: copy.screen.action.clear,
      picked: copy.screen.title.picked,
    },
  },
  source: null as CartSource | null,
  catalog: null as StoreCatalog | null,
  lines: [] as CartLine[],
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ isEdit: query.mode === 'edit' })
  },
  onShow() {
    void this.load()
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
    if (this.data.isEdit) endEdit()
  },
  async load() {
    const result = await loadShop()
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
      date: headerDateOf(this.data.isEdit),
      countText: this.data.isEdit
        ? copy.screen.title.editOrder
        : copy.store.orderableCount(data.home.orderableCount),
      tabs: tabsOf(data.me),
      notice: data.home.lockedReason ?? '',
      categories,
      categoryId: kept ? this.data.categoryId : (categories[0]?.id ?? ''),
    })
  },
  showLines(lines: CartLine[]) {
    this.lines = lines
    const { categoryId, keyword, isEdit } = this.data
    const count = countOf(lines)
    this.setData({
      products: this.catalog ? productRowsOf(this.catalog, categoryId, keyword, lines) : [],
      emptyObject: keyword.trim() ? copy.screen.empty.shopSearch : copy.screen.empty.shop,
      cartCount: count,
      cartText: redesignCopy.pickedCount(
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
  onCheckout() {
    if (!this.lines.length || this.data.notice) return
    const mode = this.data.isEdit ? '?mode=edit' : ''
    void wx.navigateTo({ url: `/packages/store/pages/checkout/index${mode}` })
  },
  onFailureAction() {
    void this.load()
  },
})
