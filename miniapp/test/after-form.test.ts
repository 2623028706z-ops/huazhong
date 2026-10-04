import { describe, expect, it } from 'vitest'
import { checkForm, type FormLine } from '../miniprogram/packages/store/pages/after-form/form'
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
