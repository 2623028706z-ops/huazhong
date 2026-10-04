// M4 我的（06 章 M4，门店、供应商共用这一页）：身份 → 按 menus 列入口 → 个人资料 → 退出登录。
// 订阅 account:<id>：被停用、解绑、改了模块时重新取 /me
import { contract, copy, type Me } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { confirmAsk } from '../../core/guard'
import { unwatch, watch } from '../../core/live'
import { failureOf, identityOf, isDevelop, loadMe, logout, tabsOf } from '../../core/session'
import { request } from '../../core/request'

const menuPages = {
  methods: {
    icon: 'wallet',
    text: copy.screen.title.methods,
    url: '/packages/finance/pages/methods/index',
  },
  inventory: { icon: 'boxes', text: copy.title.inventory, url: '/pages/inventory/index' },
  logs: { icon: 'scroll-text', text: copy.title.logs, url: '/pages/logs/index' },
  staff: { icon: 'users-round', text: copy.title.staff, url: '/pages/staff/index' },
  gallery: { icon: 'image', text: copy.title.devGallery, url: '/pages/dev-gallery/index' },
}
type MenuKey = keyof typeof menuPages

function menusOf(me: Me) {
  const keys: MenuKey[] = [
    ...me.menus,
    ...(me.modules.includes('finance') ? (['methods'] as const) : []),
    ...(isDevelop() ? (['gallery'] as const) : []),
  ]
  return keys.map((key) => ({ key, icon: menuPages[key].icon, text: menuPages[key].text }))
}

function profileOf(me: Me) {
  const { lead } = identityOf(me)
  return {
    name: me.name,
    sub: lead,
    phone: me.phone,
    contactPhone: me.contactPhone,
    external: me.type === 'store' || me.type === 'supplier',
    menus: menusOf(me),
  }
}

Page({
  data: {
    title: copy.title.my,
    back: false,
    profile: null as ReturnType<typeof profileOf> | null,
    tabs: [] as ReturnType<typeof tabsOf>,
    failure: null as FailureView | null,
  },
  onShow() {
    void this.load()
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
  },
  async load() {
    const result = await loadMe()
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    const me = result.data
    const invites =
      me.type === 'supplier'
        ? await request(contract.supplierInvites, { query: { status: 'pending' } })
        : null
    const count = invites?.ok ? (invites.data.counts.pending ?? 0) : 0
    this.setData({
      back: me.landing.startsWith('module:') && me.landing !== 'module:warehouse',
      profile: profileOf(me),
      tabs: tabsOf(me, count),
      failure: null,
    })
    const topics =
      me.type === 'supplier'
        ? ([`account:${me.id}`, `supplier:${me.supplierId ?? ''}`] as const)
        : ([`account:${me.id}`] as const)
    watch(this, [...topics], () => {
      void this.load()
    })
  },
  onSelect(event: DetailEvent<MenuKey>) {
    void wx.navigateTo({ url: menuPages[event.detail].url })
  },
  async onLogout() {
    const confirmed = await confirmAsk(this, {
      title: copy.confirm.logoutTitle,
      body: copy.confirm.logoutBody,
      cancel: copy.confirm.cancel,
      confirm: copy.action.logout,
    })
    if (!confirmed) return
    const failure = await logout()
    if (failure) this.setData({ failure: failureOf(failure, 'submit') })
  },
  onFailureAction(event: DetailEvent<string>) {
    if (event.detail === 'logout') void logout()
    else void this.load()
  },
})
