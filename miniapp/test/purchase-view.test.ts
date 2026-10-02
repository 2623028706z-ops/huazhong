import type { InviteDetail } from '@huazhong/shared'
import { describe, expect, it } from 'vitest'
import { formTotalOf, unplacedErrorOf } from '../miniprogram/core/form'
import { inviteViewOf } from '../miniprogram/views/invite-detail'
import { inviteFormOf, purchaseLineViews } from '../miniprogram/views/purchase-form-data'

function inviteOf(patch: Partial<InviteDetail> = {}): InviteDetail {
  return {
    id: '1',
    no: 'YQ-260929-001',
    version: 1,
    inviteDate: '2026-09-29',
    supplierId: '1',
    supplierName: '春禾花材',
    buyerName: '周宁',
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
    lines: [{ id: '1', materialId: '1', name: '向日葵', unit: '枝', needQty: 70, enabled: true }],
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
    ).toBe('¥960.00 · 共 110 枝 · 2 盆')
  })
})

describe('邀请详情展示', () => {
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
      lines: [{ qty: 70, subText: '' }],
    })
  })
  it('已提交合并需求供货，采购单已取消不改变邀请状态', () => {
    const view = inviteViewOf(
      inviteOf({
        status: 'submitted',
        purchaseOrderNo: 'PO-260929-006',
        purchaseOrderStatus: 'cancelled',
        supply: [{ materialId: '1', name: '向日葵', unit: '枝', qty: 65, priceCents: 350 }],
      }),
    )
    expect(view.info.status).toBe('submitted')
    expect(view.poLink).toBe('采购单 PO-260929-006 · 已取消')
    expect(view.lines[0]).toMatchObject({
      headMeta: '需求 70 枝',
      subText: '供 65 枝 × ¥3.50',
      amountCents: 22750,
    })
    expect(view.info.rows).not.toContainEqual(expect.objectContaining({ label: '状态' }))
  })
  it('未供不显示零金额，另报有标记', () => {
    const view = inviteViewOf(
      inviteOf({
        status: 'submitted',
        supply: [{ materialId: '2', name: '尤加利', unit: '枝', qty: 10, priceCents: 200 }],
      }),
    )
    expect(view.lines).toMatchObject([
      { subText: '未供', hideAmount: true },
      { tags: [{ text: '另报', warn: false }], subText: '供 10 枝 × ¥2.00' },
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
