// 搜索框（02 章第 4 节）：高 44px，卡片底，左侧搜索图标；输入停 SEARCH_DEBOUNCE_MS 再发 search。
// paper：放在亮格底的弹层里时用墙色底，否则看不出框
import { SEARCH_DEBOUNCE_MS } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'

const timers = new WeakMap<object, ReturnType<typeof setTimeout>>()

Component({
  properties: {
    value: { type: String, value: '' },
    placeholder: { type: String, value: '' },
    paper: { type: Boolean, value: false },
  },
  lifetimes: {
    detached() {
      clearTimeout(timers.get(this))
    },
  },
  methods: {
    emitLater(value: string) {
      clearTimeout(timers.get(this))
      const timer = setTimeout(() => {
        this.triggerEvent('search', value)
      }, SEARCH_DEBOUNCE_MS)
      timers.set(this, timer)
    },
    onChange(event: DetailEvent<{ value: string }>) {
      this.emitLater(event.detail.value)
    },
    onClear() {
      clearTimeout(timers.get(this))
      this.triggerEvent('search', '')
    },
  },
})
