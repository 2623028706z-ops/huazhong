// 模块首页（06 章第 1.1 节）：品牌背景淡化铺底 → 身份行 → 图标入口 → 待办。
// 只有一个模块的员工是一级页面（没有返回、有底栏），其余从花众首页进，是二级页面。
// 待办最多 TODO_PREVIEW_COUNT 条 +「查看全部」；没有待办不显示「查看全部」（发货换成「发货记录」）
import {
  contract,
  copy,
  labels,
  todoModules,
  type ModuleKey,
  type TodoModule,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { unwatch, watch } from '../../core/live'
import { request } from '../../core/request'
import { failureOf, identityOf, isLandingModule, loadMe, logout, tabsOf } from '../../core/session'
import { entriesOf, todoRowOf, todoSpecs } from './entries'

function isTodoModule(key: ModuleKey): key is TodoModule {
  return (todoModules as readonly string[]).includes(key)
}

Component({
  properties: {
    module: { type: String, value: '' },
  },
  data: {
    title: '',
    back: true,
    roles: '',
    person: '',
    tabs: [] as ReturnType<typeof tabsOf>,
    failure: null as FailureView | null,
    entries: [] as { key: string; icon: string; text: string; disabled: boolean }[],
    hasTodos: false,
    todos: [] as ReturnType<typeof todoRowOf>[],
    todoCount: 0,
    todoEmpty: '',
    idleText: '',
    texts: { todos: copy.screen.title.todos, viewAll: copy.screen.action.viewAll },
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
      const key = this.data.module as ModuleKey
      const result = await loadMe()
      if (!result.ok) {
        this.setData({ failure: failureOf(result.failure, 'load') })
        return
      }
      const me = result.data
      const top = isLandingModule(me, key)
      const identity = identityOf(me)
      const entries = (entriesOf[key] ?? []).map(({ key: entry, icon, text }) => ({
        key: entry,
        icon,
        text,
        disabled: false,
      }))
      const spec = todoSpecs[key]
      this.setData({
        title: labels.module[key],
        back: !top,
        roles: identity.lead,
        person: identity.person,
        tabs: top ? tabsOf(me) : [],
        entries,
        hasTodos: spec !== undefined,
        todoEmpty: spec?.empty ?? '',
        idleText: spec?.idle?.text ?? '',
        failure: null,
      })
      if (isTodoModule(key)) {
        watch(this, [`todo:${key}`], () => void this.loadTodos(key))
        await this.loadTodos(key)
      }
    },
    async loadTodos(key: TodoModule) {
      const result = await request(contract.moduleTodos, { params: { key } })
      if (!result.ok) {
        this.setData({ failure: failureOf(result.failure, 'refresh') })
        return
      }
      this.setData({
        todos: result.data.items.map((item) => todoRowOf(item, key)),
        todoCount: result.data.count,
      })
    },
    onEntry(event: DetailEvent<string>) {
      const entry = entriesOf[this.data.module as ModuleKey]?.find((e) => e.key === event.detail)
      if (entry) void wx.navigateTo({ url: entry.url })
    },
    onTodo(event: KeyEvent) {
      const row = this.data.todos.find((todo) => todo.id === event.currentTarget.dataset.key)
      if (row) void wx.navigateTo({ url: row.url })
    },
    onAll() {
      const spec = todoSpecs[this.data.module as ModuleKey]
      if (!spec) return
      const url = this.data.todoCount > 0 || !spec.idle ? spec.all : spec.idle.url
      void wx.navigateTo({ url })
    },
    onFailureAction(event: DetailEvent<string>) {
      if (event.detail === 'logout') void logout()
      else void this.load()
    },
  },
})
