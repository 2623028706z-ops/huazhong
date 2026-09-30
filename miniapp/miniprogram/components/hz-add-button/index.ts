// 添加（02 章第 4 节）：明细下面的虚线框，陶土红加号 + 墨色文字
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
