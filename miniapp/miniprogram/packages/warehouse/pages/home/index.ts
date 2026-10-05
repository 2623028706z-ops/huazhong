// W1 仓库首页：内容在 hz-module-home；点「盘点」不跳页，直接弹新建盘点的分类层（2026-10-06 第 3 批）
import type { DetailEvent } from '../../../../core/events'
import { stocktakePickData, stocktakePickHandlers } from '../../../../views/stocktake-pick'
import { moduleHomePage } from '../../../../views/module-home'

Page({
  ...moduleHomePage,
  ...stocktakePickHandlers,
  data: { ...stocktakePickData },
  async onEntry(event: DetailEvent<string>) {
    if (event.detail !== 'stocktake') return
    const failure = await this.openStocktake()
    if (failure) void wx.showToast({ title: failure.message, icon: 'none' })
  },
})
