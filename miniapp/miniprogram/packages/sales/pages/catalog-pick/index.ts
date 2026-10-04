import { contract, copy, type ProductItem } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { firstFailure, request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { addableOf } from '../directory/form'
Page({
  data: {
    title: copy.screen.title.pickProduct,
    loaded: false,
    failure: null as FailureView | null,
    selected: '',
    keyword: '',
    rows: [] as { id: string; name: string; sub: string }[],
    texts: {
      next: copy.screen.action.next,
      empty: copy.screen.empty.addableProducts,
      search: copy.screen.title.pickProduct,
    },
  },
  customerId: '',
  products: [] as ProductItem[],
  picks: [] as { id: string; name: string; sub: string }[],
  onLoad(query: Record<string, string | undefined>) {
    this.customerId = query.customerId ?? ''
    void this.load()
  },
  async load() {
    const [products, catalog] = await Promise.all([
      request(contract.listProducts, { query: {} }),
      request(contract.getCatalog, { params: { customerId: this.customerId } }),
    ])
    if (!products.ok || !catalog.ok) {
      const failure = firstFailure([products, catalog])
      if (failure) this.setData({ failure: failureOf(failure, 'load') })
      return
    }
    this.products = products.data.items
    this.picks = addableOf(this.products, catalog.data).map((row) => ({
      ...row,
      sub: this.products.find((p) => p.id === row.id)?.unit ?? '',
    }))
    this.setData({ loaded: true, failure: null })
    this.render()
  },
  render() {
    this.setData({ rows: this.picks.filter((row) => row.name.includes(this.data.keyword)) })
  },
  onSearch(event: DetailEvent<string>) {
    this.setData({ keyword: event.detail })
    this.render()
  },
  onPick(event: KeyEvent) {
    this.setData({ selected: event.currentTarget.dataset.key })
  },
  onNext() {
    if (this.picks.some((row) => row.id === this.data.selected))
      void wx.redirectTo({
        url: `/packages/sales/pages/catalog-item/index?customerId=${this.customerId}&productId=${this.data.selected}`,
      })
  },
  onFailureAction() {
    void this.load()
  },
})
