// X6 售后详情（06 章 X6）：状态区（已处理时 notice）→ 单号、状态、来源 → 客户门店、原订单 → 售后产品 →
// 售后金额 → 处理说明 → 原因行。底部「关闭售后」（closeAfter）、「作废售后」（voidAfter）走原因弹层，
// 「处理售后」（processAfter）进 X7
import { contract, copy, type AfterDetail } from '@huazhong/shared'
import { buttonsOf, isReasonRequired, type ButtonView } from '../../../../core/actions'
import type { CodeEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unwatchOnLeave, watchNewer } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { afterStaffProgress } from '../../../../views/progress'
import { afterInfoOf, afterLinesOf, afterReasonsOf } from '../../../../views/after'

type SheetCode = 'closeAfter' | 'voidAfter'

const buttonSpecs = [
  { code: 'closeAfter', secondary: true },
  { code: 'voidAfter', secondary: true },
  { code: 'processAfter' },
] as const

const sheetTexts: Record<SheetCode, { title: string; confirm: string; done: string }> = {
  closeAfter: {
    title: copy.screen.action.closeAfter,
    confirm: copy.screen.action.confirmClose,
    done: copy.after.closed,
  },
  voidAfter: {
    title: copy.screen.action.voidAfter,
    confirm: copy.screen.action.confirmVoid,
    done: copy.after.voided,
  },
}

const NO_SHEET = '' as SheetCode | ''

function viewOf(after: AfterDetail) {
  return {
    progress: afterStaffProgress(after),
    info: {
      title: copy.org.store(after.customerName, after.storeName),
      statusKind: 'afterStatus',
      status: after.status,
      rows: afterInfoOf(after),
      cols: true,
    },
    linesHeading: copy.screen.section.afterLines,
    lines: afterLinesOf(after, true),
    reason: afterReasonsOf(after),
    notice: after.notice ?? after.lockedReason ?? '',
  }
}

Page({
  ...unwatchOnLeave,
  data: {
    title: copy.screen.title.afterDetail,
    loaded: false,
    failure: null as FailureView | null,
    realtime: '',
    view: null as ReturnType<typeof viewOf> | null,
    buttons: [] as ButtonView[],
    busy: '',
    sheetCode: NO_SHEET,
    sheetTitle: '',
    sheetConfirm: '',
    sheetRequired: false,
    sheetError: '',
  },
  id: '',
  financeScope: false,
  readonlyScope: false,
  after: null as AfterDetail | null,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.financeScope = query.scope === 'finance'
    this.readonlyScope = query.scope === 'internal'
  },
  onShow() {
    void this.load()
    watchNewer(
      this,
      `after:${this.id}`,
      () => this.after?.version,
      () => void this.load(true),
    )
  },
  async load(pushed = false) {
    const result = await request(this.financeScope ? contract.getFinanceAfter : contract.getAfter, {
      params: { id: this.id },
    })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.show(result.data)
    if (pushed) this.setData({ realtime: copy.screen.realtime.refreshed })
  },
  show(after: AfterDetail) {
    this.after = after
    this.setData({
      loaded: true,
      failure: null,
      view: viewOf(after),
      buttons: this.readonlyScope ? [] : buttonsOf(after.actions, buttonSpecs),
    })
  },
  onAction(event: CodeEvent) {
    const after = this.after
    if (!after) return
    const { code } = event.currentTarget.dataset
    if (code === 'processAfter') {
      void wx.navigateTo({
        url: `/packages/sales/pages/after-form/index?mode=process&id=${after.id}`,
      })
      return
    }
    if (code !== 'closeAfter' && code !== 'voidAfter') return
    this.setData({
      sheetCode: code,
      sheetTitle: sheetTexts[code].title,
      sheetConfirm: sheetTexts[code].confirm,
      sheetRequired: isReasonRequired(after.actions, code),
      sheetError: '',
    })
  },
  onCloseSheet() {
    this.setData({ sheetCode: '' })
  },
  async onSubmitSheet(event: DetailEvent<string>): Promise<void> {
    const after = this.after
    const code = this.data.sheetCode
    if (!after || !code) return
    this.setData({ busy: code, sheetError: '' })
    const endpoint = code === 'closeAfter' ? contract.closeAfter : contract.voidAfter
    const input = {
      params: { id: after.id },
      body: { version: after.version, reason: event.detail },
    }
    const result = await request(endpoint, input)
    this.setData({ busy: '' })
    if (result.ok) {
      this.show(result.data)
      this.setData({ sheetCode: '' })
      showSuccess(sheetTexts[code].done)
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'stale') this.show(view.latest as AfterDetail)
    const message = messageOf(view)
    this.setData({ sheetError: message })
  },
  onFailureAction() {
    void this.load()
  },
})
