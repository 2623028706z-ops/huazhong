// 品牌背景（02 章第 3、4 节）：固定铺在页面最底层、整屏；页面不直接引用图片。
// mode：full 原图（首页、我的）；soft 叠 60% 墙色（模块首页）；login 原图 + 下部渐亮到墙色（登录页）
Component({
  properties: {
    mode: { type: String, value: 'full' },
  },
})
