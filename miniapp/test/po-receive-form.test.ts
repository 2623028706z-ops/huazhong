import { redesignCopy } from '@huazhong/shared'
import { describe, expect, it } from 'vitest'
import {
  receiveInputOf,
  receiveViewsOf,
  type ReceiveLine,
} from '../miniprogram/views/po-receive-form'

function line(key: string, qty: number): ReceiveLine {
  return {
    key,
    materialId: key,
    name: `花${key}`,
    unit: '枝',
    qty,
    priceText: '1.00',
    orderQty: 10,
    orderPriceCents: 100,
  }
}
describe('收货只拒收其中几行', () => {
  it('拒收的行实收记 0 并标已拒收，其余行照常提交', () => {
    const lines = [line('1', 0), line('2', 10)]
    const views = receiveViewsOf(lines, true)
    expect(views[0]?.tags).toEqual([{ text: redesignCopy.lineRejected, warn: true }])
    expect(views[1]?.tags).toEqual([])
    expect(receiveInputOf(lines)).toEqual([
      { poLineId: '1', receivedQty: 0, priceCents: 100 },
      { poLineId: '2', receivedQty: 10, priceCents: 100 },
    ])
  })
})
