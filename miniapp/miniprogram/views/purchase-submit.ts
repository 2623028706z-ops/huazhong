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
