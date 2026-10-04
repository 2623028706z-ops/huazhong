// 首页抬头（03 章第 8.5 节）：花众字标 + 身份行（左）和日期（右）。花众首页、门店首页、供应商首页、「我的」共用
import { shanghaiDateOf } from '@huazhong/shared'

Component({
  properties: {
    // 身份行加粗的部分：员工的岗位、门店的「客户 · 门店」、供应商名称
    lead: { type: String, value: '' },
    person: { type: String, value: '' },
    // 订货页门店名下面已经写了日期（定稿 000），字标旁不再写
    noDate: { type: Boolean, value: false },
  },
  data: { today: '' },
  lifetimes: {
    attached() {
      this.setData({ today: shanghaiDateOf(Date.now()) })
    },
  },
})
