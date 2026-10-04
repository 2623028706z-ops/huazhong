import { describe, expect, it } from 'vitest'
import {
  contract,
  listLogs,
  moduleKeys,
  receiptCreateSchema,
  paymentCreateSchema,
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
  it('provides current cancellation and statement labels', () => {
    for (const value of Object.values(copy.rework))
      if (typeof value === 'string') expect(value.trim()).not.toBe('')
    expect(Object.keys(labels.cancelRequestStatus)).toHaveLength(5)
    expect(statusOf('statementStatus', 'unsettled')).toEqual({ text: '未结清', tone: 'wait' })
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
  it('removes allocation APIs and exposes symmetric statement settlement', () => {
    for (const key of [
      'getPayable',
      'allocatePrepaid',
      'allocatePaymentPrepaid',
      'revokeAllocation',
      'revokePaymentAllocation',
      'storeHome',
      'storeStatement',
      'supplierStatement',
    ])
      expect(key in contract).toBe(false)
    expect(contract.createStatement.path).toBe('/finance/statements')
    expect(contract.createPayment.path).toBe('/finance/payments')
    expect(contract.createRefund.path).toBe('/finance/refunds')
  })
  it('settles whole statements without full-ledger credentials; requires a discount reason and unique IDs', () => {
    const input = {
      receiptDate: '2026-10-02',
      payDate: '2026-10-02',
      customerId: '1',
      supplierId: '1',
      amountCents: 100,
      discountCents: 0,
      discountReason: '',
      methodName: '现金',
      note: '',
      statements: [],
    }
    for (const schema of [receiptCreateSchema, paymentCreateSchema]) {
      expect(schema.safeParse(input).success).toBe(true)
      expect(schema.safeParse({ ...input, discountCents: 1 }).success).toBe(false)
      expect(
        schema.safeParse({ ...input, statements: [{ id: '1', version: 1 }], discountCents: 1 })
          .success,
      ).toBe(false)
      expect(
        schema.safeParse({
          ...input,
          statements: [{ id: '1', version: 1 }],
          discountCents: 1,
          discountReason: '抹零',
        }).success,
      ).toBe(true)
      expect(
        schema.safeParse({
          ...input,
          statements: [
            { id: '1', version: 1 },
            { id: '1', version: 1 },
          ],
        }).success,
      ).toBe(false)
    }
    expect(
      contract.updateCustomerTerms.body.safeParse({
        version: 1,
        termDays: null,
        openingDebtCents: 2147483648,
      }).success,
    ).toBe(false)
  })
  it('shipping schemas do not expose amount or price fields and reject accidental leaks', () => {
    expect('amountCents' in shippingCardSchema.shape).toBe(false)
    expect('priceCents' in shippingLineSchema.shape).toBe(false)
    expect('listPriceCents' in shippingLineSchema.shape).toBe(false)
    expect('afters' in shippingDetailSchema.shape).toBe(false)
    expect('allocations' in shippingDetailSchema.shape).toBe(false)
  })
  it('A48: every store after reason requires a description and image', () => {
    for (const reason of ['qty_mismatch', 'damaged', 'quality', 'other']) {
      const line = { orderLineId: '1', qty: 1, reason, description: '说明', imageFileIds: ['1'] }
      const parsed = (changes: object) =>
        storeAfterCreateSchema.safeParse({ orderId: '1', lines: [{ ...line, ...changes }] })
      expect(parsed({}).success).toBe(true)
      expect(parsed({ description: ' ' }).success).toBe(false)
      expect(parsed({ imageFileIds: [] }).success).toBe(false)
    }
  })
})
