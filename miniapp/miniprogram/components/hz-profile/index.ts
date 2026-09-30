// 「我的」（06 章 M4、S4、P3）：一整块细线窗格，身份格（头像取名字第一个字）→ 入口 → 个人资料（只读弹层）；
// 窗格外是退出登录。
// 点入口发 select（detail 是入口 key），点退出登录发 logout，由页面确认后调解绑
import { copy } from '@huazhong/shared'
import type { KeyEvent } from '../../core/events'

interface Menu {
  key: string
  icon: string
  text: string
}

interface Detail {
  label: string
  value: string
}

const PROFILE_KEY = 'profile'

Component({
  properties: {
    name: { type: String, value: '' },
    sub: { type: String, value: '' },
    menus: { type: Array, value: [] as Menu[] },
    details: { type: Array, value: [] as Detail[] },
  },
  data: {
    initial: '',
    rows: [] as Menu[],
    showDetails: false,
    texts: { profile: copy.title.profile, logout: copy.action.logout },
  },
  observers: {
    'name, menus'(name: string, menus: Menu[]) {
      const profile: Menu = { key: PROFILE_KEY, icon: 'id-card', text: copy.title.profile }
      this.setData({ initial: name.slice(0, 1), rows: [...menus, profile] })
    },
  },
  methods: {
    onRow(event: KeyEvent) {
      const { key } = event.currentTarget.dataset
      if (key === PROFILE_KEY) this.setData({ showDetails: true })
      else this.triggerEvent('select', key)
    },
    onCloseDetails() {
      this.setData({ showDetails: false })
    },
    onLogout() {
      this.triggerEvent('logout')
    },
  },
})
