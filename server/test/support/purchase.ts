import type {
  contract,
  InviteDetail,
  PoDetail,
  Supplier,
  StatementDetail,
  PaymentCreate,
} from '@huazhong/shared'
import type { ParsedInput } from '../../src/common/endpoint.ts'
import { dataOf, idBy, TODAY, type SalesApp } from './sales.ts'
import { openStatement } from './statements.ts'

export async function poOf(s: SalesApp, no = 'PO-260929-007') {
  const id = await idBy(s.t, 'purchase_orders.no', no)
  return dataOf<PoDetail>(await (await s.as('u4')).get(`/purchase-orders/${id}`))
}
export async function inviteOf(s: SalesApp, no = 'YQ-260929-001') {
  const id = await idBy(s.t, 'invites.no', no)
  return dataOf<InviteDetail>(await (await s.as('u4')).get(`/invites/${id}`))
}
export async function supplierOf(s: SalesApp, name = '春禾花材') {
  const id = await idBy(s.t, 'suppliers.name', name)
  return dataOf<Supplier>(await (await s.as('u4')).get(`/suppliers/${id}`))
}
export function supplierInput(row: Supplier) {
  return {
    name: row.name,
    contact: row.contact,
    phone: row.phone,
    address: row.address,
    enabled: row.enabled,
    version: row.version,
    account: { enabled: row.account.enabled, loginPhone: row.account.loginPhone },
  }
}
export function poInput(po: Pick<PoDetail, 'version' | 'supplierId' | 'note' | 'lines'>) {
  return {
    version: po.version,
    supplierId: po.supplierId,
    note: po.note ?? '',
    reason: '',
    lines: po.lines.map((line) => ({
      materialId: line.materialId,
      qty: line.qty,
      priceCents: line.priceCents,
    })),
  }
}
export function receiveInput(po: Pick<PoDetail, 'version' | 'lines'>) {
  return {
    version: po.version,
    recvNote: '',
    lines: po.lines.map((line) => ({
      poLineId: line.id,
      receivedQty: line.qty,
      priceCents: line.priceCents,
    })),
  }
}
export async function payInput(s: SalesApp, po: PoDetail): Promise<PaymentCreate> {
  const finance = await s.as('u6')
  let statement: StatementDetail
  if (po.statement)
    statement = dataOf<StatementDetail>(await finance.get(`/finance/statements/${po.statement.id}`))
  else statement = await openStatement(s, 'supplier', po.supplierId, [{ type: 'po', id: po.id }])
  return {
    supplierId: po.supplierId,
    statements: [{ id: statement.id, version: statement.version }],
    amountCents: statement.dueCents,
    payDate: TODAY,
    methodName: '微信',
    note: '',
    discountCents: 0,
    discountReason: '',
  }
}
export async function createPo(
  s: SalesApp,
  options: Partial<ParsedInput<typeof contract.createPurchaseOrder>['body']> = {},
) {
  const body = {
    supplierId: await idBy(s.t, 'suppliers.name', '春禾花材'),
    note: '',
    lines: [{ materialId: await idBy(s.t, 'materials.name', '向日葵'), qty: 60, priceCents: 350 }],
    ...options,
  }
  return dataOf<PoDetail>(await (await s.as('u4')).post('/purchase-orders', body))
}
export async function stockQty(s: SalesApp, name: string) {
  const id = await idBy(s.t, 'materials.name', name)
  return dataOf<{ stockQty: number }>(await (await s.as('u5')).get(`/materials/${id}`)).stockQty
}
