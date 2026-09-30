// 实时提示（02 章第 4 节、第 5.4 节）：别人改了单时页面顶部的一条提示，停留到离开页面或点 ×。
// 编辑页点提示发 refresh，由页面决定刷新；换了新提示会重新出现
Component({
  properties: {
    text: { type: String, value: '' },
  },
  data: { closed: false },
  observers: {
    text() {
      this.setData({ closed: false })
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('refresh')
    },
    onClose() {
      this.setData({ closed: true })
      this.triggerEvent('close')
    },
  },
})
