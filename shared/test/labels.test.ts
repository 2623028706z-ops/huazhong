import { describe, expect, it } from 'vitest'
import { statusOf } from '../src/labels.ts'

describe('状态码取中文名和颜色', () => {
  it('待发货是等待类（琥珀）', () => {
    expect(statusOf('orderStatus', 'to_ship')).toEqual({ text: '待发货', tone: 'wait' })
  })
  it('门店端收款状态叫「未付」，颜色同未收', () => {
    expect(statusOf('storePayStatus', 'unpaid')).toEqual({ text: '未付', tone: 'wait' })
  })
  it('无需付款是结束类（灰）', () => {
    expect(statusOf('apStatus', 'no_pay')).toEqual({ text: '无需付款', tone: 'ended' })
  })
  it('种类或状态码不对返回 null', () => {
    expect(statusOf('orderStatus', 'nope')).toBeNull()
    expect(statusOf('nope', 'to_ship')).toBeNull()
    expect(statusOf('toString', 'to_ship')).toBeNull()
  })
})
