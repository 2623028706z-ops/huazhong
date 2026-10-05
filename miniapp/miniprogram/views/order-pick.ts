// 选订单申请售后（06 章 X15 销售、S12 门店，2026-10-06 第 3 批门店复用）：搜索 + 只列能申请售后的已发货订单
// （GET /orders?afterable=true），点一张直接 redirectTo 售后表单，不用再点「下一步」
import { contract, copy, type OrderCard } from '@huazhong/shared'
import { canDo } from '../core/actions'
import type { KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter } from '../core/filter'
import type { PagedList } from '../core/list'
import { request } from '../core/request'
import type { CardRow } from './card'
import { listHandlers, listOf, listQueryOf, showList } from './list'
import { orderRowOf } from './order'

interface PickOptions {
  // 门店：卡片同 S3、动作码 applyAfter、进门店售后表单；员工：卡片同 X2、createAfter、进销售售后表单
  forStore: boolean
}

export function orderPickPage({ forStore }: PickOptions) {
  const code = forStore ? 'applyAfter' : 'createAfter'
  const formUrl = forStore
    ? '/packages/store/pages/after-form/index'
    : '/packages/sales/pages/after-form/index'
  return {
    ...listHandlers,
    data: {
      title: copy.screen.title.pickOrder,
      statusKind: 'orderStatus',
      filter: emptyFilter,
      rows: [] as CardRow[],
      loaded: false,
      skeleton: false,
      done: false,
      failure: null as FailureView | null,
      emptyObject: copy.screen.empty.afterable,
      allLoaded: copy.state.allLoaded,
      texts: {
        search: forStore ? copy.flow.store.orderSearch : copy.screen.label.searchOrders,
        hint: forStore ? copy.flow.store.pickHint : '',
      },
    },
    cards: [] as OrderCard[],
    list: null as PagedList<OrderCard> | null,
    onLoad(this: PickPage) {
      this.list = listOf(
        this,
        async (cursor) => {
          const { q } = listQueryOf(this.data.filter)
          const result = await request(contract.listOrders, {
            query: { afterable: 'true', cursor, q },
          })
          if (result.ok)
            this.cards = cursor ? [...this.cards, ...result.data.items] : result.data.items
          return result
        },
        (order) => orderRowOf(order, forStore),
      )
    },
    onShow(this: PickPage) {
      showList(this, ['orders', 'afters'])
    },
    onOpen(this: PickPage, event: KeyEvent) {
      const selected = event.currentTarget.dataset.key
      if (!this.cards.some((order) => order.id === selected && canDo(order.actions, code))) return
      void wx.redirectTo({ url: `${formUrl}?orderId=${selected}` })
    },
  }
}

interface PickPage {
  data: { filter: typeof emptyFilter }
  cards: OrderCard[]
  list: PagedList<OrderCard> | null
  setData(patch: Record<string, unknown>): void
}
