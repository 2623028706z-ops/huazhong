import { copy, redesignCopy, type ModuleKey } from '@huazhong/shared'
interface Entry {
  key: string
  icon: string
  text: string
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
        text: copy.screen.label.customer,
        url: pages('sales', 'customers'),
      },
      {
        key: 'products',
        icon: 'flower-2',
        text: copy.screen.title.products,
        url: pages('sales', 'products'),
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
        key: 'receive',
        icon: 'truck',
        text: redesignCopy.receiving,
        url: pages('warehouse', 'pending'),
      },
      {
        key: 'out',
        icon: 'arrow-up-from-line',
        text: copy.stock.screen.stockOut,
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
        url: pages('warehouse', 'stocktakes'),
      },
      {
        key: 'in',
        icon: 'arrow-down-to-line',
        text: copy.stock.screen.stockIn,
        url: pages('warehouse', 'doc-form', '?kind=in'),
        wide: true,
      },
    ],
    masters: [
      {
        key: 'materials',
        icon: 'flower-2',
        text: copy.screen.title.materials,
        url: pages('warehouse', 'materials'),
      },
      {
        key: 'out-categories',
        icon: 'notebook-text',
        text: copy.stock.screen.titles.categories,
        url: pages('warehouse', 'out-categories'),
      },
    ],
  },
  finance: {
    common: [
      {
        key: 'customers',
        icon: 'store',
        text: copy.screen.title.arCustomers,
        url: pages('finance', 'customers'),
      },
      {
        key: 'suppliers',
        icon: 'truck',
        text: copy.screen.title.apSuppliers,
        url: pages('finance', 'suppliers'),
      },
      {
        key: 'records',
        icon: 'scroll-text',
        text: copy.screen.title.records,
        url: pages('finance', 'records'),
        wide: true,
      },
    ],
    masters: [],
  },
}
export const todoUrls: Record<string, string> = {
  pendingOrders: pages('sales', 'orders', '?status=pending_confirm'),
  cancelRequests: pages('sales', 'orders', '?cancelRequested=true'),
  pendingAfters: pages('sales', 'afters', '?status=pending'),
  dueShipments: pages('shipping', 'list', '?status=to_ship&dueOnly=true'),
  pendingInvites: pages('purchase', 'demand', '?tab=invites'),
  pendingPurchaseOrders: pages('purchase', 'orders', '?status=to_receive'),
  pendingReceives: pages('warehouse', 'pending'),
  agedStock: pages('warehouse', 'stock', '?aged=true'),
  receivable: pages('finance', 'customers', '?filter=outstanding'),
  overdueReceivable: pages('finance', 'customers', '?filter=overdue'),
  payable: pages('finance', 'suppliers', '?filter=outstanding'),
}
