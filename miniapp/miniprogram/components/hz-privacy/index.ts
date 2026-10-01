// 隐私勾选（登录页、门店邀请页共用，02 章第 4 节）：勾选框 + 「阅读并同意《隐私保护指引》」，点指引打开微信隐私协议。
// 点整行发 toggle；没勾选就点登录时页面把 remind 加 1，这一行抖一下
import { copy } from '@huazhong/shared'

const SHAKE_MS = 400
const timers = new WeakMap<object, ReturnType<typeof setTimeout>>()

Component({
  properties: {
    agreed: { type: Boolean, value: false },
    remind: { type: Number, value: 0 },
  },
  data: {
    shaking: false,
    texts: { prefix: copy.auth.privacyPrefix, contract: copy.auth.privacyContract },
  },
  observers: {
    remind(remind: number) {
      if (!remind) return
      clearTimeout(timers.get(this))
      this.setData({ shaking: true })
      const timer = setTimeout(() => {
        this.setData({ shaking: false })
      }, SHAKE_MS)
      timers.set(this, timer)
    },
  },
  lifetimes: {
    detached() {
      clearTimeout(timers.get(this))
    },
  },
  methods: {
    onToggle() {
      this.triggerEvent('toggle')
    },
    onOpenContract() {
      wx.openPrivacyContract({})
    },
  },
})
