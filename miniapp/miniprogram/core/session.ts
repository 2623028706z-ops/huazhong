// 当前账号：登录落点、底栏、身份行、退出登录（05 章第 2 节、06 章第 1 节）。
// 能进哪些模块、「我的」有哪些入口只看 /me 的 modules、menus、landing，前端不按角色推算
import {
  contract,
  copy,
  redesignCopy,
  roleLabelOf,
  type Me,
  type ModuleKey,
  type StoreUnseen,
} from '@huazhong/shared'
import { clearCarts } from './cart'
import { viewOf, type FailureView, type Phase } from './failure-view'
import { request, type Failure } from './request'

const LOGIN_URL = '/pages/login/index'
const HOME_URL = '/pages/home/index'
const MY_URL = '/pages/my/index'
export function moduleHomeUrl(key: ModuleKey): string {
  return `/packages/${key}/pages/home/index`
}

export function landingUrl(me: Me): string {
  switch (me.landing) {
    case 'store_shop':
      return '/packages/store/pages/shop/index'
    case 'supplier_invites':
      return '/packages/supplier/pages/invites/index'
    case 'home':
      return HOME_URL
    default:
      return moduleHomeUrl(me.landing.slice('module:'.length) as ModuleKey)
  }
}

interface Tab {
  key: string
  icon: string
  text: string
  url: string
  badge: number
}

// 账号落点与底栏统一；单岗位仓库保留库存入口。badge：供应商「填报」的待填报数，
// 门店「订单」的没看过的结果数（03 章第 8.1 节，2026-10-06 第 3 批），由 tabBadgeOf 取
export function tabsOf(me: Me, badge = 0): Tab[] {
  const my = { key: 'my', icon: 'user-round', text: copy.tab.my, url: MY_URL, badge: 0 }
  if (me.type === 'store' || me.type === 'supplier') return externalTabsOf(me, badge, my)
  const home = { key: 'home', icon: 'house', text: copy.tab.home, url: landingUrl(me), badge: 0 }
  if (me.landing === 'module:warehouse')
    return [
      home,
      {
        key: 'stock',
        icon: 'boxes',
        text: redesignCopy.stock,
        url: '/packages/warehouse/pages/stock/index',
        badge: 0,
      },
      my,
    ]
  return me.landing.startsWith('module:') ? [] : [home, my]
}

function externalTabsOf(me: Me, badge: number, my: Tab): Tab[] {
  if (me.type === 'store')
    return [
      {
        key: 'shop',
        icon: 'flower-2',
        text: copy.screen.title.shop,
        url: '/packages/store/pages/shop/index',
        badge: 0,
      },
      {
        key: 'orders',
        icon: 'file-text',
        text: redesignCopy.orders,
        url: '/packages/store/pages/orders/index',
        badge,
      },
      my,
    ]
  if (me.type === 'supplier')
    return [
      {
        key: 'supply',
        icon: 'clipboard-pen',
        text: redesignCopy.supply,
        url: '/packages/supplier/pages/invites/index',
        badge,
      },
      {
        key: 'orders',
        icon: 'file-text',
        text: redesignCopy.purchaseOrders,
        url: '/packages/supplier/pages/orders/index',
        badge: 0,
      },
      my,
    ]
  return []
}

// 门店没看过的结果数（GET /store/unseen）：底栏「订单」角标、「订单」「售后」段名数字都从这里取；取不到为 null
export async function storeUnseenOf(): Promise<StoreUnseen | null> {
  const unseen = await request(contract.storeUnseen)
  return unseen.ok ? unseen.data : null
}

// 底栏角标的数：供应商待填报数、门店没看过的结果数（storeUnseenOf 的 total）；员工没有，取不到按 0
export async function tabBadgeOf(me: Me): Promise<number> {
  if (me.type === 'supplier') {
    const invites = await request(contract.supplierInvites, { query: { status: 'pending' } })
    return invites.ok ? (invites.data.counts.pending ?? 0) : 0
  }
  if (me.type !== 'store') return 0
  return (await storeUnseenOf())?.total ?? 0
}

// 身份行：员工「岗位 · 名字」，门店「客户 · 门店 · 联系人」，供应商「供应商 · 联系人」
export function identityOf(me: Me): { lead: string; person: string } {
  const lead = me.orgLabel ?? roleLabelOf({ admin: me.type === 'admin', modules: me.modules })
  return { lead, person: me.name }
}

// 只有一个模块的员工：模块首页是登录落点；仅仓库有模块底栏
export function isLandingModule(me: Me, key: ModuleKey): boolean {
  return me.landing === `module:${key}`
}

export function loadMe() {
  return request(contract.me)
}

// 请求失败 → 界面状态；没绑定直接回登录页，返回 null
export type ShownFailure = Exclude<FailureView, { kind: 'login' }>

export function failureOf(failure: Failure, phase: Phase): ShownFailure | null {
  const view = viewOf(failure, phase)
  if (view.kind !== 'login') return view
  void wx.reLaunch({ url: LOGIN_URL })
  return null
}

// 退出登录 = 解绑这台微信（03 章第 2 节）；成功后回登录页
export async function logout(): Promise<Failure | null> {
  const result = await request(contract.unbind)
  if (!result.ok) return result.failure
  clearCarts()
  void wx.reLaunch({ url: LOGIN_URL })
  return null
}

// 组件总览只在开发版出现（06 章 M4）
export function isDevelop(): boolean {
  return wx.getAccountInfoSync().miniProgram.envVersion === 'develop'
}

// 弹层、表单里写的那一句：字段错误取第一条
export function messageOf(view: ShownFailure): string {
  if (view.kind !== 'fields') return view.message
  return Object.values(view.fields)[0] ?? view.message
}
