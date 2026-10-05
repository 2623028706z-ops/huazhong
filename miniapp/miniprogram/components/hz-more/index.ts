// 底栏「更多」（02 章第 4 节 hz-action-bar，2026-10-06 第 4 批）：底栏最多 2 个按钮，其余操作放进来。
// 放在 hz-action-bar 最左边，点开半屏列出 slot 里的按钮（页面照常写 hz-button + bind:press，禁用的也列出、
// 下面写原因）；点了其中一个先收起弹层，再走那个操作自己的确认框或原因弹层
import { copy } from '@huazhong/shared'

const BUTTON = '../hz-button/index'

Component({
  properties: {
    title: { type: String, value: copy.flow.common.moreTitle },
  },
  data: { show: false, text: copy.flow.common.more },
  relations: {
    [BUTTON]: { type: 'descendant' },
  },
  methods: {
    onOpen() {
      this.setData({ show: true })
    },
    close() {
      if (this.data.show) this.setData({ show: false })
    },
  },
})
