// 状态标签（02 章第 4 节）：传状态种类 + 状态码，中文名和颜色从 shared 状态表取
import { statusOf } from '@huazhong/shared'

Component({
  properties: {
    kind: { type: String, value: '' },
    code: { type: String, value: '' },
  },
  data: { text: '', tone: '' },
  observers: {
    'kind, code'(kind: string, code: string) {
      const status = statusOf(kind, code)
      this.setData({ text: status?.text ?? '', tone: status?.tone ?? '' })
    },
  },
})
