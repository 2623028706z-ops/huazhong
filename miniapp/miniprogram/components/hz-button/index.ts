// 按钮（02 章第 4 节、第 5.1 节）：主、次、文字三种；禁用时下方写 disabledReason；
// 提交中文字换成「提交中」（不变淡，保证白字对比度），超过 SUBMIT_SPINNER_DELAY_MS 再加转圈。
// open-type 为手机号快速验证时，用户同意后发 phone（detail 是动态令牌），拒绝时 detail 为空。
// 放在 hz-action-bar 里时，同一排有按钮在提交，其余按钮跟着锁住（blocked，样子同禁用、不写原因）
import { SUBMIT_SPINNER_DELAY_MS, copy } from '@huazhong/shared'

const BAR = '../hz-action-bar/index'

const spinnerTimers = new WeakMap<object, ReturnType<typeof setTimeout>>()

Component({
  properties: {
    // primary | secondary | text
    kind: { type: String, value: 'primary' },
    text: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
    reason: { type: String, value: '' },
    loading: { type: Boolean, value: false },
    // 微信开放能力，例如登录页的 getPhoneNumber|agreePrivacyAuthorization；结果发 phone 事件
    openType: { type: String, value: '' },
  },
  data: { spinning: false, blocked: false, submitting: copy.action.submitting },
  relations: {
    [BAR]: { type: 'ancestor' },
  },
  observers: {
    loading(loading: boolean) {
      clearTimeout(spinnerTimers.get(this))
      this.setData({ spinning: false })
      const bar = this.getRelationNodes(BAR)[0] as { sync?: () => void } | undefined
      bar?.sync?.()
      if (!loading) return
      const timer = setTimeout(() => {
        this.setData({ spinning: true })
      }, SUBMIT_SPINNER_DELAY_MS)
      spinnerTimers.set(this, timer)
    },
  },
  lifetimes: {
    detached() {
      clearTimeout(spinnerTimers.get(this))
    },
  },
  methods: {
    setBlocked(blocked: boolean) {
      if (this.data.blocked !== blocked) this.setData({ blocked })
    },
    onTap() {
      if (this.data.disabled || this.data.loading || this.data.blocked) return
      this.triggerEvent('press')
    },
    onPhone(event: WechatMiniprogram.CustomEvent<{ code?: string }>) {
      this.triggerEvent('phone', event.detail.code ?? '')
    },
  },
})
