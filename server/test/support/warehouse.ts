import type { contract, OutputOf, WhDocKind, WhDocDetail } from '@huazhong/shared'
import { sql } from 'drizzle-orm'
import { dataOf, idBy, TODAY, type SalesApp } from './sales.ts'

export async function whIds(s: SalesApp) {
  return {
    supplierId: await idBy(s.t, 'suppliers.name', '春禾花材'),
    materialId: await idBy(s.t, 'materials.name', '向日葵'),
    outCategoryId: await idBy(s.t, 'out_categories.name', '生产领用'),
  }
}
export async function whDocOf(s: SalesApp, kind: WhDocKind, qty = 10, supplierId?: string) {
  const ids = await whIds(s)
  return dataOf<WhDocDetail>(
    await (
      await s.as('u5')
    ).post('/warehouse/docs', {
      ...ids,
      supplierId: supplierId ?? ids.supplierId,
      kind,
      reason: kind === 'loss' ? '花头发黑' : '',
      imageFileIds: [],
      lines: [{ materialId: ids.materialId, qty, ...(kind === 'in' ? { priceCents: 200 } : {}) }],
    }),
  )
}
export async function stockQtyOf(s: SalesApp, materialId: string) {
  const result = await s.t.db.execute<{ qty: number }>(
    sql`SELECT coalesce(sum(left_qty),0)::int AS qty FROM stock_batches WHERE material_id=${Number(materialId)}`,
  )
  return result.rows[0]?.qty ?? 0
}
export async function paymentForDocs(
  s: SalesApp,
  supplierId: string,
  allocs: { docType: 'po' | 'wh'; docId: string; amountCents: number }[],
  amountCents = allocs.reduce((sum, row) => sum + row.amountCents, 0),
) {
  const ledger = dataOf<OutputOf<typeof contract.listUnpaidDocuments>>(
    await (await s.as('u6')).get(`/finance/suppliers/${supplierId}/unpaid-docs`),
  )
  return {
    supplierId,
    ledgerToken: ledger.ledgerToken,
    expected: ledger.items.map(({ docType, docId, version, unpaidCents }) => ({
      docType,
      docId,
      version,
      unpaidCents,
    })),
    allocs,
    amountCents,
    payDate: TODAY,
    methodName: '微信',
    note: '',
  }
}
