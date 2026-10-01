// 模块首页的入口和待办（06 章 X1、H1、F1）：采购、仓库在阶段 4、5 加（08 章）
import { copy, formatMoney, type ModuleKey, type TodoItem } from '@huazhong/shared'
import { afterRowOf } from '../../views/after'
import { orderRowOf } from '../../views/order'

interface Entry {
  key: string
  icon: string
  text: string
  url: string
}

const SALES = '/packages/sales/pages'
const SHIPPING = '/packages/shipping/pages'
const FINANCE = '/packages/finance/pages'

export const entriesOf: Partial<Record<ModuleKey, Entry[]>> = {
  sales: [
    {
      key: 'orders',
      icon: 'file-text',
      text: copy.screen.title.salesOrders,
      url: `${SALES}/orders/index`,
    },
    {
      key: 'customers',
      icon: 'store',
      text: copy.screen.title.customers,
      url: `${SALES}/customers/index`,
    },
    {
      key: 'products',
      icon: 'flower-2',
      text: copy.screen.title.products,
      url: `${SALES}/products/index`,
    },
    {
      key: 'directory',
      icon: 'notebook-text',
      text: copy.screen.title.directory,
      url: `${SALES}/directory/index`,
    },
    {
      key: 'afters',
      icon: 'rotate-ccw',
      text: copy.screen.title.salesAfters,
      url: `${SALES}/afters/index`,
    },
  ],
  finance: [
    {
      key: 'customers',
      icon: 'notebook-text',
      text: copy.screen.title.arCustomers,
      url: `${FINANCE}/customers/index`,
    },
    {
      key: 'records',
      icon: 'scroll-text',
      text: copy.screen.title.records,
      url: `${FINANCE}/records/index`,
    },
    {
      key: 'methods',
      icon: 'wallet',
      text: copy.screen.title.methods,
      url: `${FINANCE}/methods/index`,
    },
  ],
}

interface TodoSpec {
  // 待办为空时的空状态对象
  empty: string
  // 「查看全部」去哪；发货没有待办时换成「发货记录」
  all: string
  idle: { text: string; url: string } | null
}

export const todoSpecs: Partial<Record<ModuleKey, TodoSpec>> = {
  sales: {
    empty: copy.screen.empty.todos,
    all: `${SALES}/orders/index?status=pending_confirm`,
    idle: null,
  },
  shipping: {
    empty: copy.screen.empty.shipTodos,
    all: `${SHIPPING}/list/index?status=to_ship`,
    idle: { text: copy.screen.action.shipRecords, url: `${SHIPPING}/list/index?status=shipped` },
  },
  finance: { empty: copy.screen.empty.todos, all: `${FINANCE}/customers/index`, idle: null },
}

// 一条待办的卡片和点开去哪
export function todoRowOf(item: TodoItem, key: ModuleKey) {
  if (item.kind === 'order') {
    const url =
      key === 'shipping'
        ? `${SHIPPING}/ship/index?id=${item.order.id}`
        : `${SALES}/order-detail/index?id=${item.order.id}`
    return { ...orderRowOf(item.order, false), statusKind: 'orderStatus', amountText: '', url }
  }
  if (item.kind === 'after') {
    const url = `${SALES}/after-detail/index?id=${item.after.id}`
    return { ...afterRowOf(item.after, false), statusKind: 'afterStatus', tags: [], url }
  }
  return {
    id: `prepaid-${item.customerId}`,
    date: '',
    status: '',
    statusKind: '',
    title: item.customerName,
    total: copy.screen.prepaid(formatMoney(item.prepaidCents)),
    meta: '',
    amount: null,
    amountText: '',
    tags: [],
    url: `${FINANCE}/customer/index?id=${item.customerId}`,
  }
}
