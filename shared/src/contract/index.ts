import { batchConfirmOrders, batchShipOrders } from './order-writes.ts'
import { getFinanceOrder } from './orders.ts'
import { getFinancePurchaseOrder } from './purchase.ts'
import { getFinanceWhDoc } from './stock.ts'
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
import {
  getArCustomer,
  listArCustomers,
  getFinanceSupplier,
  listFinanceSuppliers,
  statementDraft,
  listStatements,
  createStatement,
  getStatement,
  getBusinessStatement,
  voidStatement,
  shareStatement,
  listUnsettledCustomerStatements,
  listUnsettledSupplierStatements,
  customerTerms,
  supplierTerms,
  updateCustomerTerms,
  updateSupplierTerms,
  listReceivables,
  listPayables,
} from './finance.ts'
import {
  storeStatements,
  storeStatementDetail,
  supplierStatements,
  supplierStatementDetail,
} from './external-finance.ts'
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
import { createReceipt, getReceipt, listFinanceRecords, voidReceipt } from './receipts.ts'
import { createStaff, listStaff, unbindStaffWechat, updateStaff } from './staff.ts'
import { getStoreInvite, useStoreInvite } from './store-invites.ts'
import { cancelStoreOrder, createStoreOrder, storeCatalog, updateStoreOrder } from './store.ts'
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
import { createRefund, voidRefund } from './refunds.ts'
import { reviewPurchase } from './purchase-review.ts'
import { getFinanceAfter } from './afters.ts'
import { supplierUpdatePurchaseOrder, supplierCancelPurchaseOrder } from './purchase.ts'
import {
  createOutCategory,
  createStocktake,
  createWhDoc,
  getStocktake,
  getStocktakeDraft,
  getSupplierStockIn,
  getWhDoc,
  listOutCategories,
  listStockMoves,
  listStocktakes,
  listWhDocs,
  repriceWhDoc,
  updateOutCategory,
  voidWhDoc,
} from './stock.ts'

export const contract = {
  batchConfirmOrders,
  batchShipOrders,
  getFinanceOrder,
  getFinancePurchaseOrder,
  getFinanceWhDoc,
  statementDraft,
  listStatements,
  createStatement,
  getStatement,
  getBusinessStatement,
  voidStatement,
  shareStatement,
  listUnsettledCustomerStatements,
  listUnsettledSupplierStatements,
  customerTerms,
  supplierTerms,
  updateCustomerTerms,
  updateSupplierTerms,
  listReceivables,
  storeStatements,
  storeStatementDetail,
  supplierStatements,
  supplierStatementDetail,

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
  createRefund,
  voidRefund,
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
  storeCatalog,
  createStoreOrder,
  updateStoreOrder,
  cancelStoreOrder,
  // 财务收款
  listArCustomers,
  getArCustomer,
  createReceipt,
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
  receivePurchaseOrder,
  returnPurchaseOrder,
  repricePurchaseOrder,
  listPayables,
  listFinanceSuppliers,
  getFinanceSupplier,
  createPayment,
  getPayment,
  voidPayment,
  // 阶段 5：手工入库、手工出库、报损、出库分类、盘点、出入库记录
  listWhDocs,
  getWhDoc,
  createWhDoc,
  repriceWhDoc,
  voidWhDoc,
  getSupplierStockIn,
  listOutCategories,
  createOutCategory,
  updateOutCategory,
  listStocktakes,
  getStocktakeDraft,
  getStocktake,
  createStocktake,
  listStockMoves,
  // 图片上传
  requestUploadTicket,
  completeUpload,
} as const
export type Contract = typeof contract
export type EndpointName = keyof Contract
