// 接口契约：按开发阶段增长（08 章），每个接口在这里登记一次。
// 后端每个路由都必须对应这里的一项，这里的每一项后端都必须实现（server/test/contract.test.ts）。
import {
  closeAfter,
  createAfter,
  createStoreAfter,
  getAfter,
  listAfters,
  processAfter,
  voidAfter,
} from './afters.ts'
import { bindPhone, unbind } from './auth.ts'
import {
  createCatalogCategory,
  deleteCatalogCategory,
  getCatalog,
  orderCatalogCategories,
  saveCatalogItem,
  updateCatalogCategory,
} from './catalog.ts'
import {
  createCustomer,
  createStore,
  createStoreInvite,
  listCustomers,
  listStoreInvites,
  unbindStoreWechat,
  updateCustomer,
  updateStore,
} from './customers.ts'
import { completeUpload, requestUploadTicket } from './files.ts'
import { getArCustomer, getArOrder, listArCustomers, listUnpaidOrders } from './finance.ts'
import { listInventory, listMaterialCategories } from './inventory.ts'
import { getLog, listLogs } from './logs.ts'
import { me } from './me.ts'
import { createMethod, listMethods, updateMethod } from './methods.ts'
import { cancelOrder, confirmOrder, createOrder, shipOrder, updateOrder } from './order-writes.ts'
import { getOrder, listOrders, listShippingOrders } from './orders.ts'
import {
  createProduct,
  createProductCategory,
  deleteProductCategory,
  listProductCategories,
  listProducts,
  orderProductCategories,
  updateProduct,
  updateProductCategory,
} from './products.ts'
import {
  allocatePrepaid,
  createReceipt,
  getReceipt,
  listFinanceRecords,
  voidReceipt,
} from './receipts.ts'
import { createStaff, listStaff, unbindStaffWechat, updateStaff } from './staff.ts'
import { getStoreInvite, useStoreInvite } from './store-invites.ts'
import {
  cancelStoreOrder,
  createStoreOrder,
  storeCatalog,
  storeHome,
  storeStatement,
  updateStoreOrder,
} from './store.ts'
import { moduleTodos } from './todos.ts'
import {
  createMaterial,
  createMaterialCategory,
  getMaterial,
  listMaterials,
  supplierMaterials,
  updateMaterial,
  updateMaterialCategory,
  warehouseStock,
} from './materials.ts'
import {
  cancelInvite,
  cancelPurchaseOrder,
  createInvite,
  createPurchaseOrder,
  getInvite,
  getPurchaseOrder,
  listDemandSources,
  listInvites,
  listPurchaseDemand,
  listPurchaseOrders,
  resolveSupplierInvite,
  shareInvite,
  submitSupplierInvite,
  supplierInvite,
  supplierInvites,
  supplierPurchaseOrder,
  supplierPurchaseOrders,
  updateInvite,
  updatePurchaseOrder,
} from './purchase.ts'
import { createSupplier, getSupplier, listSuppliers, updateSupplier } from './suppliers.ts'
import { createPayment, getPayment, voidPayment } from './payments.ts'
import {
  getFinanceSupplier,
  getApDocument,
  listUnpaidDocuments,
  listFinanceSuppliers,
  listPayables,
  supplierStatement,
} from './ap.ts'
import {
  receivePurchaseOrder,
  repricePurchaseOrder,
  returnPurchaseOrder,
} from './purchase-warehouse.ts'

import { voidPurchaseOrder } from './purchase-warehouse.ts'
import { getShippingOrder } from './orders.ts'
import {
  requestOrderCancel,
  withdrawOrderCancel,
  approveOrderCancel,
  rejectOrderCancel,
  voidOrder,
} from './order-writes.ts'
import { previewCatalogCopy, copyCatalog } from './catalog.ts'
import { allocatePaymentPrepaid } from './payments.ts'
import { createRefund, voidRefund, revokeAllocation, revokePaymentAllocation } from './refunds.ts'
import { reviewPurchase } from './purchase-review.ts'
import { getFinanceAfter } from './afters.ts'
import { supplierUpdatePurchaseOrder, supplierCancelPurchaseOrder } from './purchase.ts'

export const contract = {
  getFinanceAfter,
  supplierUpdatePurchaseOrder,
  supplierCancelPurchaseOrder,
  getShippingOrder,
  requestOrderCancel,
  withdrawOrderCancel,
  approveOrderCancel,
  rejectOrderCancel,
  voidOrder,
  previewCatalogCopy,
  copyCatalog,
  allocatePaymentPrepaid,
  createRefund,
  voidRefund,
  revokeAllocation,
  revokePaymentAllocation,
  reviewPurchase,
  voidPurchaseOrder,
  me,
  bindPhone,
  unbind,
  getStoreInvite,
  useStoreInvite,
  listStaff,
  createStaff,
  updateStaff,
  unbindStaffWechat,
  listLogs,
  getLog,
  listInventory,
  listMaterialCategories,
  moduleTodos,
  // 销售：主数据
  listCustomers,
  createCustomer,
  updateCustomer,
  createStore,
  updateStore,
  unbindStoreWechat,
  createStoreInvite,
  listStoreInvites,
  listProductCategories,
  createProductCategory,
  updateProductCategory,
  orderProductCategories,
  deleteProductCategory,
  listProducts,
  createProduct,
  updateProduct,
  getCatalog,
  saveCatalogItem,
  createCatalogCategory,
  updateCatalogCategory,
  orderCatalogCategories,
  deleteCatalogCategory,
  // 订单、发货
  listOrders,
  listShippingOrders,
  getOrder,
  createOrder,
  confirmOrder,
  updateOrder,
  cancelOrder,
  shipOrder,
  // 售后
  listAfters,
  getAfter,
  createAfter,
  processAfter,
  closeAfter,
  voidAfter,
  createStoreAfter,
  // 门店端
  storeHome,
  storeCatalog,
  createStoreOrder,
  updateStoreOrder,
  cancelStoreOrder,
  storeStatement,
  // 财务收款
  listArCustomers,
  getArCustomer,
  listUnpaidOrders,
  getArOrder,
  createReceipt,
  allocatePrepaid,
  getReceipt,
  voidReceipt,
  listFinanceRecords,
  listMethods,
  createMethod,
  updateMethod,
  listMaterials,
  createMaterial,
  getMaterial,
  updateMaterial,
  createMaterialCategory,
  updateMaterialCategory,
  warehouseStock,
  // 阶段 4：采购、供应商端、收货、采购付款
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  cancelPurchaseOrder,
  listPurchaseDemand,
  listDemandSources,
  listInvites,
  getInvite,
  createInvite,
  updateInvite,
  cancelInvite,
  shareInvite,
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  supplierInvites,
  supplierInvite,
  resolveSupplierInvite,
  submitSupplierInvite,
  supplierMaterials,
  supplierPurchaseOrders,
  supplierPurchaseOrder,
  supplierStatement,
  receivePurchaseOrder,
  returnPurchaseOrder,
  repricePurchaseOrder,
  listPayables,
  listFinanceSuppliers,
  getFinanceSupplier,
  getApDocument,
  listUnpaidDocuments,
  createPayment,
  getPayment,
  voidPayment,
  // 图片上传
  requestUploadTicket,
  completeUpload,
} as const
export type Contract = typeof contract
export type EndpointName = keyof Contract
