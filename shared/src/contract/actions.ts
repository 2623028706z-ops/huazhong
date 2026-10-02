// 操作码和 actions 的结构（05 章第 1.5 节）
import * as z from 'zod'

export const actionCodes = [
  // 列表级
  'create',
  'createCustomer',
  'manageCategories',
  'inviteSupplier',
  'createPo',
  'stockIn',
  'stockOut',
  'registerReceipt',
  'createAfter',
  'applyAfter',
  // 单据级
  'storeEdit',
  'storeCancel',
  'confirm',
  'editAndConfirm',
  'edit',
  'cancel',
  'ship',
  'processAfter',
  'closeAfter',
  'voidAfter',
  'allocate',
  'voidReceipt',
  'editPo',
  'changeSupplier',
  'cancelPo',
  'supplierEditPo',
  'supplierCancelPo',
  'receive',
  'return',
  'reprice',
  'void',
  'registerPayment',
  'allocatePrepaid',
  'refundReceipt',
  'refundPayment',
  'voidRefund',
  'revokeAllocation',
  'revokePaymentAllocation',
  'voidPo',
  'voidOrder',
  'requestCancel',
  'withdrawCancel',
  'approveCancel',
  'rejectCancel',
  'copyCatalog',
  'voidPayment',
  'editInvite',
  'cancelInvite',
  'shareInvite',
  'submitSupply',
  'inviteStore',
  'unbindStoreWechat',
  'unbindStaffWechat',
] as const
export type ActionCode = (typeof actionCodes)[number]

// enabled 为 true 时 disabledReason 一定是 null
export const actionSchema = z.discriminatedUnion('enabled', [
  z.object({
    code: z.enum(actionCodes),
    enabled: z.literal(true),
    disabledReason: z.null(),
    reasonRequired: z.boolean().nullable(),
  }),
  z.object({
    code: z.enum(actionCodes),
    enabled: z.literal(false),
    disabledReason: z.string(),
    reasonRequired: z.boolean().nullable(),
  }),
])
export type Action = z.infer<typeof actionSchema>
