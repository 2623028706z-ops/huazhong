// 骨架屏（02 章第 4 节、第 5.1 节）：卡片里的圆角灰条，按页面类型排；
// SKELETON_DELAY_MS 内数据回来（页面把它去掉）就不会出现，避免闪一下
import { SKELETON_DELAY_MS } from '@huazhong/shared'

type Bar = { width: string; height?: string }
type Layout = 'list' | 'detail' | 'form'

const TITLE_BAR = '14px'
const LIST_CARDS = 3
const FORM_FIELDS = 3

function repeat(count: number, bars: Bar[]): Bar[][] {
  return Array.from({ length: count }, () => bars)
}

// 列表页 3 张卡片；详情页 标题 + 3 行信息 + 明细；表单页 字段块
const layouts: Record<Layout, Bar[][]> = {
  list: repeat(LIST_CARDS, [
    { width: '40%' },
    { width: '75%', height: TITLE_BAR },
    { width: '55%' },
  ]),
  detail: [
    [{ width: '50%', height: TITLE_BAR }, { width: '80%' }, { width: '65%' }, { width: '70%' }],
    [{ width: '60%' }, { width: '45%' }, { width: '60%' }, { width: '45%' }],
  ],
  form: repeat(FORM_FIELDS, [{ width: '25%' }, { width: '100%', height: '30px' }]),
}

const timers = new WeakMap<object, ReturnType<typeof setTimeout>>()

Component({
  properties: {
    type: { type: String, value: 'list' },
  },
  data: { cards: [] as { id: number; rows: Bar[] }[] },
  lifetimes: {
    attached() {
      const timer = setTimeout(() => {
        const rows = layouts[this.data.type as Layout]
        this.setData({ cards: rows.map((bars, id) => ({ id, rows: bars })) })
      }, SKELETON_DELAY_MS)
      timers.set(this, timer)
    },
    detached() {
      clearTimeout(timers.get(this))
    },
  },
})
