// 半屏弹层（02 章第 4 节）：亮格底；左上关闭（back 时换成返回）、衬线标题居中；最高 75%；
// 点遮罩关闭。guard 为 true 时关闭、返回前先问「放弃修改吗？」（页面上要有 hz-confirm）。
// footer 为 true 时底部有一行按钮区，按钮放进 slot="footer"
import type { DetailEvent } from '../../core/events'
import { confirmLeave } from '../../core/guard'

Component({
  options: { multipleSlots: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    back: { type: Boolean, value: false },
    guard: { type: Boolean, value: false },
    footer: { type: Boolean, value: false },
  },
  methods: {
    leave(event: 'close' | 'back') {
      void confirmLeave(this.selectOwnerComponent(), this.data.guard).then((canLeave) => {
        if (canLeave) this.triggerEvent(event)
      })
    },
    onCorner() {
      this.leave(this.data.back ? 'back' : 'close')
    },
    // 点遮罩：TDesign 只通知，显示与否由 show 决定
    onVisibleChange(event: DetailEvent<{ visible: boolean }>) {
      if (!event.detail.visible) this.leave('close')
    },
  },
})
