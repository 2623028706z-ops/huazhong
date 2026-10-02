import { describe, expect, it } from 'vitest'
import {
  copy,
  type Action,
  type AfterDetail,
  type Allocation,
  type ShippingDetail,
  type PaymentAllocation,
} from '@huazhong/shared'
import { buttonsOf } from '../miniprogram/core/actions'
import { afterSheetOf } from '../miniprogram/packages/finance/pages/customer/view'
import { allocRowsOf, paymentAllocRowsOf } from '../miniprogram/views/receipt-view'
import { shippingRowOf, shippingViewOf } from '../miniprogram/views/order'
import {
  autoFillAll,
  checkAllocate,
  checkPayment,
  checkReceipt,
  type ReceiveForm,
} from '../miniprogram/packages/finance/pages/receive/form'
import { checkPurchaseForm, type PurchaseForm } from '../miniprogram/views/purchase-form-data'
import { checkForm, type FormLine } from '../miniprogram/packages/store/pages/after-form/form'

const action = (code: Action['code']): Action => ({
  code,
  enabled: true,
  disabledReason: null,
  reasonRequired: true,
})
const shipping: ShippingDetail = {
  id: '1',
  no: 'SO-001',
  version: 1,
  status: 'shipped',
  origin: 'store',
  orderDate: '2026-10-01',
  shipDate: '2026-10-02',
  customerId: '1',
  customerName: '客户',
  storeId: '1',
  storeName: '门店',
  lineName: '花束',
  lineCount: 1,
  units: [{ unit: '束', qty: 12 }],
  changed: true,
  repriced: true,
  cancelRequested: false,
  actions: [],
  lockedReason: null,
  note: null,
  lines: [
    {
      id: '1',
      productId: '1',
      name: '花束',
      unit: '束',
      customerCode: '',
      qty: 10,
      shippedQty: 12,
      short: false,
      over: true,
      discontinued: false,
    },
  ],
  changes: [
    {
      id: '1',
      createdAt: '2026-10-02T00:00:00.000Z',
      actorLabel: '销售',
      reason: '改单',
      items: ['花束 10 → 12 束'],
    },
  ],
  cancelRequests: [
    {
      id: '1',
      reason: '客户活动取消',
      status: 'lapsed',
      requestedAt: '2026-10-01T00:00:00.000Z',
      handledAt: '2026-10-02T00:00:00.000Z',
      rejectReason: null,
    },
  ],
  shippedBy: '发货',
  shippedAt: '2026-10-02T00:00:00.000Z',
  shipNote: '发货备注',
  cancelReason: null,
  cancelledAt: null,
  voidReason: null,
  voidedAt: null,
}
const allocation: Allocation = {
  id: '1',
  kind: 'direct',
  createdAt: '2026-10-01T00:00:00.000Z',
  createdBy: { id: '1', name: '财务' },
  registeredCents: 1200,
  effectiveCents: 0,
  status: 'valid',
  revokedAt: null,
  revokedBy: null,
  revokeReason: null,
  actions: [action('revokeAllocation')],
  receiptId: '1',
  receiptNo: 'SK-001',
  orderId: '1',
  orderNo: 'SO-001',
}
const form: ReceiveForm = {
  receiptDate: '2026-10-02',
  amountText: '20',
  methodName: '微信',
  note: '保留',
  allocs: [
    { orderId: '1', orderNo: 'SO-001', version: 2, unpaidCents: 1000, text: '10' },
    { orderId: '2', orderNo: 'SO-002', version: 3, unpaidCents: 1500, text: '5' },
  ],
}

describe('阶段3/4返工视图', () => {
  it('H2/H3专用视图任何嵌套节点均不生成金额字段，保留多发和历史', () => {
    const rendered = JSON.stringify({
      card: shippingRowOf(shipping),
      detail: shippingViewOf(shipping),
    })
    expect(rendered).not.toMatch(/amount|price|Cents|¥|财务/)
    expect(shippingViewOf(shipping).lines[0]?.tags).toContainEqual({ text: '多发', warn: true })
    expect(shippingViewOf(shipping).requests[0]?.rows).toContainEqual({
      label: '取消申请',
      value: '已失效',
    })
    expect(shippingViewOf(shipping).changes).toHaveLength(1)
  })
  it('D18-F零生效有效核销仍展示登记金额与撤回操作，撤回后保留完整历史', () => {
    expect(allocRowsOf([allocation], 'order')[0]).toMatchObject({
      canRevoke: true,
      amount: copy.rework.allocationAmounts(1200, 0),
    })
    const revoked: Allocation = {
      ...allocation,
      status: 'revoked',
      actions: [],
      revokedAt: '2026-10-02T00:00:00.000Z',
      revokedBy: { id: '2', name: '管理员' },
      revokeReason: '登记错误',
    }
    const row = allocRowsOf([revoked], 'order')[0]
    expect(row?.canRevoke).toBe(false)
    expect(row?.sub).toContain('已撤回')
    expect(row?.sub).toContain('登记错误')
    expect(row?.sub).toContain('管理员')
  })
  it('付款核销与收款历史对称，不按有效金额过滤', () => {
    const payment: PaymentAllocation = {
      ...allocation,
      paymentId: '1',
      paymentNo: 'FK-001',
      docType: 'po',
      docId: '2',
      docNo: 'PO-001',
      actions: [action('revokePaymentAllocation')],
    }
    expect(paymentAllocRowsOf([payment])[0]).toMatchObject({
      key: '1',
      canRevoke: true,
      amount: copy.rework.allocationAmounts(1200, 0),
    })
  })
  it('财务售后即使收到管理员作废action也保持只读', () => {
    const after: AfterDetail = {
      id: '1',
      no: 'SH-001',
      version: 1,
      status: 'processed',
      origin: 'sales',
      afterDate: '2026-10-02',
      orderId: '1',
      orderNo: 'SO-001',
      customerName: '客户',
      storeName: '门店',
      lineName: '花束',
      lineCount: 0,
      units: [],
      amountCents: 0,
      actions: [action('voidAfter')],
      lockedReason: null,
      shipDate: '2026-10-02',
      note: null,
      lines: [],
      processedAt: null,
      closeReason: null,
      voidReason: null,
      voidedAt: null,
      notice: null,
    }
    expect(afterSheetOf(after)).toMatchObject({ canVoid: false, voidRequired: false })
  })
  it('新增取消、作废、退款操作只由actions控制并显示中文文案', () => {
    expect(
      buttonsOf(
        [action('requestCancel'), action('voidPo')],
        [{ code: 'requestCancel' }, { code: 'voidPo' }, { code: 'registerPayment' }],
      ).map((button) => button.text),
    ).toEqual(['申请取消', '作废采购单'])
  })
})

describe('账本凭据和多单核销', () => {
  it('F4提交全账凭据和全部候选版本，纯预收也需要凭据', () => {
    const checked = checkReceipt(form, '1', '2026-10-02', 'ledger-a')
    expect(checked.ok).toBe(true)
    if (checked.ok)
      expect(checked.body).toMatchObject({
        ledgerToken: 'ledger-a',
        expected: [
          { orderId: '1', version: 2, unpaidCents: 1000 },
          { orderId: '2', version: 3, unpaidCents: 1500 },
        ],
      })
    expect(checkReceipt({ ...form, allocs: [] }, '1', '2026-10-02', '').ok).toBe(false)
    expect(checkAllocate(form, '1', 'ledger-a').ok).toBe(true)
  })
  it('F7按供应商登记、多单核销、剩余转预付；不发送旧docId/poId付款语义', () => {
    const checked = checkPayment(form, '9', 'ledger-b', false)
    expect(checked.ok).toBe(true)
    if (checked.ok) {
      expect(checked.body).toMatchObject({
        supplierId: '9',
        ledgerToken: 'ledger-b',
        amountCents: 2000,
        allocs: [
          { docType: 'po', docId: '1', amountCents: 1000 },
          { docType: 'po', docId: '2', amountCents: 500 },
        ],
      })
      expect(checked.body).not.toHaveProperty('docId')
      expect(checked.body).not.toHaveProperty('poId')
    }
    expect(checkPayment({ ...form, allocs: [] }, '9', 'ledger-b', false).ok).toBe(true)
    expect(checkPayment({ ...form, allocs: [] }, '9', 'ledger-b', true).ok).toBe(false)
  })
  it('按候选单据顺序默认填入，剩余可形成预付/预收', () => {
    expect(autoFillAll(form.allocs, 1800).map((line) => line.text)).toEqual(['10.00', '8.00'])
    expect(autoFillAll(form.allocs, 3000).map((line) => line.text)).toEqual(['10.00', '15.00'])
  })
})

describe('采购复核及外部表单', () => {
  const purchase: PurchaseForm = {
    supplierId: '1',
    note: '',
    reason: '',
    lines: [
      { id: '1', name: '花材', unit: '枝', qty: 100, priceText: '2.00', needQty: 1, enabled: true },
    ],
  }
  it('C5/C7新增必须有reviewToken，有凭据允许超缺口且携带需求快照', () => {
    expect(checkPurchaseForm(purchase, 'po', null).ok).toBe(false)
    const demand = {
      from: '2026-10-01',
      to: '2026-10-02',
      expected: [{ materialId: '1', needQty: 1, stockQty: 0, inTransitQty: 0 }],
    }
    expect(
      checkPurchaseForm(purchase, 'po', null, { reviewToken: 'review-a', demandContext: demand }),
    ).toMatchObject({
      ok: true,
      body: { reviewToken: 'review-a', demandContext: demand, lines: [{ qty: 100 }] },
    })
    expect(
      checkPurchaseForm(purchase, 'invite', null, {
        reviewToken: 'review-b',
        demandContext: demand,
      }).ok,
    ).toBe(true)
  })
  it('P6供应商修改原因选填，供应商请求不携带备注', () => {
    expect(checkPurchaseForm(purchase, 'po', 1, { supplierEditing: true }).ok).toBe(true)
    const checked = checkPurchaseForm(purchase, 'po', 1, { supplierEditing: true })
    if (checked.ok) expect(checked.body).not.toHaveProperty('note')
  })
  it('售后破损/质量必传图片，数量不符/其他选填', () => {
    const line: FormLine = {
      orderLineId: '1',
      name: '花束',
      maxText: '最多2束',
      qty: 1,
      maxQty: 2,
      reason: 'damaged',
      description: '问题说明',
      images: [],
    }
    expect(checkForm('1', [line]).ok).toBe(false)
    expect(checkForm('1', [{ ...line, reason: 'quality' }]).ok).toBe(false)
    expect(checkForm('1', [{ ...line, reason: 'qty_mismatch' }]).ok).toBe(true)
    expect(checkForm('1', [{ ...line, reason: 'other', description: '其他问题' }]).ok).toBe(true)
  })
})
