// 「有新结果要看」的提醒（2026-10-06 第 3 批）：采购单到货有差异（采购点「知道了」消掉）、
// 门店的售后结果和取消申请结果（门店点开详情消掉）。后台文案在 copy-notice.ts
import * as z from 'zod'
import { centsSchema, idSchema, timestampSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema } from './page.ts'

// 逐项差异：只列有差异的花材。实收和下单不同（少收、多收、拒收）、单价和下单时不同、收货后有退货，任一即列
export const poDiffLineSchema = z.object({
  poLineId: idSchema,
  name: z.string(),
  unit: z.string(),
  // 下单数量、实收（拒收为 0）
  qty: z.number().int().positive(),
  receivedQty: z.number().int().nonnegative(),
  short: z.boolean(),
  over: z.boolean(),
  // 改价前（下单单价）、改价后（现在单价）
  orderPriceCents: centsSchema,
  priceCents: centsSchema,
  repriced: z.boolean(),
  returnedQty: z.number().int().nonnegative(),
})
export type PoDiffLine = z.infer<typeof poDiffLineSchema>

// 差异范围（2026-10-06 用户定）：少收、多收、整单拒收、改价、收货后退货、作废已收货的采购单
export const poDiffSchema = z.object({
  notice: z.string(),
  lines: z.array(poDiffLineSchema),
  // 整单拒收（实收全 0，状态 rejected）：为 true 时 lines 恒为空数组，提示条头一行写 noticeCopy.poRejectedAll + rejectReason
  rejectedAll: z.boolean(),
  // 拒收原因取仓库收货时填的收货备注（recvNote），没填为 null
  rejectReason: z.string().nullable(),
  // 已收货的单被仓库作废（作废原因、时间看详情 voidReason、voidedAt）
  voided: z.boolean(),
  // 收货人、收货时间
  receivedBy: z.string().nullable(),
  receivedAt: timestampSchema.nullable(),
  // 最近一次出现差异（收货、改价、退货）的时间和经办人
  at: timestampSchema,
  byName: z.string(),
  // 下单采购员还没看过（最近差异晚于「知道了」）。「知道了」按钮看 actions 里有没有 ackDiff
  // （只给这张单的下单采购员和管理员）
  unseen: z.boolean(),
  seenAt: timestampSchema.nullable(),
})
export type PoDiff = z.infer<typeof poDiffSchema>

// 门店底栏「订单」角标 = orders + afters；订单页「订单」「售后」段名后的数字分别取 orders、afters
export const storeUnseenSchema = z.object({
  orders: z.number().int().nonnegative(),
  afters: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})
export type StoreUnseen = z.infer<typeof storeUnseenSchema>

export const storeUnseen = {
  method: 'GET',
  path: '/store/unseen',
  grants: ['store'],
  response: storeUnseenSchema,
  errors: [],
} as const satisfies Endpoint

// 门店打开订单详情、售后详情时调用；没有要看的结果也返回 200（重复调用无副作用），返回最新计数
export const markStoreOrderSeen = {
  method: 'POST',
  path: '/store/orders/:id/seen',
  grants: ['store'],
  params: idParamsSchema,
  response: storeUnseenSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint

export const markStoreAfterSeen = {
  method: 'POST',
  path: '/store/afters/:id/seen',
  grants: ['store'],
  params: idParamsSchema,
  response: storeUnseenSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
