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
const PURCHASE = '/packages/purchase/pages'
const WAREHOUSE = '/packages/warehouse/pages'

export const entriesOf: Partial<Record<ModuleKey, Entry[]>> = {
  purchase: [
    {
      key: 'demand',
      icon: 'clipboard-list',
      text: copy.screen.title.demand,
      url: `${PURCHASE}/demand/index`,
    },
    {
      key: 'orders',
      icon: 'file-text',
      text: copy.screen.title.purchaseOrders,
      url: `${PURCHASE}/orders/index`,
    },
    {
      key: 'invites',
      icon: 'clipboard-pen',
      text: copy.screen.title.invites,
      url: `${PURCHASE}/invites/index`,
    },
    {
      key: 'suppliers',
      icon: 'users-round',
      text: copy.screen.title.suppliers,
      url: `${PURCHASE}/suppliers/index`,
    },
  ],
  warehouse: [
    {
      key: 'stock-in',
      icon: 'file-text',
      text: copy.stock.screen.titles.in,
      url: `${WAREHOUSE}/docs/index?kind=in`,
    },
    {
      key: 'stock-out',
      icon: 'file-text',
      text: copy.stock.screen.titles.out,
      url: `${WAREHOUSE}/docs/index?kind=out`,
    },
    {
      key: 'loss',
      icon: 'rotate-ccw',
      text: copy.stock.screen.titles.loss,
      url: `${WAREHOUSE}/docs/index?kind=loss`,
    },
    {
      key: 'stocktakes',
      icon: 'clipboard-list',
      text: copy.stock.screen.titles.stocktakes,
      url: `${WAREHOUSE}/stocktakes/index`,
    },
    {
      key: 'moves',
      icon: 'scroll-text',
      text: copy.stock.screen.titles.moves,
      url: `${WAREHOUSE}/moves/index`,
    },
    {
      key: 'out-categories',
      icon: 'notebook-text',
      text: copy.stock.screen.titles.categories,
      url: `${WAREHOUSE}/out-categories/index`,
    },
    {
      key: 'pending',
      icon: 'truck',
      text: copy.screen.title.pendingReceive,
      url: `${WAREHOUSE}/pending/index`,
    },
    { key: 'stock', icon: 'boxes', text: copy.screen.title.stock, url: `${WAREHOUSE}/stock/index` },
    {
      key: 'materials',
      icon: 'flower-2',
      text: copy.screen.title.materials,
      url: `${WAREHOUSE}/materials/index`,
    },
  ],
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
      key: 'suppliers',
      icon: 'notebook-text',
      text: copy.screen.title.apSuppliers,
      url: `${FINANCE}/suppliers/index`,
    },
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
  purchase: {
    empty: copy.screen.empty.invites,
    all: `${PURCHASE}/invites/index?status=pending`,
    idle: null,
  },
  warehouse: {
    empty: copy.screen.empty.purchaseOrders,
    all: `${WAREHOUSE}/pending/index`,
    idle: null,
  },
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
  finance: { empty: copy.screen.empty.todos, all: `${FINANCE}/suppliers/index`, idle: null },
}

type TodoOf<K extends TodoItem['kind']> = Extract<TodoItem, { kind: K }>
function salesTodo(item: TodoOf<'order'> | TodoOf<'after'>, key: ModuleKey) {
  if (item.kind === 'order') {
    const url =
      key === 'shipping'
        ? `${SHIPPING}/ship/index?id=${item.order.id}`
        : `${SALES}/order-detail/index?id=${item.order.id}`
    return { ...orderRowOf(item.order, false), statusKind: 'orderStatus', amountText: '', url }
  }
  return {
    ...afterRowOf(item.after, false),
    statusKind: 'afterStatus',
    tags: [],
    url: `${SALES}/after-detail/index?id=${item.after.id}`,
  }
}
function purchaseTodo(item: TodoOf<'invite'> | TodoOf<'purchaseOrder'>) {
  if (item.kind === 'invite') {
    return {
      id: item.invite.id,
      date: item.invite.inviteDate,
      status: item.invite.status,
      statusKind: 'inviteStatus',
      title: item.invite.supplierName,
      total: '',
      meta: item.invite.no,
      amount: null,
      amountText: '',
      tags: [],
      url: `${PURCHASE}/invites/index?id=${item.invite.id}`,
    }
  }
  return {
    id: item.purchaseOrder.id,
    date: item.purchaseOrder.orderDate,
    status: item.purchaseOrder.status,
    statusKind: 'poStatus',
    title: item.purchaseOrder.supplierName,
    total: '',
    meta: item.purchaseOrder.no,
    amount: item.purchaseOrder.amountCents,
    amountText: '',
    tags: [],
    url: `${WAREHOUSE}/receive/index?id=${item.purchaseOrder.id}`,
  }
}
function financeTodo(item: TodoOf<'payable'> | TodoOf<'prepaid'>) {
  if (item.kind === 'payable') {
    const po = item.payable
    return {
      id: `payable-${po.docType}-${po.id}`,
      date: po.apDate,
      status: po.apStatus,
      statusKind: 'apStatus',
      title: po.supplierName,
      total: '',
      meta: [
        po.docType === 'wh' ? copy.stock.screen.stockIn : copy.screen.title.purchaseOrders,
        po.no,
      ].join(copy.separator),
      amount: po.unpaidCents,
      amountText: '',
      tags: [],
      url: `${FINANCE}/supplier/index?id=${po.supplierId}`,
    }
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
// 一条待办的卡片和点开去哪
export function todoRowOf(item: TodoItem, key: ModuleKey) {
  if (item.kind === 'order' || item.kind === 'after') return salesTodo(item, key)
  if (item.kind === 'invite' || item.kind === 'purchaseOrder') return purchaseTodo(item)
  return financeTodo(item)
}
