import type { InviteDetail, PoDetail } from '@huazhong/shared'
import { describe, expect, it } from 'vitest'
import { formTotalOf, unplacedErrorOf } from '../miniprogram/core/form'
import { inviteViewOf } from '../miniprogram/views/invite-detail'
import { poViewOf } from '../miniprogram/views/purchase'
import { inviteFormOf, purchaseLineViews } from '../miniprogram/views/purchase-form-data'

function inviteOf(patch: Partial<InviteDetail> = {}): InviteDetail {
  return {
    supplyAmountCents: null,
    id: '1',
    no: 'YQ-260929-001',
    version: 1,
    inviteDate: '2026-09-29',
    supplierId: '1',
    supplierName: '春禾花材',
    buyerName: '周宁',
    buyerPhone: '13700000004',
    status: 'pending',
    units: [{ unit: '枝', qty: 70 }],
    materialNames: ['向日葵'],
    purchaseOrderId: null,
    purchaseOrderNo: null,
    purchaseOrderStatus: null,
    actions: [],
    lockedReason: null,
    cancelNote: null,
    cancelledAt: null,
    submittedAt: null,
    lines: [
      {
        id: '1',
        materialId: '1',
        name: '向日葵',
        code: 'HC-0003',
        unit: '枝',
        needQty: 70,
        enabled: true,
      },
    ],
    supply: [],
    ...patch,
  }
}

describe('表单错误和合计', () => {
  it('能定位的错误不重复写顶部，未定位的数组错误仍显示', () => {
    expect(
      unplacedErrorOf({ reason: '请填写原因', 'lines.0.qty': '数量不对' }, [
        'reason',
        'lines.*.qty',
      ]),
    ).toBe('')
    expect(unplacedErrorOf({ reason: '请填写原因', lines: '请添加花材' }, ['reason'])).toBe(
      '请添加花材',
    )
    expect(unplacedErrorOf({}, ['reason'])).toBe('')
  })
  it('合计按单位汇总，保持第一次出现的单位顺序', () => {
    expect(
      formTotalOf(96000, [
        { unit: '枝', qty: 60 },
        { unit: '盆', qty: 2 },
        { unit: '枝', qty: 50 },
      ]),
    ).toBe('¥960.00　　共 110 枝　　2 盆')
  })
})

describe('邀请详情展示', () => {
  it('采购关联最后一行按查看身份跳整页，采购电话仅供应商侧可拨打', () => {
    const invite = inviteOf({
      status: 'submitted',
      purchaseOrderId: '7',
      purchaseOrderNo: 'PO-7',
      purchaseOrderStatus: 'to_receive',
    })
    const supplier = inviteViewOf(invite, true).info.rows
    expect(supplier).toContainEqual({
      label: '采购员',
      value: invite.buyerName,
      phone: invite.buyerPhone,
    })
    expect(supplier.at(-1)).toMatchObject({
      label: '采购单',
      url: '/packages/supplier/pages/po-detail/index?id=7',
    })
    const staff = inviteViewOf(invite).info.rows
    expect(staff.find((row) => row.label === '采购员')).not.toHaveProperty('phone')
    expect(staff.at(-1)).toMatchObject({
      label: '采购单',
      url: '/packages/purchase/pages/order-detail/index?id=7',
    })
  })
  it('待填报保留需求数量，停用行只读且可标错', () => {
    const invite = inviteOf()
    invite.lines = invite.lines.map((line) => ({ ...line, enabled: false }))
    const views = purchaseLineViews(inviteFormOf(invite).lines, 'supply', {
      'lines.0.priceCents': '请填写单价',
    })
    expect(views[0]).toMatchObject({
      readonly: true,
      meta: '需求 70 枝',
      tags: [{ text: '已停用', warn: true }],
      priceError: '请填写单价',
    })
    expect(inviteViewOf(invite)).toMatchObject({
      submitted: false,
      poLink: '',
      lines: [{ qty: 70 }],
    })
  })
  it('已提交合并需求供货，采购单已取消不改变邀请状态', () => {
    const view = inviteViewOf(
      inviteOf({
        status: 'submitted',
        purchaseOrderNo: 'PO-260929-006',
        purchaseOrderStatus: 'cancelled',
        supply: [
          {
            materialId: '1',
            name: '向日葵',
            code: 'HC-0003',
            unit: '枝',
            qty: 65,
            priceCents: 350,
          },
        ],
      }),
    )
    expect(view.info.status).toBe('submitted')
    expect(view.poLink).toBe('PO-260929-006　　已取消')
    expect(view.lines[0]).toMatchObject({
      meta: '需求 70 枝',
      amountCents: 22750,
    })
    expect(view.info.rows).not.toContainEqual(expect.objectContaining({ label: '状态' }))
  })
  it('未供不显示零金额，另报有标记', () => {
    const view = inviteViewOf(
      inviteOf({
        status: 'submitted',
        supply: [
          {
            materialId: '2',
            name: '尤加利',
            code: 'HC-0005',
            unit: '枝',
            qty: 10,
            priceCents: 200,
          },
        ],
      }),
    )
    expect(view.lines).toMatchObject([
      { tags: [{ text: '未供', warn: true }], hideAmount: true },
      { tags: [{ text: '另报', warn: false }] },
    ])
  })
  it('取消页显示原因和时间，手动取消无原因时写取消说明', () => {
    const patch = { status: 'cancelled' as const, cancelledAt: '2026-09-29T01:00:00.000Z' }
    expect(
      inviteViewOf(inviteOf({ ...patch, cancelNote: '停用供应商，自动取消' })).reason.rows,
    ).toEqual([
      { label: '取消原因', value: '停用供应商，自动取消' },
      { label: '取消时间', value: '2026-09-29 09:00' },
    ])
    expect(inviteViewOf(inviteOf(patch)).reason.rows[0]?.value).toBe('采购已取消这次邀请')
  })
})

describe('采购单详情收货后数量', () => {
  it('采购数量和实收数量并排，少收标出差额，未收货不出现采购数量列', () => {
    const line = {
      id: '1',
      materialId: '1',
      code: 'HC-0001',
      name: '白玫瑰',
      unit: '枝',
      qty: 150,
      orderPriceCents: 100,
      priceCents: 100,
      receivedQty: 140,
      returnedQty: 0,
      maxReturnQty: 140,
    }
    const po = (patch: Partial<PoDetail['lines'][number]>, receivedAt: string | null) =>
      ({
        no: 'PO-1',
        orderDate: '2026-09-29',
        buyerName: '周宁',
        buyerPhone: '1',
        supplierName: '春禾花材',
        status: receivedAt ? 'received' : 'to_receive',
        actions: [],
        changes: [],
        priceChanges: [],
        returns: [],
        receivedAt,
        lines: [{ ...line, ...patch }],
      }) as unknown as PoDetail
    const done = poViewOf(po({}, '2026-09-30T08:00:00Z'), true).lines[0]
    expect(done).toMatchObject({ purchaseQty: 150, qty: 140 })
    expect(done?.tags.map((tag) => tag.text)).toContain('少收 10')
    const pending = poViewOf(po({ receivedQty: null }, null), true)
    expect(pending.lines[0]).not.toHaveProperty('purchaseQty')
    expect(pending.qtyLabel).toBe('数量')
  })
})
