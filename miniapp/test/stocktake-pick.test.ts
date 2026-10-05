// 新建盘点选分类（views/stocktake-pick.ts）：默认全选、「全部分类」一点全选 / 全不选、开始盘点的地址
import { describe, expect, it } from 'vitest'
import { pickedOf, startUrlOf, toggledOf } from '../miniprogram/views/stocktake-pick'

const all = [
  { id: '1', name: '玫瑰', count: '2 种花材', selected: true },
  { id: '2', name: '叶材', count: '1 种花材', selected: true },
]

describe('新建盘点选分类', () => {
  it('全选时底栏写开始盘点（n 类），全不选退回「开始盘点」', () => {
    expect(pickedOf(all)).toEqual({ stocktakeAll: true, stocktakeStart: '开始盘点（2 类）' })
    const none = all.map((row) => ({ ...row, selected: false }))
    expect(pickedOf(none)).toEqual({ stocktakeAll: false, stocktakeStart: '开始盘点' })
    expect(pickedOf([]).stocktakeAll).toBe(false)
  })
  it('点「全部分类」：全选时全不选，否则全选；点一类只切这一类', () => {
    expect(toggledOf(all, '').every((row) => !row.selected)).toBe(true)
    const one = toggledOf(all, '2')
    expect(one.map((row) => row.selected)).toEqual([true, false])
    expect(toggledOf(one, '').every((row) => row.selected)).toBe(true)
  })
  it('开始盘点带选中的分类；一个没选为 null', () => {
    expect(startUrlOf(toggledOf(all, '2'))).toBe(
      '/packages/warehouse/pages/stocktake-form/index?categoryIds=1',
    )
    expect(startUrlOf(toggledOf(all, ''))).toBeNull()
  })
})
