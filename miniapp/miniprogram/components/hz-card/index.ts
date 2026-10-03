// 列表卡片（02 章第 4 节）：最多三行 ①日期 + 状态 ②对象 + 总数 ③标记 + 单号等 + 金额；整卡可点
import { shanghaiDateOf } from '@huazhong/shared'

interface Tag {
  text: string
  warn: boolean
}

Component({
  properties: {
    // 业务日期 YYYY-MM-DD，今年的只写月-日
    date: { type: String, value: '' },
    statusKind: { type: String, value: '' },
    status: { type: String, value: '' },
    headText: { type: String, value: '' },
    title: { type: String, value: '' },
    // 第 2 行右边，例如「共 32 束」
    total: { type: String, value: '' },
    totalTone: { type: String, value: '' },
    // 没有金额的列表（库存）：第 2 行的总数是关键数字，墨色加粗（02 章第 4 节）
    keyTotal: { type: Boolean, value: false },
    // 第 3 行左边：单号 / 出货日期 / 采购员
    meta: { type: String, value: '' },
    // 分；null 不显示
    amount: { type: null, optionalTypes: [Number], value: null as number | null },
    // amount 为 null 时这一格写的字，例如售后「待确认」「—」
    amountText: { type: String, value: '' },
    tags: { type: Array, value: [] as Tag[] },
  },
  data: { today: '' },
  lifetimes: {
    attached() {
      this.setData({ today: shanghaiDateOf(Date.now()) })
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('press')
    },
  },
})
