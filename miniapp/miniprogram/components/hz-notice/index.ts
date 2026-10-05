// 提示条（02 章第 4 节）：状态提示（lockedReason）和核对警告；closable 时右边一个 ×。
// warn 是黄色提示条（采购单到货差异，2026-10-06 第 3 批）：加粗标题 + 逐行说明 + 一行小字，
// action 有字时右上一个小胶囊按钮（「知道了」），点了发 action
Component({
  properties: {
    text: { type: String, value: '' },
    closable: { type: Boolean, value: false },
    warn: { type: Boolean, value: false },
    title: { type: String, value: '' },
    lines: { type: Array, value: [] as string[] },
    meta: { type: String, value: '' },
    action: { type: String, value: '' },
    loading: { type: Boolean, value: false },
  },
  methods: {
    onClose() {
      this.triggerEvent('close')
    },
    onAction() {
      if (!this.data.loading) this.triggerEvent('action')
    },
  },
})
