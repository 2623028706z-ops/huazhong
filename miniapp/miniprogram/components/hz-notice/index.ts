// 提示条（02 章第 4 节）：状态提示（lockedReason）和核对警告；closable 时右边一个 ×
Component({
  properties: {
    text: { type: String, value: '' },
    closable: { type: Boolean, value: false },
  },
  methods: {
    onClose() {
      this.triggerEvent('close')
    },
  },
})
