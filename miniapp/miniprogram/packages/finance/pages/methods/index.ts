// F9 收付款方式（06 章 F9）：两个分区（收款方式、付款方式）；每行名称 + 启用开关（最后一种启用的不能关，后端拦，
// 报错写在对应分区里）；每个分区下面「新增收款方式 / 新增付款方式」打开弹层，填名称后「保存方式」，报错写在弹层里
import {
  contract,
  copy,
  labels,
  methodKinds,
  type MethodKind,
  type PaymentMethod,
} from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { checkedOf } from '../../../../core/form'
import { syncUnloadAlert } from '../../../../core/guard'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'

interface Section {
  kind: MethodKind
  title: string
  addTitle: string
  rows: PaymentMethod[]
  error: string
}

const addTitles: Record<MethodKind, string> = {
  receive: copy.screen.title.addReceiveMethod,
  pay: copy.screen.title.addPayMethod,
}

type KindEvent<T> = DetailEvent<T, { kind: MethodKind; id: string }>

function sectionsOf(methods: readonly PaymentMethod[], previous: readonly Section[]): Section[] {
  return methodKinds.map((kind) => ({
    kind,
    title: labels.methodKind[kind],
    addTitle: addTitles[kind],
    rows: methods.filter((method) => method.kind === kind),
    error: previous.find((section) => section.kind === kind)?.error ?? '',
  }))
}

Page({
  // 一次打开弹层一个幂等键，网络失败后重试用同一个
  idempotencyKey: '',
  data: {
    title: copy.screen.title.methods,
    loaded: false,
    failure: null as FailureView | null,
    sections: [] as Section[],
    adding: '',
    addTitle: '',
    newName: '',
    fields: {},
    formError: '',
    saving: false,
    texts: { name: copy.screen.label.name, save: copy.action.saveMethod },
  },
  onShow() {
    void this.load()
  },
  onUnload() {
    syncUnloadAlert(false)
  },
  async load(): Promise<void> {
    const result = await request(contract.listMethods, { query: {} })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.setData({
      loaded: true,
      failure: null,
      sections: sectionsOf(result.data.items, this.data.sections),
    })
  },
  patchSection(kind: MethodKind, patch: Partial<Section>) {
    const sections = this.data.sections.map((s) => (s.kind === kind ? { ...s, ...patch } : s))
    this.setData({ sections })
  },
  onOpenAdd(event: KindEvent<unknown>) {
    const { kind } = event.currentTarget.dataset
    this.idempotencyKey = newIdempotencyKey()
    this.setData({
      adding: kind,
      addTitle: addTitles[kind],
      newName: '',
      fields: {},
      formError: '',
    })
  },
  onCloseAdd() {
    this.setData({ adding: '' })
    syncUnloadAlert(false)
  },
  onNewName(event: DetailEvent<string>) {
    this.setData({ newName: event.detail, fields: {}, formError: '' })
    syncUnloadAlert(event.detail !== '')
  },
  async onSave(): Promise<void> {
    const kind = this.data.adding
    if (!kind) return
    const checked = checkedOf(
      contract.createMethod.body.safeParse({ kind, name: this.data.newName }),
    )
    if (!checked.ok) {
      this.setData({ fields: checked.fields, formError: Object.values(checked.fields)[0] ?? '' })
      return
    }
    this.setData({ saving: true })
    const result = await request(
      contract.createMethod,
      { body: checked.body },
      { idempotencyKey: this.idempotencyKey },
    )
    this.setData({ saving: false })
    if (result.ok) {
      this.onCloseAdd()
      showSuccess(copy.action.saved)
      await this.load()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'page') {
      this.onCloseAdd()
      this.setData({ failure: view })
    } else if (view?.kind === 'fields') {
      this.setData({ fields: view.fields, formError: view.message })
    } else if (view) this.setData({ formError: messageOf(view) })
  },
  async onEnabled(event: KindEvent<boolean>): Promise<void> {
    const { kind, id } = event.currentTarget.dataset
    const result = await request(contract.updateMethod, {
      params: { id },
      body: { enabled: event.detail },
    })
    if (result.ok) this.patchSection(kind, { error: '' })
    else {
      const view = failureOf(result.failure, 'submit')
      if (view?.kind === 'page') this.setData({ failure: view })
      else if (view) this.patchSection(kind, { error: messageOf(view) })
    }
    await this.load()
  },
  onFailureAction() {
    void this.load()
  },
})
