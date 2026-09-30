// 阶段 0 的组件总览：只验收设计变量、两档衬线字、图标、WXS 格式化都生效（阶段 1 扩成完整组件总览）
import { copy, labels, shanghaiDateOf } from '@huazhong/shared'
import { iconNames } from '../../core/icon-names'

// styles/tokens.wxss 里的颜色变量名（去掉 --hz- 前缀）
const swatches = [
  'brand',
  'ink',
  'muted',
  'paper',
  'bg',
  'hair',
  'line',
  'tint',
  'green',
  'amber',
  'danger',
  'danger-bg',
  'notice-bg',
  'notice-ink',
]

Page({
  data: {
    top: 0,
    title: copy.title.devGallery,
    modules: Object.values(labels.module),
    today: shanghaiDateOf(Date.now()),
    swatches,
    icons: [...iconNames],
  },
  onLoad() {
    // 自定义顶栏：内容从胶囊按钮下面开始（02 章第 4 节）
    this.setData({ top: wx.getMenuButtonBoundingClientRect().bottom })
  },
})
