import { describe, expect, it } from 'vitest'
import {
  contract,
  listLogs,
  moduleKeys,
  receiptCreateSchema,
  paymentCreateSchema,
  allocKinds,
  shippingCardSchema,
  shippingLineSchema,
  shippingDetailSchema,
  storeAfterCreateSchema,
  copy,
  labels,
  statusOf,
} from '../src/index.ts'

describe('review rework contracts', () => {
  it('declares review-token and refund-blocking errors instead of projecting them to INTERNAL', () => {
    expect(contract.createPurchaseOrder.errors).toContain('STALE')
    expect(contract.createInvite.errors).toContain('STALE')
    expect(contract.voidReceipt.errors).toContain('BUSINESS_RULE')
    expect(contract.requestOrderCancel.body.safeParse({ version: 1 }).success).toBe(true)
    const rejection = contract.rejectOrderCancel.body.safeParse({ version: 1, reason: ' ' })
    expect(rejection.success).toBe(false)
    if (!rejection.success)
      expect(rejection.error.issues[0]?.message).toBe(copy.rework.rejectReasonRequired)
  })
  it('requires an employee purchase change reason but permits a blank supplier reason', () => {
    const body = {
      supplierId: '1',
      note: '',
      version: 1,
      reason: '   ',
      lines: [{ materialId: '1', qty: 1, priceCents: 100 }],
    }
    expect(contract.updatePurchaseOrder.body.safeParse(body).success).toBe(false)
    expect(
      contract.updatePurchaseOrder.body.safeParse({ ...body, reason: '数量调整' }).success,
    ).toBe(true)
    expect(contract.supplierUpdatePurchaseOrder.body.safeParse(body).success).toBe(true)
    const { reason: _reason, ...noReason } = body
    expect(_reason).toBe('   ')
    expect(contract.supplierUpdatePurchaseOrder.body.safeParse(noReason).success).toBe(true)
    expect(contract.cancelPurchaseOrder.body.safeParse({ version: 1, reason: ' ' }).success).toBe(
      false,
    )
    expect(
      contract.supplierCancelPurchaseOrder.body.safeParse({ version: 1, reason: ' ' }).success,
    ).toBe(false)
  })
  it('provides nonempty rework copy and all cancellation/allocation status labels', () => {
    for (const value of Object.values(copy.rework)) {
      if (typeof value === 'string') expect(value.trim()).not.toBe('')
    }
    expect(copy.rework.allocationAmounts(100, 0)).toContain('生效 ¥0.00')
    expect(copy.rework.ledgerDifference(100, 0)).not.toContain('undefined')
    expect(copy.rework.noLongerUnpaid('PO-1')).toContain('PO-1')
    expect(copy.rework.copySummary(2)).toContain('2')
    expect(copy.rework.overdueSummary(3)).toContain('3')
    expect(Object.keys(labels.cancelRequestStatus)).toHaveLength(5)
    expect(statusOf('allocationStatus', 'valid')).toEqual({ text: '有效', tone: 'done' })
    expect(statusOf('allocationStatus', 'revoked')).toEqual({ text: '已撤回', tone: 'ended' })
  })
  it('G30/G30-F: requires log filter modules in the shared response rather than current job grants', () => {
    const response = {
      items: [],
      nextCursor: null,
      actions: [],
      filterModules: ['sales', 'warehouse'],
    }
    const valid = listLogs.response.safeParse(response)
    expect(valid.success).toBe(true)
    expect(
      listLogs.response.safeParse({ ...response, filterModules: [...moduleKeys] }).success,
    ).toBe(true)
    expect(listLogs.response.safeParse({ ...response, filterModules: ['public'] }).success).toBe(
      false,
    )
    const { filterModules, ...missing } = response
    expect(listLogs.response.safeParse(missing).success).toBe(false)
    expect(filterModules).toEqual(['sales', 'warehouse'])
  })
  it('removes both legacy finance semantics and exposes the symmetric operations', () => {
    expect(allocKinds).toEqual(['direct', 'prepaid'])
    expect('getPayable' in contract).toBe(false)
    expect(contract.createPayment.path).toBe('/finance/payments')
    expect(contract.allocatePaymentPrepaid.path).toBe('/finance/prepaid-payment-allocations')
    expect(contract.revokePaymentAllocation.path).toBe('/finance/payment-allocations/:id/revoke')
    expect(contract.createRefund.path).toBe('/finance/refunds')
  })
  it('requires complete snapshot credentials for receipt and supplier payment creation', () => {
    const source = {
      receiptDate: '2026-10-02',
      payDate: '2026-10-02',
      customerId: '1',
      supplierId: '1',
      amountCents: 100,
      methodName: '现金',
      note: '',
      allocs: [],
      ledgerToken: 'test-snapshot',
      expected: [],
    }
    expect(receiptCreateSchema.safeParse(source).success).toBe(true)
    expect(paymentCreateSchema.safeParse(source).success).toBe(true)
    const { ledgerToken, ...missing } = source
    expect(receiptCreateSchema.safeParse(missing).success).toBe(false)
    expect(paymentCreateSchema.safeParse(missing).success).toBe(false)
    expect(ledgerToken).toBeTruthy()
  })
  it('supplier payments and prepaid allocations distinguish same-ID purchase and manual documents, but reject actual duplicates', () => {
    const refs = [
      { docType: 'po', docId: '1' },
      { docType: 'wh', docId: '1' },
    ]
    const source = {
      supplierId: '1',
      ledgerToken: 'test-snapshot',
      payDate: '2026-10-02',
      methodName: '现金',
      amountCents: 200,
      note: '',
      expected: refs.map((row) => ({ ...row, version: 1, unpaidCents: 100 })),
      allocs: refs.map((row) => ({ ...row, amountCents: 100 })),
    }
    for (const schema of [paymentCreateSchema, contract.allocatePaymentPrepaid.body]) {
      expect(schema.safeParse(source).success).toBe(true)
      expect(
        schema.safeParse({ ...source, allocs: [source.allocs[0], source.allocs[0]] }).success,
      ).toBe(false)
      expect(
        schema.safeParse({ ...source, expected: [source.expected[0], source.expected[0]] }).success,
      ).toBe(false)
    }
    expect(() => structuredClone(copy.stock.screen)).not.toThrow()
  })
  it('shipping schemas do not expose amount or price fields and reject accidental leaks', () => {
    expect('amountCents' in shippingCardSchema.shape).toBe(false)
    expect('priceCents' in shippingLineSchema.shape).toBe(false)
    expect('listPriceCents' in shippingLineSchema.shape).toBe(false)
    expect('afters' in shippingDetailSchema.shape).toBe(false)
    expect('allocations' in shippingDetailSchema.shape).toBe(false)
  })
  it('A48: requires an image for damage or quality but not quantity mismatch', () => {
    expect(
      storeAfterCreateSchema.safeParse({
        orderId: '1',
        lines: [
          {
            orderLineId: '1',
            qty: 1,
            reason: 'damaged',
            description: '花材损坏',
            imageFileIds: [],
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      storeAfterCreateSchema.safeParse({
        orderId: '1',
        lines: [
          {
            orderLineId: '1',
            qty: 1,
            reason: 'damaged',
            description: '花材损坏',
            imageFileIds: ['1'],
          },
        ],
      }).success,
    ).toBe(true)
    expect(
      storeAfterCreateSchema.safeParse({
        orderId: '1',
        lines: [
          {
            orderLineId: '1',
            qty: 1,
            reason: 'qty_mismatch',
            description: '数量不符',
            imageFileIds: [],
          },
        ],
      }).success,
    ).toBe(true)
  })
})
