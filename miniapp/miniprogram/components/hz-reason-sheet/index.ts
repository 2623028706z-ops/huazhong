// 原因弹层（06 章第 1.1 节）：取消、关闭、作废共用。required 为 true 时原因框必填，
// false 时只写一句确认。点确认发 submit（detail 是原因），请求和报错由页面做
import { copy } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'

Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    required: { type: Boolean, value: false },
    optional: { type: Boolean, value: false },
    body: { type: String, value: '' },
    confirm: { type: String, value: '' },
    error: { type: String, value: '' },
    loading: { type: Boolean, value: false },
  },
  data: {
    text: '',
    reasonLabel: copy.screen.label.reason,
    backText: copy.action.back,
    optionalHint: copy.placeholder.optional,
  },
  observers: {
    // 每次打开清空；弹层开着时 required 变了（STALE 后要原因）不清已填的
    show(show: boolean) {
      if (show) this.setData({ text: '' })
    },
  },
  methods: {
    onInput(event: DetailEvent<string>) {
      this.setData({ text: event.detail })
    },
    onClose() {
      this.triggerEvent('close')
    },
    onSubmit() {
      this.triggerEvent('submit', this.data.text.trim())
    },
  },
})
