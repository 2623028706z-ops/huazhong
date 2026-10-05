// 新建盘点选分类（06 章 W1、W8）：仓库首页点「盘点」、盘点记录页「新建盘点」共用一个弹层。
// 默认全选，底栏「开始盘点（n 类）」进 stocktake-form；首页弹层多一个「盘点记录 ›」
import { contract, copy } from '@huazhong/shared'
import type { KeyEvent } from '../core/events'
import { request } from '../core/request'
import { failureOf, type ShownFailure } from '../core/session'

export interface PickCategory {
  id: string
  name: string
  count: string
  selected: boolean
}

// 弹层上的勾选状态和底栏文字
export function pickedOf(categories: readonly PickCategory[]) {
  const count = categories.filter((row) => row.selected).length
  return {
    stocktakeAll: categories.length > 0 && count === categories.length,
    stocktakeStart: count ? copy.stock.startCount(count) : copy.stock.screen.startStocktake,
  }
}

// 点一行：key 为空是「全部分类」，全选时点它全不选，否则全选
export function toggledOf(categories: readonly PickCategory[], key: string): PickCategory[] {
  if (!key) {
    const all = pickedOf(categories).stocktakeAll
    return categories.map((row) => ({ ...row, selected: !all }))
  }
  return categories.map((row) => (row.id === key ? { ...row, selected: !row.selected } : row))
}

// 选好的分类 → 盘点表单地址；一个没选为 null
export function startUrlOf(categories: readonly PickCategory[]): string | null {
  const ids = categories.filter((row) => row.selected).map((row) => row.id)
  return ids.length
    ? `/packages/warehouse/pages/stocktake-form/index?categoryIds=${ids.join(',')}`
    : null
}

export const stocktakePickData = {
  stocktakeSheet: false,
  stocktakeCategories: [] as PickCategory[],
  stocktakeError: '',
  stocktakeAll: false,
  stocktakeStart: '',
  stocktakeTexts: {
    title: copy.stock.screen.create.stocktake,
    all: copy.flow.warehouse.allCategories,
    records: copy.flow.warehouse.stocktakeRecordsLink,
  },
}

interface Host {
  data: typeof stocktakePickData
  setData(patch: Record<string, unknown>): void
}

// 页面 Page({ ...stocktakePickHandlers })；打开失败交给 onStocktakeFailure 显示
export const stocktakePickHandlers = {
  async openStocktake(this: Host): Promise<ShownFailure | null> {
    const result = await request(contract.listMaterialCategories)
    if (!result.ok) return failureOf(result.failure, 'refresh')
    const categories = result.data.items.map((row) => ({
      id: row.id,
      name: row.name,
      count: copy.flow.warehouse.categoryCount(row.materialCount),
      selected: true,
    }))
    this.setData({
      stocktakeSheet: true,
      stocktakeError: '',
      stocktakeCategories: categories,
      ...pickedOf(categories),
    })
    return null
  },
  onStocktakeCategory(this: Host, event: KeyEvent) {
    const categories = toggledOf(this.data.stocktakeCategories, event.currentTarget.dataset.key)
    this.setData({ stocktakeError: '', stocktakeCategories: categories, ...pickedOf(categories) })
  },
  onStocktakeClose(this: Host) {
    this.setData({ stocktakeSheet: false })
  },
  onStocktakeRecords(this: Host) {
    this.setData({ stocktakeSheet: false })
    void wx.navigateTo({ url: '/packages/warehouse/pages/stocktakes/index' })
  },
  onStocktakeStart(this: Host) {
    const url = startUrlOf(this.data.stocktakeCategories)
    if (!url) {
      this.setData({ stocktakeError: copy.stock.categoriesRequired })
      return
    }
    this.setData({ stocktakeSheet: false })
    void wx.navigateTo({ url })
  },
}
