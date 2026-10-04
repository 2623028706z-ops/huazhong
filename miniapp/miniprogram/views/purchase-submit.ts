import { contract } from '@huazhong/shared'
import { request } from '../core/request'
import type { PurchaseMode } from './purchase-form-data'

export async function submitPurchase({
  mode,
  id,
  body,
  key,
  supplierEditing,
}: {
  mode: PurchaseMode
  id: string
  body: unknown
  key: string
  supplierEditing: boolean
}) {
  const params = { id },
    options = { idempotencyKey: key }
  if (mode === 'invite') {
    if (id)
      return request(contract.updateInvite, {
        params,
        body: contract.updateInvite.body.parse(body),
      })
    return request(contract.createInvite, { body: contract.createInvite.body.parse(body) }, options)
  }
  if (!id)
    return request(
      contract.createPurchaseOrder,
      { body: contract.createPurchaseOrder.body.parse(body) },
      options,
    )
  if (supplierEditing)
    return request(contract.supplierUpdatePurchaseOrder, {
      params,
      body: contract.supplierUpdatePurchaseOrder.body.parse(body),
    })
  return request(contract.updatePurchaseOrder, {
    params,
    body: contract.updatePurchaseOrder.body.parse(body),
  })
}

export function submitSupply(id: string, body: unknown, key: string) {
  return request(
    contract.submitSupplierInvite,
    { params: { id }, body: contract.submitSupplierInvite.body.parse(body) },
    { idempotencyKey: key },
  )
}
// 供应商提交填报后回到填报邀请列表；从分享链接直接打开时没有上一页，就换到列表
export function leaveAfterSupply() {
  if (getCurrentPages().length > 1) void wx.navigateBack()
  else void wx.reLaunch({ url: '/packages/supplier/pages/invites/index' })
}
