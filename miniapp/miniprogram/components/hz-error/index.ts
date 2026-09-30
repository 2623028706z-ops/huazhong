// 页面级错误（02 章第 4 节、第 5.2、5.3 节）：玫瑰红浅底 + 左侧细线；出现时滚到可见。
// requestId 有值时下面小字显示请求编号（INTERNAL）；retry 为 true 时右边文字按钮「重试」
import { copy } from '@huazhong/shared'

const SCROLL_DURATION_MS = 200

Component({
  properties: {
    message: { type: String, value: '' },
    requestId: { type: String, value: '' },
    retry: { type: Boolean, value: false },
  },
  data: { requestText: '', retryText: copy.action.retry },
  observers: {
    'message, requestId'(message: string, requestId: string) {
      this.setData({ requestText: requestId ? copy.requestId(requestId) : '' })
      if (message) this.scrollIntoView()
    },
  },
  methods: {
    scrollIntoView() {
      wx.nextTick(() => {
        this.createSelectorQuery()
          .select('.hz-error')
          .boundingClientRect()
          .selectViewport()
          .scrollOffset()
          .exec((results: unknown[]) => {
            const rect = results[0] as WechatMiniprogram.BoundingClientRectCallbackResult | null
            const viewport = results[1] as WechatMiniprogram.ScrollOffsetCallbackResult | null
            if (!rect || !viewport) return
            const { windowHeight } = wx.getWindowInfo()
            if (rect.top >= 0 && rect.bottom <= windowHeight) return
            const scrollTop = viewport.scrollTop + rect.top - windowHeight / 2
            void wx.pageScrollTo({ scrollTop, duration: SCROLL_DURATION_MS })
          })
      })
    },
    onRetry() {
      this.triggerEvent('retry')
    },
  },
})
