// 当前账号：登录落点、底栏、身份行、退出登录（05 章第 2 节、06 章第 1 节）。
// 能进哪些模块、「我的」有哪些入口只看 /me 的 modules、menus、landing，前端不按角色推算
import { contract, copy, roleLabelOf, type Me, type ModuleKey } from '@huazhong/shared'
import { clearCarts, countOf, loadCart } from './cart'
import { viewOf, type FailureView, type Phase } from './failure-view'
import { request, type Failure } from './request'

const LOGIN_URL = '/pages/login/index'
const HOME_URL = '/pages/home/index'
const MY_URL = '/pages/my/index'
const STORE_HOME_URL = '/packages/store/pages/home/index'
const CART_URL = '/packages/store/pages/cart/index'
const SUPPLIER_HOME_URL = '/packages/supplier/pages/home/index'

export function moduleHomeUrl(key: ModuleKey): string {
  return `/packages/${key}/pages/home/index`
}

export function landingUrl(me: Me): string {
  switch (me.landing) {
    case 'store_home':
      return STORE_HOME_URL
    case 'supplier_home':
      return SUPPLIER_HOME_URL
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

// 「首页」就是登录落点；门店多一个「购物车」，角标是本机购物车件数（06 章第 4 节）。
// 供应商的「填报」在阶段 4 加（08 章）
export function tabsOf(me: Me): Tab[] {
  const home = { key: 'home', icon: 'house', text: copy.tab.home, url: landingUrl(me), badge: 0 }
  const my = { key: 'my', icon: 'user-round', text: copy.tab.my, url: MY_URL, badge: 0 }
  if (me.type !== 'store') return [home, my]
  const cart = {
    key: 'cart',
    icon: 'shopping-cart',
    text: copy.screen.tab.cart,
    url: CART_URL,
    badge: countOf(loadCart(me.id)),
  }
  return [home, cart, my]
}

// 身份行：员工「岗位 · 名字」，门店「客户 · 门店 · 联系人」，供应商「供应商 · 联系人」
export function identityOf(me: Me): { lead: string; person: string } {
  const lead = me.orgLabel ?? roleLabelOf({ admin: me.type === 'admin', modules: me.modules })
  return { lead, person: me.name }
}

// 只有一个模块的员工：模块首页是一级页面（没有返回、有底栏）
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
