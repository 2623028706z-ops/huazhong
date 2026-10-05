import { copy, redesignCopy, type ModuleKey } from '@huazhong/shared'
interface Entry {
  key: string
  icon: string
  text: string
  // 空：不跳页，组件发 entry 事件交给页面（仓库「盘点」直接弹分类层，2026-10-06 第 3 批）
  url: string
  wide?: boolean
}
const pages = (module: string, page: string, query = '') =>
  `/packages/${module}/pages/${page}/index${query}`
export const entriesOf: Partial<Record<ModuleKey, { common: Entry[]; masters: Entry[] }>> = {
  sales: {
    common: [
      {
        key: 'orders',
        icon: 'file-text',
        text: copy.screen.title.salesOrders,
        url: pages('sales', 'orders'),
      },
      {
        key: 'afters',
        icon: 'rotate-ccw',
        text: copy.screen.title.salesAfters,
        url: pages('sales', 'afters'),
      },
    ],
    masters: [
      {
        key: 'customers',
        icon: 'store',
        text: copy.screen.title.customers,
        url: pages('sales', 'customers'),
      },
      {
        key: 'catalog',
        icon: 'book-open',
        text: copy.screen.title.directory,
        url: pages('sales', 'catalog'),
      },
    ],
  },
  shipping: {
    common: [
      {
        key: 'shipments',
        icon: 'truck',
        text: copy.screen.title.shipList,
        url: pages('shipping', 'list'),
        wide: true,
      },
    ],
    masters: [],
  },
  purchase: {
    common: [
      {
        key: 'demand',
        icon: 'clipboard-list',
        text: copy.screen.title.demand,
        url: pages('purchase', 'demand'),
      },
      {
        key: 'orders',
        icon: 'file-text',
        text: copy.screen.title.purchaseOrders,
        url: pages('purchase', 'orders'),
      },
    ],
    masters: [
      {
        key: 'suppliers',
        icon: 'users-round',
        text: copy.screen.title.suppliers,
        url: pages('purchase', 'suppliers'),
      },
    ],
  },
  warehouse: {
    common: [
      {
        key: 'out',
        icon: 'arrow-up-from-line',
        text: copy.stock.verbOut,
        url: pages('warehouse', 'doc-form', '?kind=out'),
      },
      {
        key: 'loss',
        icon: 'trash-2',
        text: copy.stock.screen.titles.loss,
        url: pages('warehouse', 'doc-form', '?kind=loss'),
      },
      {
        key: 'stocktake',
        icon: 'clipboard-list',
        text: copy.stock.screen.titles.stocktakes,
        url: '',
      },
      {
        key: 'in',
        icon: 'arrow-down-to-line',
        text: copy.stock.screen.stockIn,
        url: pages('warehouse', 'doc-form', '?kind=in'),
      },
    ],
    // 定稿 090 没有「资料」：花材、出库分类从库存页底栏和出库单的分类弹层管
    masters: [],
  },
  finance: {
    common: [
      {
        key: 'customers',
        icon: 'book-open',
        text: copy.screen.title.arCustomers,
        url: pages('finance', 'customers'),
      },
      {
        key: 'suppliers',
        icon: 'scale',
        text: copy.screen.title.apSuppliers,
        url: pages('finance', 'suppliers'),
      },
      {
        key: 'records',
        icon: 'arrow-left-right',
        text: copy.screen.title.records,
        url: pages('finance', 'records'),
        wide: true,
      },
    ],
    masters: [],
  },
}
// 首页入口：从工作台进仓库多一格「库存」，六格正好三行，手工入库不再占整行；
// 单模块员工登录落在这里，没有返回也没有底栏：「我的」放进最后一组小格
const extraCommon = (key: ModuleKey, top: boolean): Entry[] =>
  key === 'warehouse' && !top
    ? [{ key: 'stock', icon: 'boxes', text: redesignCopy.stock, url: pages('warehouse', 'stock') }]
    : []
export const gridOf = (key: ModuleKey, top: boolean, noTabs: boolean) => {
  const entries = entriesOf[key] ?? { common: [], masters: [] },
    my: Entry = { key: 'my', icon: 'user-round', text: copy.tab.my, url: '/pages/my/index' },
    masters = [...entries.masters, ...(top && noTabs ? [my] : [])]
  return {
    common: [...entries.common, ...extraCommon(key, top)].map((row) => ({
      ...row,
      wide: row.wide === true && top,
      disabled: false,
    })),
    masters: masters.map((row) => ({ ...row, disabled: false })),
    mastersTitle: entries.masters.length ? redesignCopy.masters : copy.tab.my,
  }
}
// 待办点进筛好的列表；待办只放「该我动手」的事（03 章第 8.5 节）
export const todoUrls: Record<string, string> = {
  pendingOrders: pages('sales', 'orders', '?status=pending_confirm'),
  cancelRequests: pages('sales', 'orders', '?cancelRequested=true'),
  pendingAfters: pages('sales', 'afters', '?status=pending'),
  dueShipments: pages('shipping', 'list', '?status=to_ship&dueOnly=true'),
  shortageMaterials: pages('purchase', 'demand'),
  poDiffs: pages('purchase', 'orders', '?diffUnseen=true'),
  pendingReceives: pages('warehouse', 'pending'),
  agedStock: pages('warehouse', 'stock', '?aged=true'),
  overdueReceivable: pages('finance', 'customers', '?filter=overdue'),
  customerStatementReady: pages('finance', 'customers', '?filter=unstatemented'),
  supplierStatementReady: pages('finance', 'suppliers', '?filter=unstatemented'),
}
