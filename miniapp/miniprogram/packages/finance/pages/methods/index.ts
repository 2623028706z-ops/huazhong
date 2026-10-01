// F9 收付款方式（06 章 F9）：两个分区（收款方式、付款方式）；每行名称 + 启用开关（最后一种启用的不能关，后端拦）；
// 每份下面「新增」输入框 +「添加」。报错写在对应分区里
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
import { newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'

interface Section {
  kind: MethodKind
  title: string
  rows: PaymentMethod[]
  newName: string
  error: string
}

// 每个分区一次「添加」一个幂等键，成功后换新的
const addKeys = new Map<MethodKind, string>()

type KindEvent<T> = DetailEvent<T, { kind: MethodKind; id: string }>

function sectionsOf(methods: readonly PaymentMethod[], previous: readonly Section[]): Section[] {
  return methodKinds.map((kind) => {
    const old = previous.find((section) => section.kind === kind)
    return {
      kind,
      title: labels.methodKind[kind],
      rows: methods.filter((method) => method.kind === kind),
      newName: old?.newName ?? '',
      error: old?.error ?? '',
    }
  })
}

Page({
  data: {
    title: copy.screen.title.methods,
    loaded: false,
    failure: null as FailureView | null,
    sections: [] as Section[],
    busy: '',
    texts: { newMethod: copy.screen.label.newMethod, add: copy.screen.action.add },
  },
  onShow() {
    void this.load()
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
  keyOf(kind: MethodKind): string {
    const key = addKeys.get(kind) ?? newIdempotencyKey()
    addKeys.set(kind, key)
    return key
  },
  async settle(kind: MethodKind, result: Result<PaymentMethod>, patch: Partial<Section>) {
    this.setData({ busy: '' })
    if (result.ok) {
      this.patchSection(kind, { ...patch, error: '' })
      await this.load()
      return true
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'page') this.setData({ failure: view })
    else if (view) {
      const message = messageOf(view)
      this.patchSection(kind, { error: message })
      await this.load()
    }
    return false
  },
  onNewName(event: KindEvent<string>) {
    this.patchSection(event.currentTarget.dataset.kind, { newName: event.detail, error: '' })
  },
  async onAdd(event: KindEvent<unknown>): Promise<void> {
    const { kind } = event.currentTarget.dataset
    const name = this.data.sections.find((s) => s.kind === kind)?.newName ?? ''
    this.setData({ busy: kind })
    const result = await request(
      contract.createMethod,
      { body: { kind, name } },
      { idempotencyKey: this.keyOf(kind) },
    )
    if (await this.settle(kind, result, { newName: '' })) addKeys.delete(kind)
  },
  async onEnabled(event: KindEvent<boolean>): Promise<void> {
    const { kind, id } = event.currentTarget.dataset
    const result = await request(contract.updateMethod, {
      params: { id },
      body: { enabled: event.detail },
    })
    await this.settle(kind, result, {})
  },
  onFailureAction() {
    void this.load()
  },
})
