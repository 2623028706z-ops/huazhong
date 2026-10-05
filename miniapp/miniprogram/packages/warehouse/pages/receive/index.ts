import { copy } from '@huazhong/shared'
import { poDetailPage } from '../../../../views/po-detail'
// W3 仓库收货：和 C4 采购单详情共用一套，标题单独叫「收货」（第 4 批第 6 条）
Page({
  ...poDetailPage,
  data: { ...poDetailPage.data, kind: 'warehouse', title: copy.screen.title.receive },
})
