// 门店首页、供应商首页的主格 + 一排小格（02 章第 4 节、03 章第 8.5 节）：一整块细线窗格；
// 主格右上角可带待办数（只有外部端显示）；disabled 的格变淡、不能点。点了发 select，detail 是格的 key
type CardEvent = WechatMiniprogram.TouchEvent<
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  { key: string; disabled: boolean }
>

interface Card {
  key: string
  icon: string
  text: string
  disabled: boolean
}

interface Hero extends Card {
  // 主卡名称下面一行，没有就不显示
  sub: string
  badge: number
}

Component({
  properties: {
    hero: { type: Object, value: null as Hero | null },
    minis: { type: Array, value: [] as Card[] },
  },
  methods: {
    onTap(event: CardEvent) {
      const { key, disabled } = event.currentTarget.dataset
      if (!disabled) this.triggerEvent('select', key)
    },
  },
})
