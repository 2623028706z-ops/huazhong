// 确认框（02 章第 4 节）：居中 300px，衬线标题 + 一句说明 + 两个按钮。
// 页面放一个 <hz-confirm id="hz-confirm" />，用 ask() 问，点确认得到 true，点取消或遮罩得到 false
import type { DetailEvent } from '../../core/events'
import type { AskOptions } from '../../core/guard'

const resolvers = new WeakMap<object, (confirmed: boolean) => void>()

Component({
  data: {
    overlay: { zIndex: 12000 },
    show: false,
    title: '',
    body: '',
    cancel: '',
    confirm: '',
  },
  methods: {
    ask(options: AskOptions): Promise<boolean> {
      // 上一次还没回答就又问：上一次按取消算
      resolvers.get(this)?.(false)
      this.setData({ show: true, ...options })
      return new Promise((resolve) => {
        resolvers.set(this, resolve)
      })
    },
    finish(confirmed: boolean) {
      this.setData({ show: false })
      const resolve = resolvers.get(this)
      resolvers.delete(this)
      resolve?.(confirmed)
    },
    onCancel() {
      this.finish(false)
    },
    onConfirm() {
      this.finish(true)
    },
    onVisibleChange(event: DetailEvent<{ visible: boolean }>) {
      if (!event.detail.visible) this.finish(false)
    },
  },
})
