// 底部操作区（02 章第 4 节）：固定在底部，按钮等分；按钮按「次在左、主在右」的顺序放进来。
// tabbar 为 true 时（底栏页，例如门店购物车）贴在底栏上面，安全区由底栏留；
// inline 为 true 时不固定、不占位，放在弹层底部（hz-sheet 的 footer 用它，按钮排法只写这一份）；
// 里面有按钮在提交时，同一排其余按钮锁住；
// more 为 true 时最左边放了「更多」（hz-more），它只占文字宽，其余按钮等分
const BUTTON = '../hz-button/index'

interface BarButton {
  data: { loading: boolean }
  setBlocked(blocked: boolean): void
}

Component({
  properties: {
    settlement: { type: Boolean, value: false },
    tabbar: { type: Boolean, value: false },
    inline: { type: Boolean, value: false },
    more: { type: Boolean, value: false },
  },
  relations: {
    [BUTTON]: {
      type: 'descendant',
      linked() {
        this.sync()
      },
      unlinked() {
        this.sync()
      },
    },
  },
  methods: {
    // 有一个按钮在提交，其余按钮锁住，避免同一排连点两个动作
    sync() {
      const buttons = this.getRelationNodes(BUTTON) as unknown as BarButton[]
      const busy = buttons.some((button) => button.data.loading)
      for (const button of buttons) button.setBlocked(busy && !button.data.loading)
    },
  },
})
