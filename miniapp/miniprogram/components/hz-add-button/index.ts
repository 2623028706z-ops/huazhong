// 添加（02 章 hz-add-button）：明细卡最后一行，陶土红加号 + 陶土红文字
Component({
  properties: {
    text: { type: String, value: '' },
  },
  methods: {
    onTap() {
      this.triggerEvent('press')
    },
  },
})
