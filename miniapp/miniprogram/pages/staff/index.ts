// M7 员工与岗位（06 章 M7）：列表 + 弹层新增、修改；弹层分三组，已绑定微信的员工在「微信」一行解绑
import {
  contract,
  copy,
  labels,
  maskPhone,
  moduleKeys,
  roleLabelOf,
  type StaffItem,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { confirmAsk, isChanged, syncUnloadAlert } from '../../core/guard'
import { PagedList } from '../../core/list'
import type { PagerView } from '../../core/pager'
import { newIdempotencyKey, request, type Result } from '../../core/request'
import { failureOf } from '../../core/session'
import { showSuccess } from '../../core/toast'
import {
  blankForm,
  checkCreate,
  checkUpdate,
  comparableOf,
  formOf,
  toModules,
  type StaffForm,
} from './form'

function rowOf(item: StaffItem) {
  return {
    id: item.id,
    title: item.name,
    total: roleLabelOf(item),
    meta: maskPhone(item.phone),
    tags: item.enabled ? [] : [{ text: copy.tag.disabled, warn: false }],
  }
}

// 「微信」一行只在后端给了 unbindStaffWechat 时出现（已绑定）
function canUnbindOf(item: StaffItem | null): boolean {
  return item?.actions.some((action) => action.code === 'unbindStaffWechat') ?? false
}

Page({
  data: {
    title: copy.title.staff,
    emptyObject: copy.object.staff,
    items: [] as StaffItem[],
    rows: [] as ReturnType<typeof rowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    canCreate: false,
    sheet: false,
    editing: null as StaffItem | null,
    canUnbind: false,
    form: blankForm,
    initial: blankForm,
    fields: {},
    formError: '',
    requestId: '',
    saving: false,
    moduleOptions: moduleKeys.map((key) => ({ id: key, name: labels.module[key] })),
    texts: {
      create: copy.title.staffCreate,
      edit: copy.title.staffEdit,
      save: copy.action.saveStaff,
      unbind: copy.log.unbind,
      field: copy.field,
      enabled: copy.statusValue.enabled,
      bound: copy.statusValue.bound,
      allLoaded: copy.state.allLoaded,
    },
  },
  list: null as PagedList<StaffItem> | null,
  idempotencyKey: '',
  onLoad() {
    this.list = new PagedList(
      async (cursor) => {
        const result = await request(contract.listStaff, { query: { cursor } })
        // 底栏「新增员工」只看列表级 actions（05 章第 1.5 节）
        if (result.ok)
          this.setData({ canCreate: result.data.actions.some((a) => a.code === 'create') })
        return result
      },
      (view: PagerView<StaffItem>) => {
        this.setData({ ...view, rows: view.items.map(rowOf) })
      },
      (patch) => {
        this.setData(patch)
      },
    )
  },
  onShow() {
    void this.refresh()
  },
  async refresh(): Promise<void> {
    await this.list?.refresh()
  },
  async onReachBottom(): Promise<void> {
    await this.list?.more()
  },
  onFailureAction() {
    void this.refresh()
  },
  openSheet(editing: StaffItem | null, form: StaffForm) {
    this.setData({
      sheet: true,
      editing,
      canUnbind: canUnbindOf(editing),
      form,
      initial: form,
      fields: {},
      formError: '',
      requestId: '',
    })
  },
  onCreate() {
    this.idempotencyKey = newIdempotencyKey()
    this.openSheet(null, blankForm)
  },
  onOpen(event: KeyEvent) {
    const item = this.data.items.find((staff) => staff.id === event.currentTarget.dataset.key)
    if (item) this.openSheet(item, formOf(item))
  },
  onCloseSheet() {
    this.setData({ sheet: false })
    syncUnloadAlert(false)
  },
  // 改哪个字段就清掉哪个字段的报错；改回原值不算修改
  update(patch: Partial<StaffForm>, field: string) {
    const form = { ...this.data.form, ...patch }
    const fields = Object.fromEntries(
      Object.entries(this.data.fields).filter(([key]) => key !== field),
    )
    this.setData({ form, fields })
    syncUnloadAlert(isChanged(comparableOf(this.data.initial), comparableOf(form)))
  },
  onName(event: DetailEvent<string>) {
    this.update({ name: event.detail }, 'name')
  },
  onPhone(event: DetailEvent<string>) {
    this.update({ phone: event.detail }, 'phone')
  },
  onAdmin(event: DetailEvent<boolean>) {
    this.update({ admin: event.detail }, 'modules')
  },
  onModules(event: DetailEvent<string[]>) {
    this.update({ modules: toModules(event.detail) }, 'modules')
  },
  onEnabled(event: DetailEvent<boolean>) {
    this.update({ enabled: event.detail }, 'enabled')
  },
  showFields(fields: Record<string, string>) {
    this.setData({ fields, formError: Object.values(fields)[0] ?? '' })
  },
  async send(work: () => Promise<Result<StaffItem>>) {
    this.setData({ saving: true, formError: '', requestId: '' })
    const result = await work()
    this.setData({ saving: false })
    this.afterSubmit(result)
  },
  async onSave(): Promise<void> {
    const { editing, form } = this.data
    if (editing) {
      const checked = checkUpdate(form, editing.version)
      if (!checked.ok) this.showFields(checked.fields)
      else {
        const params = { id: editing.id }
        await this.send(() => request(contract.updateStaff, { params, body: checked.body }))
      }
      return
    }
    const checked = checkCreate(form)
    if (!checked.ok) this.showFields(checked.fields)
    else {
      const options = { idempotencyKey: this.idempotencyKey }
      await this.send(() => request(contract.createStaff, { body: checked.body }, options))
    }
  },
  afterSubmit(result: Result<StaffItem>) {
    if (result.ok) {
      this.onCloseSheet()
      showSuccess(copy.action.saved)
      void this.refresh()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'fields') this.setData({ fields: view.fields, formError: view.message })
    else if (view.kind === 'stale') {
      const latest = view.latest as StaffItem
      this.setData({
        editing: latest,
        canUnbind: canUnbindOf(latest),
        form: formOf(latest),
        initial: formOf(latest),
        formError: view.message,
      })
    } else if (view.kind === 'inline')
      this.setData({ formError: view.message, requestId: view.requestId ?? '' })
    else this.setData({ formError: view.message })
  },
  async onUnbind(): Promise<void> {
    const { editing } = this.data
    if (!editing) return
    const confirmed = await confirmAsk(this, {
      title: copy.confirm.unbindTitle,
      body: copy.confirm.unbindBody,
      cancel: copy.confirm.cancel,
      confirm: copy.log.unbind,
    })
    if (!confirmed) return
    const result = await request(contract.unbindStaffWechat, {
      params: { id: editing.id },
      body: { version: editing.version },
    })
    if (!result.ok) {
      this.afterSubmit(result)
      return
    }
    this.setData({ editing: result.data, canUnbind: canUnbindOf(result.data) })
    showSuccess(copy.action.unbound)
    void this.refresh()
  },
})
