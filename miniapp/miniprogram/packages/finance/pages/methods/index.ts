// F9 收付款方式（06 章 F9）：一份列表，每行名称 + 启用开关（最后一种启用的不能关，后端拦，报错写在列表上方）；
// 列表下面「新增方式」打开弹层，填名称后「保存方式」，报错写在弹层里
// 2026-10-03 确认：收付款方式合并成一份
import { contract, copy, type PaymentMethod } from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { checkedOf, unplacedErrorOf } from '../../../../core/form'
import { syncUnloadAlert } from '../../../../core/guard'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { pullToRefresh } from '../../../../core/live'

type IdEvent<T> = DetailEvent<T, { id: string }>

Page({
  ...pullToRefresh,
  // 一次打开弹层一个幂等键，网络失败后重试用同一个
  idempotencyKey: '',
  data: {
    title: copy.screen.title.methods,
    addTitle: copy.screen.title.addMethod,
    loaded: false,
    failure: null as FailureView | null,
    rows: [] as PaymentMethod[],
    listError: '',
    adding: false,
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
    const result = await request(contract.listMethods)
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.setData({ loaded: true, failure: null, rows: result.data.items })
  },
  onOpenAdd() {
    this.idempotencyKey = newIdempotencyKey()
    this.setData({ adding: true, newName: '', fields: {}, formError: '' })
  },
  onCloseAdd() {
    this.setData({ adding: false })
    syncUnloadAlert(false)
  },
  onNewName(event: DetailEvent<string>) {
    this.setData({ newName: event.detail, fields: {}, formError: '' })
    syncUnloadAlert(event.detail !== '')
  },
  async onSave(): Promise<void> {
    const checked = checkedOf(contract.createMethod.body.safeParse({ name: this.data.newName }))
    if (!checked.ok) {
      this.setData({ fields: checked.fields, formError: unplacedErrorOf(checked.fields, ['name']) })
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
      this.setData({ fields: view.fields, formError: unplacedErrorOf(view.fields, ['name']) })
    } else if (view) this.setData({ formError: messageOf(view) })
  },
  async onEnabled(event: IdEvent<boolean>): Promise<void> {
    const { id } = event.currentTarget.dataset
    const result = await request(contract.updateMethod, {
      params: { id },
      body: { enabled: event.detail },
    })
    if (result.ok) this.setData({ listError: '' })
    else {
      const view = failureOf(result.failure, 'submit')
      if (view?.kind === 'page') this.setData({ failure: view })
      else if (view) this.setData({ listError: messageOf(view) })
    }
    await this.load()
  },
  onFailureAction() {
    void this.load()
  },
})
