import type { Action } from '@huazhong/shared'
import { copy } from '@huazhong/shared'
import { describe, expect, it } from 'vitest'
import { allToggled, checkOf, showsChecks, toggled } from '../miniprogram/views/batch'
import { shipResultOf } from '../miniprogram/views/ship-result'

const ship = (enabled: boolean): Action[] => [
  enabled
    ? { code: 'ship', enabled: true, disabledReason: null, reasonRequired: false }
    : { code: 'ship', enabled: false, disabledReason: '出货日期还没到', reasonRequired: false },
]
const card = (id: string, enabled: boolean) => ({
  id,
  version: 1,
  no: `SO-${id}`,
  actions: ship(enabled),
})

describe('批量勾选统一写法（02 章第 6 节第 19 条）', () => {
  it('「全部」和能批量的页签显示勾选框，其余不显示', () => {
    expect(showsChecks('', 'to_ship')).toBe(true)
    expect(showsChecks('to_ship', 'to_ship')).toBe(true)
    expect(showsChecks('shipped', 'to_ship')).toBe(false)
  })

  it('只有能做的单子有框，出货日期没到（ship 禁用）的不能勾', () => {
    expect(checkOf(card('1', true), 'ship', [])).toEqual({ selectable: true, selected: false })
    expect(checkOf(card('2', false), 'ship', []).selectable).toBe(false)
    expect(toggled([], card('2', false), 'ship')).toEqual([])
    const picked = toggled([], card('1', true), 'ship')
    expect(picked).toEqual([{ id: '1', version: 1, no: 'SO-1' }])
    expect(toggled(picked, card('1', true), 'ship')).toEqual([])
  })

  it('全选只选列出且能做的，再点一次全部取消', () => {
    const cards = [card('1', true), card('2', false), card('3', true)]
    const all = allToggled([], cards, 'ship')
    expect(all.map((row) => row.id)).toEqual(['1', '3'])
    expect(allToggled(all, cards, 'ship')).toEqual([])
    expect(allToggled([], [card('2', false)], 'ship')).toEqual([])
  })
})

describe('批量发货结果弹层（06 章 H2）', () => {
  const row = (id: string) => ({
    id,
    no: `SO-${id}`,
    customerName: '拾光花店',
    storeName: '文新店',
  })

  it('头行写已发货和没发出的单数，成功行进送货单，失败行写原因', () => {
    const view = shipResultOf({
      succeeded: [row('1'), row('2')],
      failed: [{ ...row('3'), reason: '门店已申请取消' }],
    })
    expect(view.head).toBe('已发货 2 单，1 单没发出')
    expect(view.rows[0]).toMatchObject({
      title: copy.org.store('拾光花店', '文新店'),
      sub: 'SO-1 · 已发货',
      link: copy.flow.ship.deliveryLink,
      failed: false,
    })
    expect(view.rows[2]).toMatchObject({ sub: '没发出：门店已申请取消', failed: true })
  })

  it('全部发出只写已发货 n 单', () => {
    expect(shipResultOf({ succeeded: [row('1')], failed: [] }).head).toBe('已发货 1 单')
  })
})
