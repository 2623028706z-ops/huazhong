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
  const image = {
    fileId: '1',
    url: 'https://example.com/a.png',
    thumbUrl: 'https://example.com/a.png',
  }
  it.each(['damaged', 'quality', 'other'])('原因%s至少要一张图片，问题说明选填', (reason) => {
    expect(checkForm('1', [{ ...line, reason }]).ok).toBe(false)
    const complete = { ...line, reason, images: [image] }
    expect(checkForm('1', [complete]).ok).toBe(true)
    expect(checkForm('1', [{ ...complete, description: '' }]).ok).toBe(true)
  })
  it('原因是数量不符（少发、漏发）时图片选填', () => {
    const mismatch = { ...line, reason: 'qty_mismatch', description: '' }
    expect(checkForm('1', [mismatch]).ok).toBe(true)
    expect(checkForm('1', [{ ...mismatch, images: [image] }]).ok).toBe(true)
  })
  it('弹窗和提交都不能超过原订单允许售后的数量', () => {
    expect(checkForm('1', [{ ...line, qty: 3 }])).toMatchObject({
      ok: false,
      fields: { 'lines.0.qty': '最多2束' },
    })
  })
})
