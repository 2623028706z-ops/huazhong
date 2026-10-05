// M4 我的（06 章 M4，门店、供应商共用这一页）：身份 →（门店、供应商）对账卡 → 按 menus 列入口 → 退出登录。
// 订阅 account:<id>：被停用、解绑、改了模块时重新取 /me；门店、供应商另订阅自家往来账
import {
  contract,
  copy,
  financeCopy as f,
  formatMoney,
  redesignCopy,
  type Me,
  type OutputOf,
  type Topic,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { confirmAsk } from '../../core/guard'
import { unwatch, watch, pullToRefresh } from '../../core/live'
import {
  failureOf,
  identityOf,
  isDevelop,
  loadMe,
  logout,
  tabBadgeOf,
  tabsOf,
} from '../../core/session'
import { request } from '../../core/request'

const menuPages = {
  methods: {
    icon: 'wallet',
    text: copy.screen.title.methods,
    url: '/packages/finance/pages/methods/index',
  },
  inventory: { icon: 'boxes', text: copy.title.inventory, url: '/pages/inventory/index' },
  logs: { icon: 'file-text', text: copy.title.logs, url: '/pages/logs/index' },
  staff: { icon: 'user-round', text: copy.title.staff, url: '/pages/staff/index' },
  gallery: { icon: 'image', text: copy.title.devGallery, url: '/pages/dev-gallery/index' },
}
type MenuKey = keyof typeof menuPages

// 入口顺序照定稿：库存查询、操作日志、收付款方式、员工与岗位（管理员没有库存查询，后端 menus 不给）
const menuOrder: MenuKey[] = ['inventory', 'logs', 'methods', 'staff']

function menusOf(me: Me) {
  const keys = new Set<MenuKey>(me.menus)
  if (me.modules.includes('finance')) keys.add('methods')
  return menuOrder
    .filter((key) => keys.has(key))
    .map((key) => ({ key, icon: menuPages[key].icon, text: menuPages[key].text }))
}

// 开发环境最下面多一个「组件总览」，正式版没有
function devMenusOf() {
  return isDevelop()
    ? [{ key: 'gallery', icon: menuPages.gallery.icon, text: menuPages.gallery.text }]
    : []
}

// 身份行带字段名：员工「岗位 …  登录手机号 …」一行；门店、供应商名字长，登录手机号换一行
function linesOf(me: Me) {
  const { lead } = identityOf(me),
    phone = { label: redesignCopy.loginPhone, value: me.phone }
  if (me.type === 'store' || me.type === 'supplier')
    return [
      { key: 'org', fields: [{ label: me.type === 'store' ? f.store : f.supplier, value: lead }] },
      { key: 'phone', fields: [phone] },
    ]
  return [{ key: 'staff', fields: [{ label: copy.field.role, value: lead }, phone] }]
}

type StatementItem = OutputOf<typeof contract.storeStatements>['items'][number]
// 对账卡：每张未结清对账单一张卡，字段两列对齐（06 章 M4）
function statementCardOf(item: StatementItem, store: boolean) {
  const fields = [
    {
      label: store ? redesignCopy.storeUnpaid : redesignCopy.supplierUnreceived,
      value: formatMoney(store ? (item.storeAmountCents ?? 0) : item.amountCents),
      amount: true,
    },
    item.dueDate
      ? { label: f.dueDate, value: item.dueDate }
      : { label: f.statementDate, value: item.statementDate },
    { label: f.statementNo, value: item.no, wide: true },
    ...(store && item.wholeAmountCents !== null && item.storeCount !== null
      ? [
          {
            label: redesignCopy.wholeTotal,
            value: redesignCopy.wholeCoverage(
              formatMoney(item.wholeAmountCents),
              item.partyName,
              item.storeCount,
            ),
            wide: true,
            minor: true,
          },
        ]
      : []),
  ]
  return {
    id: item.id,
    title: f.statement,
    status: item.status,
    fields,
    tags: item.overdueDays
      ? [{ text: f.overdue(item.overdueDays), warn: false, danger: true }]
      : [],
  }
}

async function statementsOf(me: Me) {
  if (me.type !== 'store' && me.type !== 'supplier') return null
  const result = await request(
    me.type === 'store' ? contract.storeStatements : contract.supplierStatements,
    { query: { status: 'unsettled' } },
  )
  if (!result.ok) return result
  return {
    ok: true as const,
    cards: result.data.items.map((item) => statementCardOf(item, me.type === 'store')),
    partyId: result.data.items[0]?.partyId ?? null,
  }
}

function profileOf(me: Me) {
  return {
    name: me.name,
    lines: linesOf(me),
    contactPhone: me.contactPhone,
    external: me.type === 'store' || me.type === 'supplier',
    menus: menusOf(me),
    devMenus: devMenusOf(),
  }
}

// 门店、供应商对账单详情在各自分包
function sideOf(me: Me) {
  return me.type === 'store' || me.type === 'supplier' ? me.type : ''
}
// 供应商底栏「填报」的待填报红点
// 门店的往来账主题按客户；还没有对账单时等下次进页面再取
function topicsOf(me: Me, partyId: string | null): Topic[] {
  const topics: Topic[] = [`account:${me.id}`]
  if (me.type === 'supplier')
    topics.push(`supplier:${me.supplierId ?? ''}`, `ap:${me.supplierId ?? ''}`)
  if (me.type === 'store' && partyId) topics.push(`ar:${partyId}`)
  return topics
}
Page({
  ...pullToRefresh,
  data: {
    title: copy.title.my,
    back: false,
    profile: null as ReturnType<typeof profileOf> | null,
    // null：员工不显示对账；[]：门店、供应商没有未结清的对账单
    statements: null as ReturnType<typeof statementCardOf>[] | null,
    side: '',
    texts: {
      statements: redesignCopy.myStatementTitle,
      noStatement: redesignCopy.noUnsettledStatement,
    },
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
    const [count, statements] = await Promise.all([tabBadgeOf(me), statementsOf(me)])
    this.setData({
      back: me.landing.startsWith('module:') && me.landing !== 'module:warehouse',
      profile: profileOf(me),
      statements: statements?.ok ? statements.cards : null,
      side: sideOf(me),
      tabs: tabsOf(me, count),
      failure: statements && !statements.ok ? failureOf(statements.failure, 'refresh') : null,
    })
    watch(this, topicsOf(me, statements?.ok ? statements.partyId : null), () => {
      void this.load()
    })
  },
  onStatement(event: KeyEvent) {
    if (this.data.side)
      void wx.navigateTo({
        url: `/packages/${this.data.side}/pages/statement-detail/index?id=${event.currentTarget.dataset.key}`,
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
