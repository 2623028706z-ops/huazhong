// S2 购物车（06 章 S2）：购物车行（改数量、删除）→「清空」→ 结算条。打开时去掉停订、停用的产品，提示同 S1。
// 客户停用：顶部写 lockedReason，「去结算」禁用；购物车照常能改、能清空
import { copy, type Me } from '@huazhong/shared'
import { countOf, withQty, type CartLine } from '../../../../core/cart'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unwatch, watch } from '../../../../core/live'
import { lineCents, sumCents } from '../../../../core/money'
import { failureOf, logout, tabsOf } from '../../../../core/session'
import { cartLinesOf, cartSourceOf, syncWithCatalog, type CartSource } from '../../cart-source'
import { loadShop } from '../../shop-data'

function entryOf(line: CartLine) {
  return { ...line, listPriceCents: line.priceCents }
}

Page({
  data: {
    title: copy.screen.title.cart,
    loaded: false,
    failure: null as FailureView | null,
    notice: '',
    rows: [] as ReturnType<typeof cartLinesOf>,
    total: 0,
    count: 0,
    countText: '',
    tabs: [] as ReturnType<typeof tabsOf>,
    emptyObject: copy.screen.empty.cart,
    texts: { clear: copy.screen.action.clear, checkout: copy.screen.action.toCheckout },
  },
  source: null as CartSource | null,
  me: null as Me | null,
  lines: [] as CartLine[],
  onShow() {
    void this.load()
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
  },
  async load() {
    const result = await loadShop()
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    const { me, home, catalog } = result.data
    this.me = me
    this.source = cartSourceOf(false, me.id)
    this.setData({ loaded: true, failure: null, notice: home.lockedReason ?? '' })
    this.show(syncWithCatalog(this.source, catalog?.items ?? null, false))
    watch(this, [`catalog:${home.customerId}`], () => void this.load())
  },
  show(lines: CartLine[]) {
    this.lines = lines
    const count = countOf(lines)
    this.setData({
      rows: cartLinesOf(lines, false),
      total: sumCents(lines, (line) => lineCents(line.qty, line.priceCents)),
      count,
      countText: copy.screen.cartCount(count),
      // 底栏角标跟着本机购物车件数变
      tabs: this.me ? tabsOf(this.me) : [],
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
  onClear() {
    this.change([])
  },
  onCheckout() {
    void wx.navigateTo({ url: '/packages/store/pages/checkout/index' })
  },
  onFailureAction(event: DetailEvent<string>) {
    if (event.detail === 'logout') void logout()
    else void this.load()
  },
})
