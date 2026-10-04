import {
  contract,
  labels,
  copy,
  redesignCopy,
  formatMoney,
  type ModuleKey,
  type TodoModule,
  type TodoRow,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { unwatch, watch } from '../../core/live'
import { request } from '../../core/request'
import { failureOf, isLandingModule, loadMe, logout, tabsOf } from '../../core/session'
import { entriesOf, todoUrls } from './entries'
Component({
  properties: { module: { type: String, value: '' } },
  data: {
    title: '',
    back: true,
    tabs: [] as ReturnType<typeof tabsOf>,
    failure: null as FailureView | null,
    common: [] as NonNullable<(typeof entriesOf)[ModuleKey]>['common'],
    masters: [] as NonNullable<(typeof entriesOf)[ModuleKey]>['masters'],
    todos: [] as (TodoRow & { amount: string })[],
    texts: {
      todos: copy.screen.title.todos,
      my: copy.tab.my,
      common: redesignCopy.common,
      masters: redesignCopy.masters,
    },
  },
  pageLifetimes: {
    show() {
      void this.load()
    },
    hide() {
      unwatch(this)
    },
  },
  lifetimes: {
    detached() {
      unwatch(this)
    },
  },
  methods: {
    async load() {
      const key = this.data.module as TodoModule
      const result = await loadMe()
      if (!result.ok) {
        this.setData({ failure: failureOf(result.failure, 'load') })
        return
      }
      const me = result.data,
        top = isLandingModule(me, key),
        entries = entriesOf[key]
      this.setData({
        title: labels.module[key],
        back: !top,
        tabs: top ? tabsOf(me) : [],
        common: [
          ...(entries?.common ?? []),
          ...(key === 'warehouse' && !top
            ? [
                {
                  key: 'stock',
                  icon: 'boxes',
                  text: redesignCopy.stock,
                  url: '/packages/warehouse/pages/stock/index',
                  wide: true,
                },
              ]
            : []),
        ].map((row) => ({ ...row, disabled: false })),
        masters: (entries?.masters ?? []).map((row) => ({ ...row, disabled: false })),
        failure: null,
      })
      watch(this, [`todo:${key}`], () => void this.loadTodos(key))
      await this.loadTodos(key)
    },
    async loadTodos(key: TodoModule) {
      const result = await request(contract.moduleTodos, { params: { key } })
      if (!result.ok) {
        this.setData({ failure: failureOf(result.failure, 'refresh') })
        return
      }
      this.setData({
        todos: result.data.rows.map((row) => ({
          ...row,
          amount: row.amountCents === undefined ? '' : formatMoney(row.amountCents),
        })),
      })
    },
    onMy() {
      void wx.navigateTo({ url: '/pages/my/index' })
    },
    onEntry(event: DetailEvent<string>) {
      const entry = [...this.data.common, ...this.data.masters].find(
        (row) => row.key === event.detail,
      )
      if (entry) void wx.navigateTo({ url: entry.url })
    },
    onTodo(event: KeyEvent) {
      const url = todoUrls[event.currentTarget.dataset.key]
      if (url) void wx.navigateTo({ url })
    },
    onFailureAction(event: DetailEvent<string>) {
      if (event.detail === 'logout') void logout()
      else void this.load()
    },
  },
})
