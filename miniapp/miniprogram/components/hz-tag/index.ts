// 标记（02 章第 4 节，定稿 .tag）：都是浅底同色字、不描边——普通灰、警告（改价、少发、已停用）琥珀、完成绿
Component({
  properties: {
    text: { type: String, value: '' },
    warn: { type: Boolean, value: false },
    danger: { type: Boolean, value: false },
    done: { type: Boolean, value: false },
  },
})
