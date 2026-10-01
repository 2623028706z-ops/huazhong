// 底部操作区（02 章第 4 节）：固定在底部，按钮等分；按钮按「次在左、主在右」的顺序放进来。
// tabbar 为 true 时（底栏页，例如门店购物车）贴在底栏上面，安全区由底栏留
Component({
  properties: {
    tabbar: { type: Boolean, value: false },
  },
})
