import { describe, expect, it } from 'vitest'
import {
  financeCopy as f,
  type Action,
  type ShippingDetail,
  type StatementCard,
  type StatementDraft,
  type StatementSource,
  type ReceiptDetail,
} from '@huazhong/shared'
import { buttonsOf } from '../miniprogram/core/actions'
import { shippingRowOf, shippingViewOf } from '../miniprogram/views/order'
import {
  checkReceipt,
  checkPayment,
  settlementSummaryOf,
  type ReceiveForm,
} from '../miniprogram/packages/finance/pages/receive/form'
import {
  draftTotalsOf,
  checkStatement,
} from '../miniprogram/packages/finance/pages/statement-form/form'
import { statementRowOf, sourceRoute } from '../miniprogram/views/statement'
import { fundViewOf } from '../miniprogram/views/receipt-view'
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
  confirmedAt: '2026-10-01T00:00:00.000Z',
  contactName: '收货人',
  contactPhone: '13800000000',
  address: '上海',
  customerId: '1',
  customerName: '客户',
  storeId: '1',
  storeName: '门店',
  lineName: '花束',
  lineCount: 1,
  units: [{ unit: '束', qty: 12 }],
  changed: true,
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
      requestedBy: '门店',
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
describe('重新设计的业务视图', () => {
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
  it('新增取消、作废、退款操作只由actions控制并显示中文文案', () => {
    expect(
      buttonsOf(
        [action('requestCancel'), action('voidPo')],
        [{ code: 'requestCancel' }, { code: 'voidPo' }, { code: 'registerPayment' }],
      ).map((button) => button.text),
    ).toEqual(['申请取消', '作废采购单'])
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
})

function statement(id: string, dueCents: number): StatementCard {
  return {
    id,
    no: `DZ-${id}`,
    version: 2,
    kind: 'customer',
    partyId: '1',
    partyName: '客户',
    periodFrom: '2026-10-01',
    periodTo: '2026-10-02',
    statementDate: '2026-10-02',
    dueDate: '2026-10-12',
    settledAt: null,
    amountCents: dueCents,
    dueCents,
    sourceCount: 1,
    status: 'unsettled',
    overdueDays: 0,
    actions: [],
    lockedReason: null,
  }
}
const receipt: ReceiveForm = {
  receiptDate: '2026-10-02',
  amountText: '25.00',
  discountText: '',
  discountReason: '',
  methodName: '微信',
  note: '保留',
  statements: [statement('1', 1000), statement('2', 1500)],
}
describe('按完整对账单结清', () => {
  it('只提交所选对账单ID与版本，不提交逐单金额、核销或ledgerToken', () => {
    const checked = checkReceipt(receipt, '1', '2026-10-02')
    expect(checked.ok).toBe(true)
    if (checked.ok) {
      expect(checked.body.statements).toEqual([
        { id: '1', version: 2 },
        { id: '2', version: 2 },
      ])
      expect(checked.body).not.toHaveProperty('allocs')
      expect(checked.body).not.toHaveProperty('ledgerToken')
      expect(checked.body).not.toHaveProperty('expected')
    }
  })
  it('不足整单金额必须填优惠或少选，优惠必须有原因', () => {
    const short = checkReceipt({ ...receipt, amountText: '20' }, '1', '2026-10-02')
    expect(short).toMatchObject({ ok: false, fields: { amountCents: f.insufficient('¥5.00') } })
    expect(
      checkReceipt({ ...receipt, amountText: '20', discountText: '5' }, '1', '2026-10-02').ok,
    ).toBe(false)
    expect(
      checkReceipt(
        { ...receipt, amountText: '20', discountText: '5', discountReason: '抹零' },
        '1',
        '2026-10-02',
      ).ok,
    ).toBe(true)
  })
  it('未选择对账单允许整笔多收，不能登记无对应欠款的优惠', () => {
    expect(checkReceipt({ ...receipt, statements: [] }, '1', '2026-10-02').ok).toBe(true)
    expect(
      checkReceipt(
        { ...receipt, statements: [], discountText: '1', discountReason: '抹零' },
        '1',
        '2026-10-02',
      ).ok,
    ).toBe(false)
    expect(checkReceipt({ ...receipt, receiptDate: '2026-10-03' }, '1', '2026-10-02').ok).toBe(
      false,
    )
  })
  it('付款与收款对称，并以实际付款超过所选应付计算多付预览', () => {
    const checked = checkPayment({ ...receipt, amountText: '30' }, '9', '2026-10-02')
    expect(checked.ok).toBe(true)
    if (checked.ok)
      expect(checked.body).toMatchObject({
        supplierId: '9',
        payDate: '2026-10-02',
        statements: [
          { id: '1', version: 2 },
          { id: '2', version: 2 },
        ],
      })
    expect(settlementSummaryOf({ ...receipt, amountText: '30' }, true)).toContain('多付 ¥5.00')
  })
})
function source(
  type: StatementSource['type'],
  id: string,
  amountCents: number,
  carriesAmount = true,
): StatementSource {
  return {
    type,
    id,
    version: 1,
    sourceNo: `来源-${id}`,
    sourceDate: '2026-10-01',
    storeId: null,
    storeName: null,
    amountCents,
    carriesAmount,
    previousPeriod: false,
    selected: true,
  }
}
const supplierDraft: StatementDraft = {
  kind: 'supplier',
  partyId: '1',
  partyName: '供应商',
  partyVersion: 1,
  periodFrom: '2026-10-01',
  periodTo: '2026-10-02',
  creditCents: 100,
  openingDebtCents: 200,
  sources: [
    source('po', '1', 800),
    source('purchase_return', '2', -200, false),
    source('price_change', '3', 50, false),
  ],
  totals: { grossCents: 1000, creditDeductedCents: 100, dueCents: 900, creditGeneratedCents: 0 },
}
describe('对账单金额和受限视图', () => {
  it('供应商主行已经是净实收现价，退货和改价凭据不再参与加减', () => {
    expect(draftTotalsOf(supplierDraft, ['po:1', 'purchase_return:2', 'price_change:3'])).toEqual(
      supplierDraft.totals,
    )
    expect(
      checkStatement(supplierDraft, ['po:1', 'purchase_return:2', 'price_change:3'], '备注').ok,
    ).toBe(true)
  })
  it('客户负净额和多收抵扣分别计算，最低应收为0', () => {
    const draft = {
      ...supplierDraft,
      kind: 'customer' as const,
      creditCents: 500,
      openingDebtCents: 0,
      sources: [source('order', '1', 100), source('after', '2', -300)],
    }
    expect(draftTotalsOf(draft, ['order:1', 'after:2'])).toEqual({
      grossCents: -200,
      creditDeductedCents: 0,
      dueCents: 0,
      creditGeneratedCents: 200,
    })
  })
  it('门店卡片只取storeAmountCents，供应商金额叫应收，保留全日期与截止', () => {
    const card = { ...statement('1', 9999), storeAmountCents: 1234 }
    const row = statementRowOf(card, 'store')
    expect(row.fields).toContainEqual({ label: f.storeAmount, value: '¥12.34', amount: true })
    expect(JSON.stringify(row)).not.toContain('¥99.99')
    expect(statementRowOf(card, 'supplier').fields).toContainEqual({
      label: f.receivable,
      value: '¥99.99',
      amount: true,
    })
  })
  it('财务来源路由携带只读scope，并分别走销售和仓库页面', () => {
    expect(sourceRoute(source('order', '1', 100))).toBe(
      '/packages/sales/pages/order-detail/index?scope=finance&sourceType=order&id=1',
    )
    expect(sourceRoute(source('wh', '2', 200))).toBe(
      '/packages/warehouse/pages/doc-detail/index?scope=finance&sourceType=wh&id=2',
    )
  })
  it('收款详情保留作废关联历史与多收信息，没有核销入口', () => {
    const fund: ReceiptDetail = {
      id: '1',
      no: 'SK-1',
      version: 1,
      customerId: '1',
      customerName: '客户',
      receiptDate: '2026-10-02',
      amountCents: 3000,
      discountCents: 0,
      discountReason: '',
      creditCents: 500,
      creditBalanceCents: 500,
      methodName: '微信',
      note: '',
      createdBy: { id: '1', name: '财务' },
      createdAt: '2026-10-02T00:00:00.000Z',
      status: 'voided',
      voidReason: '登记错误',
      voidedAt: '2026-10-03T00:00:00.000Z',
      voidedBy: { id: '1', name: '财务' },
      statements: [
        {
          id: '1',
          no: 'DZ-1',
          dueCents: 2500,
          amountCents: 2500,
          status: 'unsettled',
          reversedAt: '2026-10-03T00:00:00.000Z',
        },
      ],
      refunds: [],
      actions: [],
      lockedReason: null,
    }
    const view = fundViewOf(fund)
    expect(view.statements[0]?.tags).toContainEqual({ text: f.voided, warn: false })
    expect(view.rows).toContainEqual({ label: f.credited, value: '¥5.00' })
    expect(view).not.toHaveProperty('allocations')
  })
})
describe('门店售后编辑校验', () => {
  const line: FormLine = {
    orderLineId: '1',
    name: '花束',
    unit: '束',
    code: null,
    maxText: '最多2束',
    qty: 1,
    maxQty: 2,
    reason: 'damaged',
    description: '问题说明',
    images: [],
  }
  it.each(['damaged', 'quality', 'qty_mismatch', 'other'])(
    '全部问题原因%s均要求说明与图片',
    (reason) => {
      expect(checkForm('1', [{ ...line, reason }]).ok).toBe(false)
      const complete = {
        ...line,
        reason,
        images: [
          { fileId: '1', url: 'https://example.com/a.png', thumbUrl: 'https://example.com/a.png' },
        ],
      }
      expect(checkForm('1', [complete]).ok).toBe(true)
      expect(checkForm('1', [{ ...complete, description: '' }]).ok).toBe(false)
    },
  )
  it('弹窗和提交都不能超过原订单允许售后的数量', () => {
    expect(checkForm('1', [{ ...line, qty: 3 }])).toMatchObject({
      ok: false,
      fields: { 'lines.0.qty': '最多2束' },
    })
  })
})
